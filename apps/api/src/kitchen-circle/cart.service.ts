import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database, ENV } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import {
  groceryCartProposals, grocerySnapshotLines, grocerySnapshots, householdDeliverySettings, householdMembers, households,
  memberFoodPreferences, plannerActivities,
} from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { SwiggyTokensService } from '../swiggy/swiggy-tokens.service.js';

type CartProposal = typeof groceryCartProposals.$inferSelect;

interface PreviewResponse {
  provider: 'fixture' | 'instamart';
  lines: Array<{ line_id: string; status: string; product?: { packs: Array<{ spin_id: string; sku_id?: string | null; count: number }> } | null } & Record<string, unknown>>;
  totals: Record<string, unknown> & { estimated_cost: number; over_cap: boolean; below_minimum: boolean };
  warnings: string[];
}

/**
 * Phase 7 carts. Pack matching/optimization lives in the intelligence service; this service decides who may do
 * what and when. Rollout gates: fixture catalogue by default → read-only live matching
 * (KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED) → owner-only live cart writes and checkout
 * (KITCHEN_CIRCLE_LIVE_WRITES_ENABLED). V1 uses the owner's linked Instamart account and owner-set address.
 * There is no automatic checkout.
 */
@Injectable()
export class CartService {
  private readonly log = new Logger('KitchenCircleCart');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
    private readonly tokens: SwiggyTokensService,
  ) {}

  private async member(householdId: string, userId: string) {
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    if (member.role === 'cook') fail(403, 'Cooks cannot see grocery carts or prices.');
    return member;
  }

  private async owner(householdId: string, userId: string) {
    const member = await this.member(householdId, userId);
    if (member.role !== 'owner') fail(403, 'Only the household owner can change the live cart or place the order.');
    return member;
  }

  private async ownerToken(householdId: string) {
    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    if (!household) fail(404, 'KitchenCircle household not found.');
    return { ownerUserId: household.ownerUserId, token: await this.tokens.activeToken(household.ownerUserId) };
  }

  private call<T>(path: string, body: unknown, token: string | null, ownerUserId: string, timeoutMs = this.env.SWIGGY_TIMEOUT_MS) {
    return this.intelligence.json<T>(body === undefined ? 'GET' : 'POST', path, {
      body, timeoutMs, swiggyToken: token,
      onTokenRejected: token ? () => this.tokens.discardRejected(ownerUserId, token) : undefined,
    });
  }

  /** What this household can do right now, so the app shows only the actions that will work. */
  async capabilities(userId: string, householdId: string) {
    const member = await this.member(householdId, userId);
    const { token } = await this.ownerToken(householdId);
    const [delivery] = await this.db.select().from(householdDeliverySettings).where(eq(householdDeliverySettings.householdId, householdId)).limit(1);
    return {
      role: member.role,
      liveGrocery: this.env.KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED,
      liveWrites: this.env.KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED && this.env.KITCHEN_CIRCLE_LIVE_WRITES_ENABLED,
      ownerLinked: Boolean(token),
      address: delivery ? { id: delivery.addressId, label: delivery.addressLabel } : null,
    };
  }

  async addresses(userId: string, householdId: string) {
    await this.owner(householdId, userId);
    if (!this.env.KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED) fail(409, 'Live Instamart is turned off for KitchenCircle.');
    const { token, ownerUserId } = await this.ownerToken(householdId);
    if (!token) fail(409, 'Link your Swiggy account to use Instamart.');
    const res = await this.call<{ success: boolean; addresses: Array<{ id: string; label: string; tag?: string | null }>; error?: string }>('/api/kitchen-circle/cart/addresses', undefined, token, ownerUserId);
    if (!res.success) fail(502, res.error ?? 'Could not load your Instamart addresses.');
    return res.addresses;
  }

  async setAddress(userId: string, householdId: string, input: { addressId: string; label: string }) {
    await this.owner(householdId, userId);
    const [row] = await this.db.insert(householdDeliverySettings).values({ householdId, addressId: input.addressId, addressLabel: input.label, setByUserId: userId })
      .onConflictDoUpdate({ target: householdDeliverySettings.householdId, set: { addressId: input.addressId, addressLabel: input.label, setByUserId: userId, updatedAt: new Date() } })
      .returning();
    await this.db.insert(plannerActivities).values({ householdId, actorUserId: userId, eventType: 'delivery_address_set', after: { label: input.label } });
    return row;
  }

  /**
   * Read-only, pack-optimized cart for a grocery list. Any owner/member may build one. Uses live Instamart only when
   * enabled and the owner is linked with an address; otherwise the clearly labelled sample catalogue.
   */
  async preview(userId: string, snapshotId: string, input: { scope?: 'buy_now' | 'all' }) {
    const [snapshot] = await this.db.select().from(grocerySnapshots).where(eq(grocerySnapshots.id, snapshotId)).limit(1);
    if (!snapshot) fail(404, 'Grocery list not found.');
    await this.member(snapshot.householdId, userId);
    if (snapshot.status === 'discarded') fail(409, 'This grocery list was discarded.');
    const scope = input.scope ?? (snapshot.freshnessMode === 'split' ? 'buy_now' : 'all');
    const lines = (await this.db.select().from(grocerySnapshotLines).where(eq(grocerySnapshotLines.snapshotId, snapshotId)))
      .filter((line) => line.status === 'buy' && (scope === 'all' || snapshot.freshnessMode === 'all_now' || line.freshnessGroup === 'buy_now'));
    if (!lines.length) fail(422, 'Nothing on this list is marked to buy.');

    const { token, ownerUserId } = await this.ownerToken(snapshot.householdId);
    const [delivery] = await this.db.select().from(householdDeliverySettings).where(eq(householdDeliverySettings.householdId, snapshot.householdId)).limit(1);
    const live = this.env.KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED && Boolean(token) && Boolean(delivery);
    const brandPrefs = await this.db.select().from(memberFoodPreferences)
      .where(and(eq(memberFoodPreferences.householdId, snapshot.householdId), eq(memberFoodPreferences.category, 'brand')));

    const result = await this.call<PreviewResponse>('/api/kitchen-circle/cart/preview', {
      provider: live ? 'instamart' : 'fixture',
      address_id: live ? delivery!.addressId : null,
      lines: lines.map((line) => ({
        line_id: line.id, name: line.displayName, canonical_name: line.canonicalName, quantity: line.quantity, unit: line.unit,
        dimension: line.dimension, base_quantity: line.baseQuantity, freshness_group: line.freshnessGroup, kind: line.kind,
      })),
      preferences: {
        prefer_brands: brandPrefs.filter((p) => p.strength === 'favourite').map((p) => p.value),
        avoid_brands: brandPrefs.filter((p) => p.strength === 'never_plan' || p.strength === 'cannot_eat').map((p) => p.value),
      },
    }, live ? token : null, ownerUserId).catch((err: Error) => {
      this.log.warn(`cart preview failed: ${err.message}`);
      fail(503, 'Cart matching is unavailable right now. Your grocery list is unchanged.');
    });

    const items = result.lines.flatMap((line) => line.status === 'matched' && line.product
      ? line.product.packs.map((pack) => ({ spin_id: pack.spin_id, sku_id: pack.sku_id ?? null, quantity: pack.count }))
      : []);
    const id = await this.db.transaction(async (tx) => {
      await tx.update(groceryCartProposals).set({ status: 'superseded', updatedAt: new Date() })
        .where(and(eq(groceryCartProposals.snapshotId, snapshotId), eq(groceryCartProposals.status, 'preview')));
      const [row] = await tx.insert(groceryCartProposals).values({
        householdId: snapshot.householdId, snapshotId, provider: result.provider, addressId: live ? delivery!.addressId : null, scope,
        lines: result.lines as Array<Record<string, unknown>>, totals: result.totals, warnings: result.warnings, items, createdByUserId: userId,
      }).returning();
      await tx.insert(plannerActivities).values({
        householdId: snapshot.householdId, planId: snapshot.planId, actorUserId: userId, eventType: 'cart_previewed',
        after: { cartId: row.id, snapshotId, provider: result.provider, estimatedCost: result.totals.estimated_cost },
      });
      return row.id;
    });
    return this.view(userId, id);
  }

  async view(userId: string, cartId: string) {
    const [cart] = await this.db.select().from(groceryCartProposals).where(eq(groceryCartProposals.id, cartId)).limit(1);
    if (!cart) fail(404, 'Cart not found.');
    await this.member(cart.householdId, userId);
    return { cart, capabilities: await this.capabilities(userId, cart.householdId) };
  }

  async latest(userId: string, snapshotId: string) {
    const [snapshot] = await this.db.select().from(grocerySnapshots).where(eq(grocerySnapshots.id, snapshotId)).limit(1);
    if (!snapshot) fail(404, 'Grocery list not found.');
    await this.member(snapshot.householdId, userId);
    const [cart] = await this.db.select().from(groceryCartProposals).where(eq(groceryCartProposals.snapshotId, snapshotId))
      .orderBy(desc(groceryCartProposals.createdAt)).limit(1);
    return cart ? this.view(userId, cart.id) : { cart: null, capabilities: await this.capabilities(userId, snapshot.householdId) };
  }

  /** Guards shared by live writes: owner, both flags, a live preview of a finalized list, owner still linked. */
  private async liveGuard(userId: string, cartId: string, expected: CartProposal['status'][]) {
    const [cart] = await this.db.select().from(groceryCartProposals).where(eq(groceryCartProposals.id, cartId)).limit(1);
    if (!cart) fail(404, 'Cart not found.');
    await this.owner(cart.householdId, userId);
    if (!this.env.KITCHEN_CIRCLE_LIVE_GROCERY_ENABLED || !this.env.KITCHEN_CIRCLE_LIVE_WRITES_ENABLED) fail(409, 'Live Instamart ordering is turned off for KitchenCircle.');
    if (cart.provider !== 'instamart' || !cart.addressId) fail(409, 'This cart uses sample prices. Set a delivery address and build a live cart first.');
    if (!expected.includes(cart.status)) fail(409, `This cart is ${cart.status.replace('_', ' ')}.`);
    const [snapshot] = await this.db.select().from(grocerySnapshots).where(eq(grocerySnapshots.id, cart.snapshotId)).limit(1);
    if (snapshot?.status !== 'finalized') fail(409, 'Finalize the grocery list before sending it to Instamart.');
    const { token, ownerUserId } = await this.ownerToken(cart.householdId);
    if (!token) fail(409, 'Link your Swiggy account to use Instamart.');
    return { cart, token, ownerUserId, snapshot };
  }

  /** Owner-only: replaces the owner's Instamart cart with exactly this proposal's packs. */
  async writeCart(userId: string, cartId: string) {
    const { cart, token, ownerUserId, snapshot } = await this.liveGuard(userId, cartId, ['preview', 'cart_written']);
    if (!cart.items.length) fail(422, 'Nothing in this cart matched a product.');
    const result = await this.call<{ success: boolean; total?: number | null; error?: string | null } & Record<string, unknown>>(
      '/api/kitchen-circle/cart/write', { address_id: cart.addressId, items: cart.items }, token, ownerUserId,
    );
    const [updated] = await this.db.update(groceryCartProposals).set({
      status: result.success ? 'cart_written' : 'failed', cart: result, cartWrittenByUserId: userId, cartWrittenAt: new Date(), updatedAt: new Date(),
    }).where(eq(groceryCartProposals.id, cart.id)).returning();
    await this.db.insert(plannerActivities).values({
      householdId: cart.householdId, planId: snapshot!.planId, actorUserId: userId, eventType: 'cart_written', after: { cartId, success: result.success, total: result.total ?? null },
    });
    if (!result.success) fail(502, result.error ?? 'Instamart did not accept the cart.');
    return { cart: updated };
  }

  /**
   * Owner-only checkout of the written cart. Requires explicit confirmation and the total the owner saw: if the live
   * cart total has moved, nothing is placed and the owner must review again.
   */
  async checkout(userId: string, cartId: string, input: { confirm: boolean; expectedTotal: number; paymentMethod?: 'Cash' | 'COD' | 'SwiggyPay' }) {
    if (!input.confirm) fail(422, 'Confirm the order before placing it.');
    const { cart, token, ownerUserId, snapshot } = await this.liveGuard(userId, cartId, ['cart_written']);
    const written = (cart.cart ?? {}) as { total?: number | null };
    if (written.total == null || Math.abs(Number(written.total) - input.expectedTotal) > 0.5) {
      fail(409, 'The cart total changed since you reviewed it. Refresh the cart and confirm again.');
    }
    const result = await this.call<{ success: boolean; order_id?: string | null; paas_id?: string | null; status?: string | null; pending_payment?: boolean; message?: string | null; error?: string | null; cap_exceeded?: boolean; below_minimum?: boolean }>(
      '/api/kitchen-circle/cart/checkout',
      { address_id: cart.addressId, payment_method: input.paymentMethod ?? null, confirmed: true },
      token, ownerUserId,
    );
    const status: CartProposal['status'] = !result.success ? 'failed' : result.pending_payment ? 'payment_pending' : 'ordered';
    const [updated] = await this.db.update(groceryCartProposals).set({
      status: result.success ? status : 'cart_written', order: result, orderedByUserId: result.success ? userId : null, orderedAt: result.success ? new Date() : null, updatedAt: new Date(),
    }).where(eq(groceryCartProposals.id, cart.id)).returning();
    await this.db.insert(plannerActivities).values({
      householdId: cart.householdId, planId: snapshot!.planId, actorUserId: userId, eventType: result.success ? 'order_placed' : 'order_failed',
      after: { cartId, orderId: result.order_id ?? null, status: result.status ?? null, paymentMethod: input.paymentMethod ?? null },
    });
    if (!result.success) fail(result.cap_exceeded || result.below_minimum ? 422 : 502, result.error ?? 'Instamart could not place the order.');
    return { cart: updated };
  }

  /** Owner-only: refresh a pending UPI payment. */
  async paymentStatus(userId: string, cartId: string) {
    const { cart, token, ownerUserId } = await this.liveGuard(userId, cartId, ['payment_pending']);
    const order = (cart.order ?? {}) as { paas_id?: string; order_id?: string };
    if (!order.paas_id || !order.order_id) fail(409, 'This order has no pending payment.');
    const result = await this.call<{ success: boolean; status?: string | null; error?: string | null }>('/api/kitchen-circle/cart/payment-status', { paas_id: order.paas_id, order_id: order.order_id }, token, ownerUserId);
    const paid = result.success && /success|paid|confirmed|placed/i.test(result.status ?? '');
    const failed = result.success && /fail|cancel|refund/i.test(result.status ?? '');
    const [updated] = await this.db.update(groceryCartProposals).set({
      status: paid ? 'ordered' : failed ? 'failed' : 'payment_pending', order: { ...cart.order, payment_status: result.status ?? null }, updatedAt: new Date(),
    }).where(eq(groceryCartProposals.id, cart.id)).returning();
    return { cart: updated, paymentStatus: result.status ?? null };
  }
}
