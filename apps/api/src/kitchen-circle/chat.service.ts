import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { fail } from '../common/http.js';
import { DB, type Database, ENV, REDIS } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import { householdMembers, householdRules, households, mealPlans, mealSlots, memberFoodPreferences, plannerActionProposals, plannerMessages, recipes, recipeVersions, users } from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { decide, messageShape, type ChatAction } from './chat-policy.js';
import { GroceryService } from './grocery.service.js';
import { KitchenCircleService } from './kitchen-circle.service.js';
import { PlannerService } from './planner.service.js';
import { RecipeAssistService } from './recipe-assist.service.js';
import { say, withProgress } from './progress.js';

const PROGRESS_TTL_S = 300;
const progressKey = (householdId: string, userId: string, clientId: string) => `kc:chat:progress:${householdId}:${userId}:${clientId}`;

interface InterpretResponse {
  actions: ChatAction[];
  clarification: { question: string; options: Array<{ label: string; actions: ChatAction[] }> } | null;
  reply: string;
  source: 'rules' | 'llm' | 'agent' | 'none';
}

type Proposal = typeof plannerActionProposals.$inferSelect;
const PENDING_TTL_MS = 24 * 60 * 60 * 1_000;
const weekdayOf = (value: string) => (new Date(`${value}T00:00:00.000Z`).getUTCDay() + 6) % 7;

function localDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * Shared planner chat. The intelligence service only interprets messages into typed actions; this service
 * applies the confirmation policy and executes accepted actions through the same services the app uses,
 * so chat can never bypass a permission, lock, or validation rule.
 */
@Injectable()
export class ChatService {
  private readonly log = new Logger('KitchenCircleChat');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
    private readonly kitchenCircle: KitchenCircleService,
    private readonly planner: PlannerService,
    private readonly groceries: GroceryService,
    private readonly assist: RecipeAssistService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Live steps for a message the app is waiting on ("Writing the recipe…"), oldest first; `done` once the reply is posted. */
  async progress(userId: string, householdId: string, clientId: string, after = 0) {
    await this.chatMember(householdId, userId);
    const rows = await this.redis.lrange(progressKey(householdId, userId, clientId), after, -1);
    const events = rows.map((row) => JSON.parse(row) as { text: string; at: number });
    const done = events.some((e) => e.text === '__done__');
    return { events: events.filter((e) => e.text !== '__done__'), next: after + rows.length, done };
  }

  private reporter(householdId: string, userId: string, clientId?: string) {
    if (!clientId) return () => undefined;
    const key = progressKey(householdId, userId, clientId);
    let last = '';
    return (text: string) => {
      if (!text || text === last) return;
      last = text;
      // Fire and forget: ioredis keeps commands in order on one connection, and progress must never slow the turn.
      void this.redis.multi().rpush(key, JSON.stringify({ text, at: Date.now() })).expire(key, PROGRESS_TTL_S).exec().catch(() => undefined);
    };
  }

  /** Chat is for owners and members; cook views never show it. */
  private async chatMember(householdId: string, userId: string) {
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    if (member.role === 'cook') fail(403, 'The household chat is not available to cooks.');
    return member;
  }

  async messages(userId: string, householdId: string, planId?: string) {
    await this.chatMember(householdId, userId);
    const filters = [eq(plannerMessages.householdId, householdId)];
    if (planId) filters.push(eq(plannerMessages.planId, planId));
    const rows = (await this.db.select({ message: plannerMessages, authorName: users.name }).from(plannerMessages)
      .leftJoin(users, eq(users.id, plannerMessages.authorUserId))
      .where(and(...filters)).orderBy(desc(plannerMessages.createdAt)).limit(60)).reverse();
    const ids = rows.map((row) => row.message.id);
    const actions = ids.length
      ? await this.db.select().from(plannerActionProposals).where(inArray(plannerActionProposals.messageId, ids)).orderBy(asc(plannerActionProposals.createdAt))
      : [];
    return rows.map(({ message, authorName }) => ({ ...message, authorName, actions: actions.filter((action) => action.messageId === message.id) }));
  }

  /** Stores the member's message, interprets it, applies the policy, and posts an assistant summary. */
  async send(userId: string, householdId: string, input: { planId: string; body: string; clientId?: string }) {
    const report = this.reporter(householdId, userId, input.clientId);
    try {
      return await withProgress(report, () => this.handle(userId, householdId, input));
    } finally {
      report('__done__');
    }
  }

  /** A voice message: transcribe it (the agent's name and recipe titles as hints), then handle the words exactly like a typed message. */
  async sendVoice(userId: string, householdId: string, input: { planId: string; audio: string; mimeType: string; seconds?: number; clientId?: string }) {
    const report = this.reporter(householdId, userId, input.clientId);
    try {
      return await withProgress(report, async () => {
        await this.chatMember(householdId, userId);
        say('Listening to your message');
        const titles = (await this.planner.candidateRecipes(householdId)).map((r) => r.title);
        let heard: { success: boolean; text?: string; error?: string };
        try {
          heard = await this.intelligence.json('POST', '/api/kitchen-circle/chat/transcribe', {
            timeoutMs: 30_000, body: { audio_base64: input.audio, mime_type: input.mimeType, hints: ['Haldi', ...titles.slice(0, 60)], seconds: input.seconds },
          });
        } catch (err) {
          this.log.warn(`transcription unavailable: ${(err as Error).message}`);
          fail(503, 'Voice isn’t available right now. You can type instead.');
        }
        const text = heard.text?.trim();
        if (!heard.success || !text) fail(422, heard.error ?? 'I didn’t catch anything. Try again, a little closer to the phone.');
        say(`Heard: “${text.length > 120 ? `${text.slice(0, 117)}…` : text}”`);
        return { ...(await this.handle(userId, householdId, { planId: input.planId, body: text.slice(0, 1000) })), transcript: text };
      });
    } finally {
      report('__done__');
    }
  }

  private async handle(userId: string, householdId: string, input: { planId: string; body: string }) {
    await this.chatMember(householdId, userId);
    const [plan] = await this.db.select().from(mealPlans).where(and(eq(mealPlans.id, input.planId), eq(mealPlans.householdId, householdId))).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    // Read the open question before saving this message, so “the last turn” is still the assistant's.
    const pending = await this.openQuestion(householdId, userId);
    const [message] = await this.db.insert(plannerMessages).values({ householdId, planId: plan.id, authorUserId: userId, role: 'member', body: input.body }).returning();

    let interpretation: InterpretResponse | null = null;
    try {
      // This week and next: “Monday” means the next Monday even when the open plan is this week.
      const nextWeekStart = (() => { const d = new Date(`${plan.weekStart}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 7); return d.toISOString().slice(0, 10); })();
      const plans = await this.db.select({ id: mealPlans.id }).from(mealPlans)
        .where(and(eq(mealPlans.householdId, householdId), inArray(mealPlans.weekStart, [plan.weekStart, nextWeekStart])));
      const [slots, members, preferences, rules, recipes, recent] = await Promise.all([
        this.db.select().from(mealSlots).where(inArray(mealSlots.planId, plans.map((p) => p.id))).orderBy(asc(mealSlots.plannedFor)),
        this.db.select({ userId: householdMembers.userId, role: householdMembers.role }).from(householdMembers).where(eq(householdMembers.householdId, householdId)),
        this.db.select().from(memberFoodPreferences).where(eq(memberFoodPreferences.householdId, householdId)),
        this.db.select().from(householdRules).where(and(eq(householdRules.householdId, householdId), eq(householdRules.active, true))),
        this.planner.candidateRecipes(householdId),
        this.db.select({ id: plannerMessages.id, body: plannerMessages.body, role: plannerMessages.role }).from(plannerMessages)
          .where(eq(plannerMessages.householdId, householdId)).orderBy(desc(plannerMessages.createdAt)).limit(10),
      ]);
      const interpretBody = {
          message: input.body,
          today: localDate(household?.timezone ?? 'Asia/Kolkata'),
          member_count: members.length,
          days: slots.map((slot) => ({ slot_id: slot.id, planned_for: slot.plannedFor, weekday: weekdayOf(slot.plannedFor), state: slot.state, meal_title: slot.mealTitle })),
          // Full recipe detail so the agent can search and check fit; member ids are opaque and limits are never attributed in replies.
          recipes,
          members: members.map((m) => ({ user_id: m.userId, role: m.role,
            preferences: preferences.filter((p) => p.userId === m.userId).map((p) => ({ strength: p.strength, category: p.category, value: p.value })) })),
          rules: rules.map((rule) => ({ rule_id: rule.id, weekday: rule.weekday, strength: rule.strength, category: rule.category, constraint: rule.constraint })),
          recent: recent.filter((row) => row.id !== message.id).reverse().map((row) => ({ role: row.role, text: row.body.slice(0, 1000) })),
          pending: pending ? { question: pending.question, original: pending.original } : null,
        };
      // Streamed so the agent's steps ("Looking up pav bhaji…") reach the app live; plain JSON if the stream isn't available.
      interpretation = await this.intelligence.ndjson<InterpretResponse>('/api/kitchen-circle/chat/interpret/stream', { timeoutMs: this.env.AI_TIMEOUT_MS, body: interpretBody },
        (line) => { if (typeof line.progress === 'string') say(line.progress); })
        .catch((err: Error & { status?: number }) => {
          if (err.status !== 404) throw err;
          return this.intelligence.json<InterpretResponse>('POST', '/api/kitchen-circle/chat/interpret', { timeoutMs: this.env.AI_TIMEOUT_MS, body: interpretBody });
        });
    } catch (err) {
      this.log.warn(`chat interpret failed: ${(err as Error).message}`);
    }

    const cards: Proposal[] = [];
    let reply = 'I couldn’t work that out right now, so nothing was changed. You can still edit the plan directly.';
    // A new message answers (or moves on from) this member's open question: close it so it can't be tapped later.
    if (interpretation) {
      await this.db.update(plannerActionProposals).set({ status: 'rejected', policyNote: 'Answered in chat', resolvedByUserId: userId, resolvedAt: new Date() })
        .where(and(eq(plannerActionProposals.householdId, householdId), eq(plannerActionProposals.requestedByUserId, userId), eq(plannerActionProposals.status, 'needs_clarification')));
    }
    if (!interpretation) {
      // keep the “couldn't work that out” reply
    } else if (interpretation.clarification && interpretation.clarification.options.length) {
      const [card] = await this.db.insert(plannerActionProposals).values({
        householdId, planId: plan.id, messageId: message.id, requestedByUserId: userId, status: 'needs_clarification', policy: 'clarification',
        clarification: interpretation.clarification as unknown as Proposal['clarification'],
      }).returning();
      cards.push(card);
      reply = interpretation.clarification.question;
    } else if (interpretation.actions.length) {
      cards.push(...(await this.evaluate(userId, plan.id, householdId, message.id, interpretation.actions)));
      say('Writing the reply');
      reply = await this.compose(input.body, cards, this.summarize(cards, interpretation.reply), interpretation.source === 'agent' ? interpretation.reply : null);
    } else {
      reply = interpretation.reply;
    }
    const [assistant] = await this.db.insert(plannerMessages).values({ householdId, planId: plan.id, role: 'assistant', body: reply }).returning();
    return { message, assistant, actions: cards, source: interpretation?.source ?? 'none' };
  }

  /** This member's most recent unanswered question (last 30 minutes), with the message that prompted it. */
  private async openQuestion(householdId: string, userId: string) {
    const [card] = await this.db.select({ clarification: plannerActionProposals.clarification, body: plannerMessages.body, createdAt: plannerActionProposals.createdAt })
      .from(plannerActionProposals).innerJoin(plannerMessages, eq(plannerMessages.id, plannerActionProposals.messageId))
      .where(and(eq(plannerActionProposals.householdId, householdId), eq(plannerActionProposals.requestedByUserId, userId), eq(plannerActionProposals.status, 'needs_clarification')))
      .orderBy(desc(plannerActionProposals.createdAt)).limit(1);
    if (card?.clarification && Date.now() - card.createdAt.getTime() < 30 * 60_000) return { question: card.clarification.question, original: card.body };
    // Option-less questions aren't stored as cards: fall back to the last assistant turn if it asked something.
    const [last] = await this.db.select({ role: plannerMessages.role, body: plannerMessages.body, createdAt: plannerMessages.createdAt }).from(plannerMessages)
      .where(eq(plannerMessages.householdId, householdId)).orderBy(desc(plannerMessages.createdAt)).limit(1);
    const [prev] = await this.db.select({ body: plannerMessages.body }).from(plannerMessages)
      .where(and(eq(plannerMessages.householdId, householdId), eq(plannerMessages.authorUserId, userId))).orderBy(desc(plannerMessages.createdAt)).limit(1);
    if (last?.role === 'assistant' && last.body.trim().endsWith('?') && Date.now() - last.createdAt.getTime() < 30 * 60_000) return { question: last.body, original: prev?.body ?? '' };
    return null;
  }

  /** Applies the policy to a set of actions from one message, executing the ones that may apply now. */
  private async evaluate(userId: string, planId: string, householdId: string, messageId: string, incoming: ChatAction[]) {
    // Never ask twice: drop an action that's already waiting on a card for someone to confirm.
    const open = await this.db.select({ payload: plannerActionProposals.payload }).from(plannerActionProposals)
      .where(and(eq(plannerActionProposals.householdId, householdId), eq(plannerActionProposals.status, 'needs_confirmation')));
    const key = (a: Partial<ChatAction>) => JSON.stringify([a.type, a.slot_id ?? null, a.scope ?? null, a.weekday ?? null, a.recipe_version_id ?? null,
      a.state ?? null, a.servings ?? null, a.constraint ?? null, a.rule_id ?? null]);
    const waiting = new Set(open.map((row) => key(row.payload as Partial<ChatAction>)));
    const actions = incoming.filter((action) => !waiting.has(key(action)));
    const shape = messageShape(actions);
    const slotIds = actions.flatMap((action) => action.slot_id ? [action.slot_id] : []);
    const slots = slotIds.length
      ? (await this.db.select({ slot: mealSlots }).from(mealSlots).innerJoin(mealPlans, eq(mealPlans.id, mealSlots.planId))
        .where(and(inArray(mealSlots.id, slotIds), eq(mealPlans.householdId, householdId)))).map((row) => row.slot)
      : [];
    const cards: Proposal[] = [];
    for (const action of actions) {
      const slot = action.slot_id ? slots.find((item) => item.id === action.slot_id) : undefined;
      if (action.slot_id && !slot) {
        cards.push(await this.record({ householdId, planId, messageId, userId, action, status: 'rejected', policy: 'invalid', note: 'That day is not part of this plan.' }));
        continue;
      }
      let verdict = decide(action, { slotLocked: slot?.state === 'locked', dayEditsInMessage: shape.dayEditsInMessage, mealsOnSameDay: shape.mealsOnSameDay(action) });
      // Safety first: a recipe someone eating that day can't have never goes on the plan without a confirmation.
      let impactNote: string | null = null;
      if (action.type === 'SET_MEAL' && action.recipe_version_id && slot) {
        say('Checking allergies, diets and the grocery list');
        const impact = await this.assist.impact(userId, slot.id, action.recipe_version_id).catch(() => null);
        if (impact && !impact.safe) verdict = { decision: 'confirm', policy: 'hard_constraint', note: impact.warnings.join(' ') };
        impactNote = impact ? impact.summary.filter((line) => !impact.warnings.includes(line)).join(' ') : null;
      }
      if (verdict.decision === 'confirm') {
        cards.push(await this.record({ householdId, planId, messageId, userId, action, status: 'needs_confirmation', policy: verdict.policy, note: verdict.note, slotUpdatedAt: slot?.updatedAt }));
        continue;
      }
      const outcome = await this.run(userId, planId, householdId, action, false);
      cards.push(await this.record({
        householdId, planId, messageId, userId, action, status: outcome.ok ? 'applied' : 'failed', policy: verdict.policy,
        note: outcome.ok ? (impactNote ?? verdict.note) : outcome.error, result: outcome.result, resolvedBy: userId,
      }));
      // An AI recipe written for a day waits for a member to check it before it's planned.
      const draft = outcome.ok ? outcome.result as { recipeVersionId?: string; title?: string; warnings?: string[] } : null;
      if (action.type === 'CREATE_RECIPE' && slot && draft?.recipeVersionId) {
        const plan: ChatAction = {
          type: 'SET_MEAL', slot_id: slot.id, planned_for: slot.plannedFor, recipe_version_id: draft.recipeVersionId, meal_title: draft.title,
          summary: `${draft.title} on ${new Date(`${slot.plannedFor}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })}`,
        };
        cards.push(await this.record({
          householdId, planId, messageId, userId, action: plan, status: 'needs_confirmation', policy: 'ai_recipe_review', slotUpdatedAt: slot.updatedAt,
          note: ['AI-written recipe: check the ingredients and steps, then confirm to approve it and plan it.', ...(draft.warnings ?? [])].join(' '),
        }));
      }
    }
    return cards;
  }

  private async record(input: {
    householdId: string; planId: string; messageId: string; userId: string; action: ChatAction; status: Proposal['status']; policy: string;
    note: string | null; slotUpdatedAt?: Date; result?: Record<string, unknown>; resolvedBy?: string;
  }) {
    const [card] = await this.db.insert(plannerActionProposals).values({
      householdId: input.householdId, planId: input.planId, messageId: input.messageId, requestedByUserId: input.userId, actionType: input.action.type,
      payload: input.action as unknown as Record<string, unknown>, status: input.status, policy: input.policy, policyNote: input.note,
      slotUpdatedAt: input.slotUpdatedAt ?? null, result: input.result ?? null,
      resolvedByUserId: input.resolvedBy ?? null, resolvedAt: input.resolvedBy ? new Date() : null,
    }).returning();
    return card;
  }

  /**
   * Executes one action as `userId` through the regular services. A confirmed change to a locked day unlocks it
   * first. Meal and servings changes are re-locked afterwards; a day status or clear stays unlocked, because
   * `locked` is itself a day state and re-locking would hide the new status.
   */
  private async run(userId: string, planId: string, householdId: string, action: ChatAction, confirmedLockedDay: boolean): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string; result?: undefined }> {
    const slotId = action.slot_id ?? '';
    const unlockFirst = confirmedLockedDay && action.type !== 'UNLOCK_SLOT' && action.type !== 'LOCK_SLOT';
    const relock = unlockFirst && (action.type === 'SET_MEAL' || action.type === 'SET_SERVINGS');
    try {
      if (unlockFirst) await this.kitchenCircle.lockSlot(userId, slotId, false);
      let result: Record<string, unknown>;
      let succeeded = false;
      try {
        result = await this.perform(userId, planId, householdId, action);
        succeeded = true;
      } finally {
        // A failed change must never leave a locked day unlocked.
        if (relock || (unlockFirst && !succeeded)) await this.kitchenCircle.lockSlot(userId, slotId, true);
      }
      return { ok: true, result: unlockFirst ? { ...result, relocked: relock } : result };
    } catch (err) {
      if (err instanceof HttpException) {
        const body = err.getResponse() as { error?: string } | string;
        return { ok: false, error: typeof body === 'string' ? body : body.error ?? err.message };
      }
      this.log.error(`chat action ${action.type} failed: ${(err as Error).message}`);
      return { ok: false, error: 'Something went wrong applying this change.' };
    }
  }

  private async perform(userId: string, planId: string, householdId: string, action: ChatAction): Promise<Record<string, unknown>> {
    const slotId = action.slot_id ?? '';
    switch (action.type) {
      case 'SET_MEAL': {
        if (action.recipe_version_id) {
          // Confirming an AI draft's review card approves it first (structure is re-validated there).
          const [draft] = await this.db.select({ approvedAt: recipeVersions.approvedAt, source: recipes.source }).from(recipeVersions)
            .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId)).where(eq(recipeVersions.id, action.recipe_version_id)).limit(1);
          if (draft && !draft.approvedAt && draft.source === 'ai_draft') await this.kitchenCircle.approveRecipeVersion(userId, householdId, action.recipe_version_id);
          await this.kitchenCircle.selectRecipeForSlot(userId, slotId, action.recipe_version_id);
          if (action.servings) await this.kitchenCircle.updateSlot(userId, slotId, { servings: action.servings });
        } else {
          await this.kitchenCircle.updateSlot(userId, slotId, { state: 'planned', mealTitle: action.meal_title ?? null, ...(action.servings ? { servings: action.servings } : {}) });
        }
        return { slotId };
      }
      case 'CREATE_RECIPE': {
        const created = await this.assist.generate(userId, householdId, { dish: action.dish ?? action.meal_title ?? 'Recipe' });
        return { recipeId: created.recipe.id, recipeVersionId: created.version.id, title: created.recipe.title, warnings: created.warnings };
      }
      case 'CLEAR_DAY':
        await this.kitchenCircle.updateSlot(userId, slotId, { state: 'blank', mealTitle: null });
        return { slotId };
      case 'SET_DAY_STATUS':
        await this.kitchenCircle.updateSlot(userId, slotId, { state: action.state ?? 'blank', mealTitle: null });
        return { slotId };
      case 'SET_SERVINGS':
        await this.kitchenCircle.updateSlot(userId, slotId, { servings: action.servings ?? 1 });
        return { slotId };
      case 'SET_ATTENDANCE':
        await this.kitchenCircle.setAttendance(userId, slotId, action.status ?? 'absent');
        return { slotId };
      case 'LOCK_SLOT':
      case 'UNLOCK_SLOT':
        await this.kitchenCircle.lockSlot(userId, slotId, action.type === 'LOCK_SLOT');
        return { slotId };
      case 'CREATE_RECURRING_RULE': {
        const [plan] = action.this_week_only ? await this.db.select().from(mealPlans).where(eq(mealPlans.id, planId)).limit(1) : [];
        const rule = await this.kitchenCircle.createRule(userId, householdId, {
          weekday: action.weekday ?? undefined, strength: action.strength ?? 'hard', category: action.category ?? 'diet', constraint: action.constraint ?? {},
          appliesToWeekStart: plan?.weekStart ?? null,
        });
        return { ruleId: rule.id };
      }
      case 'UPDATE_RECURRING_RULE': {
        if (!action.rule_id) fail(422, 'No rule was chosen.');
        await this.kitchenCircle.updateRule(userId, householdId, action.rule_id, { active: action.active ?? false });
        return { ruleId: action.rule_id };
      }
      case 'REQUEST_AUTOFILL': {
        say('Planning meals for the open days');
        const proposal = await this.planner.autofill(userId, planId, {});
        return { proposalId: proposal.id, days: proposal.items.length };
      }
      case 'CREATE_GROCERY_SNAPSHOT': {
        say('Building the grocery list');
        const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
        const list = await this.groceries.createSnapshot(userId, householdId, {
          planId, scope: action.scope === 'day' ? 'day' : 'week', date: action.scope === 'day' ? action.planned_for ?? undefined : undefined,
          referenceDate: localDate(household?.timezone ?? 'Asia/Kolkata'),
        });
        return { snapshotId: list.snapshot.id };
      }
      default:
        fail(422, 'This action is not supported.');
    }
  }

  /** The assistant's reply, written by the cheapest model from what actually happened; the static summary if that's unavailable. */
  private async compose(said: string, cards: Proposal[], fallback: string, draft: string | null): Promise<string> {
    try {
      const out = await this.intelligence.json<{ reply: string; source: string }>('POST', '/api/kitchen-circle/chat/reply', {
        timeoutMs: 20_000,
        body: {
          message: said.slice(0, 1000), fallback: fallback.slice(0, 1200), draft: draft?.slice(0, 600) ?? null,
          outcomes: cards.slice(0, 20).map((card) => ({
            summary: String((card.payload as { summary?: string }).summary ?? card.actionType ?? '').slice(0, 300) || 'change',
            status: card.status, policy: card.policy, note: card.policyNote?.slice(0, 600) ?? null,
          })),
        },
      });
      return out.reply?.trim() || fallback;
    } catch (err) {
      this.log.warn(`chat reply composer failed: ${(err as Error).message}`);
      return fallback;
    }
  }

  private summarize(cards: Proposal[], fallback: string) {
    const label = (card: Proposal) => String((card.payload as { summary?: string }).summary ?? card.actionType);
    const parts: string[] = [];
    const done = cards.filter((card) => card.status === 'applied');
    const pending = cards.filter((card) => card.status === 'needs_confirmation');
    const failed = cards.filter((card) => card.status === 'failed' || card.status === 'rejected');
    // An AI recipe reads as what happened, not as two action labels.
    const written = done.find((card) => card.actionType === 'CREATE_RECIPE');
    if (written) {
      const title = String((written.result as { title?: string } | null)?.title ?? 'that dish');
      const review = pending.find((card) => card.policy === 'ai_recipe_review');
      const day = (review?.payload as { planned_for?: string } | undefined)?.planned_for;
      const when = day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' }) : null;
      parts.push(review && when ? `I wrote a recipe for ${title}. Check the ingredients and steps, then tap Approve & plan to put it on ${when}.`
        : `I wrote a recipe for ${title}. It's in Recipes as a draft for you to check.`);
      done.splice(done.indexOf(written), 1);
      if (review) pending.splice(pending.indexOf(review), 1);
    }
    if (done.length) parts.push(`Done: ${done.map(label).join('; ')}.`);
    if (pending.length) parts.push(`Needs confirmation: ${pending.map(label).join('; ')}.`);
    if (failed.length) parts.push(`Couldn’t do: ${failed.map((card) => `${label(card)} (${card.policyNote})`).join('; ')}.`);
    return parts.join(' ') || fallback;
  }

  private async card(userId: string, actionId: string) {
    const [card] = await this.db.select().from(plannerActionProposals).where(eq(plannerActionProposals.id, actionId)).limit(1);
    if (!card) fail(404, 'Action not found.');
    await this.chatMember(card.householdId, userId);
    return card;
  }

  private async announce(card: Proposal, userId: string, text: string) {
    const [user] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    await this.db.insert(plannerMessages).values({ householdId: card.householdId, planId: card.planId, role: 'assistant', body: `${text} — ${user?.name ?? 'a member'}` });
  }

  /** A member confirms a pending card. It expires if the day changed since, or after 24 hours. */
  async confirm(userId: string, actionId: string) {
    const card = await this.card(userId, actionId);
    if (card.status !== 'needs_confirmation') fail(409, `This action was already ${card.status.replace('_', ' ')}.`);
    if (!card.planId) fail(409, 'The plan for this action no longer exists.');
    const action = card.payload as unknown as ChatAction;
    const [slot] = action.slot_id ? await this.db.select().from(mealSlots).where(eq(mealSlots.id, action.slot_id)).limit(1) : [];
    const changed = card.slotUpdatedAt && (!slot || slot.updatedAt.getTime() !== card.slotUpdatedAt.getTime());
    if (changed || Date.now() - card.createdAt.getTime() > PENDING_TTL_MS) {
      const [expired] = await this.db.update(plannerActionProposals).set({ status: 'expired', policyNote: changed ? 'The day changed after this was suggested, so it was not applied.' : 'This suggestion expired.', resolvedByUserId: userId, resolvedAt: new Date() })
        .where(eq(plannerActionProposals.id, card.id)).returning();
      return { action: expired };
    }
    const outcome = await this.run(userId, card.planId, card.householdId, action, slot?.state === 'locked');
    const [updated] = await this.db.update(plannerActionProposals).set({
      status: outcome.ok ? 'confirmed' : 'failed', result: outcome.ok ? outcome.result : null, policyNote: outcome.ok ? card.policyNote : outcome.error,
      resolvedByUserId: userId, resolvedAt: new Date(),
    }).where(eq(plannerActionProposals.id, card.id)).returning();
    await this.announce(card, userId, outcome.ok ? `Confirmed: ${action.summary ?? action.type}` : `Couldn’t apply: ${action.summary ?? action.type} (${outcome.error})`);
    return { action: updated };
  }

  async reject(userId: string, actionId: string) {
    const card = await this.card(userId, actionId);
    if (card.status !== 'needs_confirmation' && card.status !== 'needs_clarification') fail(409, `This action was already ${card.status.replace('_', ' ')}.`);
    const [updated] = await this.db.update(plannerActionProposals).set({ status: 'rejected', resolvedByUserId: userId, resolvedAt: new Date() })
      .where(eq(plannerActionProposals.id, card.id)).returning();
    const summary = (card.payload as { summary?: string }).summary ?? card.clarification?.question ?? 'suggestion';
    await this.announce(card, userId, `Dismissed: ${summary}`);
    return { action: updated };
  }

  /** Answers a clarification. Only the sender can answer, since the question is about what they meant. */
  async clarify(userId: string, actionId: string, optionIndex: number) {
    const card = await this.card(userId, actionId);
    if (card.status !== 'needs_clarification' || !card.clarification) fail(409, 'This question was already answered.');
    if (card.requestedByUserId !== userId) fail(403, 'Only the person who sent the message can answer this question.');
    if (!card.planId) fail(409, 'The plan for this action no longer exists.');
    const option = card.clarification.options[optionIndex];
    if (!option) fail(422, 'Choose one of the offered answers.');
    await this.db.update(plannerActionProposals).set({ status: 'confirmed', result: { option: option.label }, resolvedByUserId: userId, resolvedAt: new Date() })
      .where(eq(plannerActionProposals.id, card.id));
    const cards = option.actions.length
      ? await this.evaluate(userId, card.planId, card.householdId, card.messageId, option.actions as unknown as ChatAction[])
      : [];
    const reply = cards.length
      ? await this.compose(option.label, cards, this.summarize(cards, option.label), null)
      : `Okay — ${option.label.toLowerCase()}. Nothing was changed.`;
    await this.db.insert(plannerMessages).values({ householdId: card.householdId, planId: card.planId, role: 'assistant', body: reply });
    return { actions: cards, reply };
  }
}
