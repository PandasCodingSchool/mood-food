import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.guard.js';
import type { AuthUser } from '../auth/auth.types.js';
import { DB, type Database } from '../core/tokens.js';
import { userPreferences } from '../db/schema.js';

const list = z.array(z.string().max(100)).max(50).catch([]);
const prefsBody = z.object({
  diets: list,
  allergies: list,
  cuisines: list,
  budget: z.number().int().min(0).max(10).catch(1),
});

@Controller('user/preferences')
export class PreferencesController {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async read(userId: string) {
    const row = await this.db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) });
    return {
      success: true,
      preferences: row
        ? { diets: row.diets, allergies: row.allergies, cuisines: row.cuisines, budget: row.budget }
        : { diets: [], allergies: [], cuisines: [], budget: 1 },
    };
  }

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.read(user.id);
  }

  @Put()
  async put(@CurrentUser() user: AuthUser, @Body({ schema: prefsBody }) body: z.infer<typeof prefsBody>) {
    await this.db
      .insert(userPreferences)
      .values({ userId: user.id, ...body })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { ...body, updatedAt: sql`now()` } });
    return this.read(user.id);
  }
}
