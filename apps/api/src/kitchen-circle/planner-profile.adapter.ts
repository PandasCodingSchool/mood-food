import { Inject, Injectable } from '@nestjs/common';
import { fail } from '../common/http.js';
import type { Env } from '../config/env.js';
import { eq } from 'drizzle-orm';
import { DB, type Database, ENV } from '../core/tokens.js';
import { userPreferences } from '../db/schema.js';

/** Permissioned one-way adapter: returns only the caller's opted-in preference labels, never orders or history. */
@Injectable()
export class PlannerProfileAdapter {
  constructor(@Inject(DB) private readonly db: Database, @Inject(ENV) private readonly env: Env) {}

  async eligiblePreferences(userId: string) {
    // Standalone readiness: KitchenCircle must work with the MoodFood profile switched off entirely.
    if (!this.env.KITCHEN_CIRCLE_MOODFOOD_PROFILE_ENABLED) fail(409, 'Importing from your MoodFood profile is turned off.');
    const [source] = await this.db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    if (!source) return [] as Array<{ strength: 'cannot_eat' | 'favourite'; category: string; value: string }>;
    return [
      ...source.allergies.map((value) => ({ strength: 'cannot_eat' as const, category: 'allergy', value })),
      ...source.diets.map((value) => ({ strength: 'cannot_eat' as const, category: 'diet', value })),
      ...source.cuisines.map((value) => ({ strength: 'favourite' as const, category: 'cuisine', value })),
    ];
  }
}
