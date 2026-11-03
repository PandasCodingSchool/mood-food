import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { KitchenCircleEnabledGuard } from './feature.guard.js';
import { CartService } from './cart.service.js';

const id = z.uuid();
const previewBody = z.object({ scope: z.enum(['buy_now', 'all']).optional() });
const addressBody = z.object({ addressId: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(255) });
// V1 supports pay-on-delivery and Swiggy Money. UPI needs the intent/bridge URL flow, which the shared
// Instamart checkout response does not carry yet.
const checkoutBody = z.object({
  confirm: z.literal(true),
  expectedTotal: z.number().min(0).max(1_000_000),
  paymentMethod: z.enum(['Cash', 'COD', 'SwiggyPay']).optional(),
});

/** Phase 7 carts: members review; the owner alone writes the live cart and places the order. */
@UseGuards(KitchenCircleEnabledGuard)
@Controller('kitchen-circle')
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get('households/:id/cart-capabilities')
  async capabilities(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, capabilities: await this.carts.capabilities(user.id, householdId) };
  }

  @Get('households/:id/delivery-addresses')
  async addresses(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string) {
    return { success: true, addresses: await this.carts.addresses(user.id, householdId) };
  }

  @Put('households/:id/delivery-address')
  async setAddress(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) householdId: string, @Body({ schema: addressBody }) body: z.infer<typeof addressBody>) {
    return { success: true, delivery: await this.carts.setAddress(user.id, householdId, body) };
  }

  @Get('grocery-lists/:id/cart')
  async latest(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) listId: string) {
    return { success: true, ...(await this.carts.latest(user.id, listId)) };
  }

  @Post('grocery-lists/:id/cart')
  async preview(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) listId: string, @Body({ schema: previewBody }) body: z.infer<typeof previewBody>) {
    return { success: true, ...(await this.carts.preview(user.id, listId, body)) };
  }

  @Post('carts/:id/write')
  async write(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) cartId: string) {
    return { success: true, ...(await this.carts.writeCart(user.id, cartId)) };
  }

  @Post('carts/:id/checkout')
  async checkout(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) cartId: string, @Body({ schema: checkoutBody }) body: z.infer<typeof checkoutBody>) {
    return { success: true, ...(await this.carts.checkout(user.id, cartId, body)) };
  }

  @Post('carts/:id/payment-status')
  async paymentStatus(@CurrentUser() user: AuthUser, @Param('id', { schema: id }) cartId: string) {
    return { success: true, ...(await this.carts.paymentStatus(user.id, cartId)) };
  }
}
