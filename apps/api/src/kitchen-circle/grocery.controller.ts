import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { parseDateOnly } from './calendar.js';
import { GroceryService } from './grocery.service.js';

const dateOnly = z.string().refine((value) => {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}, 'Expected a valid YYYY-MM-DD date');

const householdId = z.uuid();
const snapshotId = z.uuid();
const paise = z.number().int().min(0).max(100_000_000);
const createSnapshotBody = z.object({
  planId: z.uuid(),
  scope: z.enum(['week', 'day']).default('week'),
  date: dateOnly.optional(),
  referenceDate: dateOnly,
  override: z.boolean().optional(),
  budgetPaise: paise.optional(),
  freshnessMode: z.enum(['split', 'all_now']).optional(),
});
const updateSnapshotBody = z
  .object({ budgetPaise: paise.nullable().optional(), freshnessMode: z.enum(['split', 'all_now']).optional() })
  .refine((body) => Object.keys(body).length > 0, 'No changes supplied');
const updateLineBody = z
  .object({
    status: z.enum(['buy', 'skipped', 'already_have']).optional(),
    quantity: z.number().positive().max(100_000).optional(),
    unit: z.string().trim().min(1).max(30).optional(),
    productNote: z.string().trim().max(255).nullable().optional(),
    estimatedPricePaise: paise.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'No changes supplied');
const manualLineBody = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100_000).optional(),
  unit: z.string().trim().min(1).max(30).optional(),
  productNote: z.string().trim().max(255).optional(),
});
const pantryBody = z.object({ name: z.string().trim().min(1).max(120), inPantry: z.boolean() });
const listQuery = z.object({ planId: z.uuid().optional() });

/** Phase 4 grocery requirements. Read-only with respect to any grocery provider: nothing here writes to Instamart. */
@Controller('kitchen-circle')
export class GroceryController {
  constructor(private readonly groceries: GroceryService) {}

  @Get('households/:id/pantry')
  async pantry(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string) {
    return { success: true, pantry: await this.groceries.getPantry(user.id, id) };
  }

  @Put('households/:id/pantry')
  async setPantryItem(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: pantryBody }) body: z.infer<typeof pantryBody>) {
    return { success: true, pantry: await this.groceries.setPantryItem(user.id, id, body.name, body.inPantry) };
  }

  @Get('households/:id/grocery-lists')
  async list(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Query({ schema: listQuery }) query: z.infer<typeof listQuery>) {
    return { success: true, lists: await this.groceries.listSnapshots(user.id, id, query.planId) };
  }

  @Post('households/:id/grocery-lists')
  async create(@CurrentUser() user: AuthUser, @Param('id', { schema: householdId }) id: string, @Body({ schema: createSnapshotBody }) body: z.infer<typeof createSnapshotBody>) {
    return { success: true, ...(await this.groceries.createSnapshot(user.id, id, body)) };
  }

  @Get('grocery-lists/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', { schema: snapshotId }) id: string) {
    return { success: true, ...(await this.groceries.getSnapshot(user.id, id)) };
  }

  @Patch('grocery-lists/:id')
  async update(@CurrentUser() user: AuthUser, @Param('id', { schema: snapshotId }) id: string, @Body({ schema: updateSnapshotBody }) body: z.infer<typeof updateSnapshotBody>) {
    return { success: true, ...(await this.groceries.updateSnapshot(user.id, id, body)) };
  }

  @Post('grocery-lists/:id/lines')
  async addLine(@CurrentUser() user: AuthUser, @Param('id', { schema: snapshotId }) id: string, @Body({ schema: manualLineBody }) body: z.infer<typeof manualLineBody>) {
    return { success: true, line: await this.groceries.addManualLine(user.id, id, body) };
  }

  @Patch('grocery-lists/:id/lines/:lineId')
  async updateLine(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: snapshotId }) id: string,
    @Param('lineId', { schema: z.uuid() }) lineId: string,
    @Body({ schema: updateLineBody }) body: z.infer<typeof updateLineBody>,
  ) {
    return { success: true, ...(await this.groceries.updateLine(user.id, id, lineId, body)) };
  }

  @Post('grocery-lists/:id/finalize')
  async finalize(@CurrentUser() user: AuthUser, @Param('id', { schema: snapshotId }) id: string) {
    return { success: true, ...(await this.groceries.finalize(user.id, id)) };
  }

  @Post('grocery-lists/:id/discard')
  async discard(@CurrentUser() user: AuthUser, @Param('id', { schema: snapshotId }) id: string) {
    return { success: true, ...(await this.groceries.discard(user.id, id)) };
  }
}
