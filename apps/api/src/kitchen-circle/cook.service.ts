import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { fail } from '../common/http.js';
import type { Redis } from 'ioredis';
import { DB, type Database, ENV, REDIS } from '../core/tokens.js';
import type { Env } from '../config/env.js';
import {
  cookLinks, cookTranslations, householdMemberSettings, householdMembers, households, mealPlans, mealSlots, plannerActivities, recipes, recipeVersions,
} from '../db/schema.js';
import { IntelligenceService } from '../intelligence/intelligence.service.js';
import { speechText, type SpeechPart } from './speech.js';

const SPEECH_TTL_S = 30 * 86_400;
const SPEECH_VERSION = 'v1';

export const COOK_LANGUAGES = ['en', 'hi', 'hinglish', 'mr', 'ta', 'te', 'bn', 'kn'] as const;
export type CookLanguage = (typeof COOK_LANGUAGES)[number];

const TRANSLATION_VERSION = 'v1';
const MAX_LINK_DAYS = 14;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const weekdayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
const round = (value: number) => Math.round(value * 100) / 100;

function localDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

interface CookMealSource { key: string; title: string; ingredients: Array<{ name: string; unit: string }>; steps: string[] }
interface TranslatedMeal extends CookMealSource { translated: boolean }

/**
 * Phase 8 cook experience. The cook payload is built from an allow-list of fields — meal, servings, scaled
 * ingredients, method, timings — so chat, preferences, attendance names, addresses, prices, payments and orders
 * can never leak into it. Translation changes words only; quantities always come from canonical recipe data.
 */
@Injectable()
export class CookService {
  private readonly log = new Logger('KitchenCircleCook');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly intelligence: IntelligenceService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Read-aloud from a cook link: the words come from that link's own view, never from the caller. */
  async speakForLink(token: string, input: { date: string; part: SpeechPart; index?: number; language?: CookLanguage }) {
    const [link] = await this.db.select().from(cookLinks).where(eq(cookLinks.tokenHash, sha256(token))).limit(1);
    if (!link || link.revokedAt || link.expiresAt <= new Date()) fail(404, 'This cook link has expired or was turned off. Ask the household for a new one.');
    const language = input.language ?? (link.language as CookLanguage);
    const view = await this.build(link.householdId, link.planId, link.slotId, language, link.transliterate, 'app');
    return this.speak(view, input, language);
  }

  /** Read-aloud in the in-app cook week (cooks and members). */
  async speakForMember(userId: string, householdId: string, input: { date: string; part: SpeechPart; index?: number; language?: CookLanguage }) {
    const view = await this.cookWeek(userId, householdId, { language: input.language });
    return this.speak(view, input, view.language as CookLanguage);
  }

  /** Cached audio by fingerprint (language + exact words): a repeat listen never calls the model. */
  private async speak(view: { days: Array<{ date: string; cooking: boolean; title: string | null; servings: number; ingredients: Array<{ name: string; quantity: number | null; unit: string; optional: boolean }>; steps: string[] }> },
    input: { date: string; part: SpeechPart; index?: number }, language: CookLanguage) {
    const day = view.days.find((d) => d.date === input.date && d.cooking);
    const text = day ? speechText(day, language, input.part, input.index ?? 0) : null;
    if (!text) fail(404, 'There’s nothing to read for that day.');
    const key = sha256([SPEECH_VERSION, language, text].join('|'));
    const cacheKey = `kc:speech:${key}`;
    if (!(await this.redis.exists(cacheKey))) {
      let out: { success: boolean; audio_base64?: string; error?: string };
      try {
        out = await this.intelligence.json('POST', '/api/kitchen-circle/speak', { timeoutMs: 30_000, body: { text, language } });
      } catch (err) {
        this.log.warn(`read-aloud unavailable: ${(err as Error).message}`);
        fail(503, 'Read-aloud isn’t available right now.');
      }
      if (!out.success || !out.audio_base64) fail(503, out.error ?? 'Read-aloud isn’t available right now.');
      await this.redis.set(cacheKey, Buffer.from(out.audio_base64, 'base64'), 'EX', SPEECH_TTL_S);
    }
    return { url: `/kitchen-circle/speech/${key}`, text };
  }

  /** The cached mp3 for a fingerprint (public: the key is unguessable and only ever made from a view the caller could read). */
  async speechAudio(key: string): Promise<Buffer> {
    const audio = await this.redis.getBuffer(`kc:speech:${key}`);
    if (!audio) fail(404, 'That recording has expired. Tap listen again.');
    return audio;
  }

  private async member(householdId: string, userId: string) {
    const [member] = await this.db.select().from(householdMembers)
      .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId))).limit(1);
    if (!member) fail(403, 'You are not a member of this KitchenCircle household.');
    return member;
  }

  /** Owners and members share a day or the remaining week with their cook. The token is returned once. */
  async createLink(userId: string, householdId: string, input: { planId: string; slotId?: string; language: CookLanguage; transliterate?: boolean; expiresInDays?: number }) {
    const member = await this.member(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cooks cannot create cook links.');
    const [plan] = await this.db.select().from(mealPlans).where(and(eq(mealPlans.id, input.planId), eq(mealPlans.householdId, householdId))).limit(1);
    if (!plan) fail(404, 'KitchenCircle plan not found.');
    if (input.slotId) {
      const [slot] = await this.db.select().from(mealSlots).where(and(eq(mealSlots.id, input.slotId), eq(mealSlots.planId, plan.id))).limit(1);
      if (!slot) fail(404, 'That day is not part of this plan.');
    }
    // Never outlive the week it describes (plus a day of grace), and never more than two weeks.
    const weekEnd = new Date(`${plan.weekEnd}T23:59:59Z`).getTime() + 24 * 60 * 60 * 1_000;
    const expiresAt = new Date(Math.min(Date.now() + Math.min(input.expiresInDays ?? 7, MAX_LINK_DAYS) * 86_400_000, weekEnd));
    const token = randomBytes(24).toString('base64url');
    const [link] = await this.db.insert(cookLinks).values({
      householdId, planId: plan.id, slotId: input.slotId ?? null, tokenHash: sha256(token), language: input.language,
      transliterate: Boolean(input.transliterate), createdByUserId: userId, expiresAt,
    }).returning();
    await this.db.insert(plannerActivities).values({ householdId, planId: plan.id, slotId: input.slotId ?? null, actorUserId: userId, eventType: 'cook_link_created', after: { linkId: link.id, language: input.language, scope: input.slotId ? 'day' : 'week' } });
    const path = `/cook/${token}`;
    return { link: this.linkView(link), path, url: `${this.env.FRONTEND_ORIGIN.replace(/\/$/, '')}${path}` };
  }

  private linkView(link: typeof cookLinks.$inferSelect) {
    const { tokenHash: _hash, ...rest } = link;
    return { ...rest, active: !link.revokedAt && link.expiresAt > new Date() };
  }

  async listLinks(userId: string, householdId: string) {
    const member = await this.member(householdId, userId);
    if (member.role === 'cook') fail(403, 'Cooks cannot manage cook links.');
    const rows = await this.db.select().from(cookLinks).where(eq(cookLinks.householdId, householdId)).orderBy(desc(cookLinks.createdAt)).limit(50);
    return rows.map((row) => this.linkView(row));
  }

  async revokeLink(userId: string, linkId: string) {
    const [link] = await this.db.select().from(cookLinks).where(eq(cookLinks.id, linkId)).limit(1);
    if (!link) fail(404, 'Cook link not found.');
    const member = await this.member(link.householdId, userId);
    if (member.role === 'cook') fail(403, 'Cooks cannot manage cook links.');
    const [revoked] = await this.db.update(cookLinks).set({ revokedAt: link.revokedAt ?? new Date() }).where(eq(cookLinks.id, linkId)).returning();
    await this.db.insert(plannerActivities).values({ householdId: link.householdId, planId: link.planId, actorUserId: userId, eventType: 'cook_link_revoked', after: { linkId } });
    return this.linkView(revoked);
  }

  /** Public, token-only view for the cook's phone browser. */
  async publicView(token: string, input: { language?: CookLanguage; transliterate?: boolean }) {
    const [link] = await this.db.select().from(cookLinks).where(eq(cookLinks.tokenHash, sha256(token))).limit(1);
    if (!link || link.revokedAt || link.expiresAt <= new Date()) fail(404, 'This cook link has expired or was turned off. Ask the household for a new one.');
    await this.db.update(cookLinks).set({ lastViewedAt: new Date(), viewCount: link.viewCount + 1 }).where(eq(cookLinks.id, link.id));
    return this.build(link.householdId, link.planId, link.slotId, input.language ?? (link.language as CookLanguage), input.transliterate ?? link.transliterate, 'link');
  }

  /** Cook-role (and any member) in-app view: the rest of the current cooking week, read-only. */
  async cookWeek(userId: string, householdId: string, input: { language?: CookLanguage; transliterate?: boolean }) {
    await this.member(householdId, userId);
    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    const today = localDate(household?.timezone ?? 'Asia/Kolkata');
    const [plan] = await this.db.select().from(mealPlans)
      .where(and(eq(mealPlans.householdId, householdId), gte(mealPlans.weekEnd, today))).orderBy(asc(mealPlans.weekStart)).limit(1);
    if (!plan) return { household: { name: household?.name ?? '' }, language: input.language ?? 'en', transliterate: false, translation: 'not_needed', days: [] };
    const [settings] = await this.db.select().from(householdMemberSettings)
      .where(and(eq(householdMemberSettings.householdId, householdId), eq(householdMemberSettings.userId, userId))).limit(1);
    return this.build(householdId, plan.id, null, input.language ?? (settings?.cookLanguage as CookLanguage) ?? 'en', input.transliterate ?? settings?.cookTransliterate ?? false, 'app');
  }

  private async build(householdId: string, planId: string, slotId: string | null, language: CookLanguage, transliterate: boolean, via: 'link' | 'app') {
    const [household] = await this.db.select().from(households).where(eq(households.id, householdId)).limit(1);
    const today = localDate(household?.timezone ?? 'Asia/Kolkata');
    const rows = await this.db.select({ slot: mealSlots, version: recipeVersions, recipeTitle: recipes.title })
      .from(mealSlots)
      .leftJoin(recipeVersions, eq(recipeVersions.id, mealSlots.recipeVersionId))
      .leftJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .where(and(eq(mealSlots.planId, planId), slotId ? eq(mealSlots.id, slotId) : gte(mealSlots.plannedFor, today)))
      .orderBy(asc(mealSlots.plannedFor));

    const days = rows.map(({ slot, version, recipeTitle }) => {
      const cooking = slot.state === 'planned' || (slot.state === 'locked' && Boolean(slot.mealTitle));
      const scale = version ? slot.servings / version.defaultServings : 1;
      return {
        date: slot.plannedFor,
        weekday: weekdayName(slot.plannedFor),
        today: slot.plannedFor === today,
        cooking,
        status: cooking ? 'cook' : slot.state === 'blank' ? 'not_planned' : slot.state,
        title: cooking ? (recipeTitle ?? slot.mealTitle) : null,
        servings: slot.servings,
        key: version ? `${version.id}` : `slot:${slot.id}:${slot.mealTitle ?? ''}`,
        ingredients: cooking && version ? version.ingredients.map((i) => ({
          name: i.name, quantity: i.unit === 'to taste' ? null : round(i.quantity * scale), unit: i.unit, optional: Boolean(i.optional),
        })) : [],
        steps: cooking && version ? version.steps : [],
        prepMinutes: cooking ? version?.prepMinutes ?? null : null,
        cookMinutes: cooking ? version?.cookMinutes ?? null : null,
      };
    });

    const sources: CookMealSource[] = days.filter((d) => d.cooking && d.title).map((d) => ({
      key: d.key, title: d.title!, ingredients: d.ingredients.map((i) => ({ name: i.name, unit: i.unit })), steps: d.steps,
    }));
    const { meals, status } = await this.translate(householdId, planId, sources, language, transliterate);
    const byKey = new Map(meals.map((m) => [m.key, m]));
    if (via === 'link') {
      await this.db.insert(plannerActivities).values({ householdId, planId, eventType: 'cook_link_viewed', after: { language, transliterate, translation: status } });
    }
    return {
      household: { name: household?.name ?? '' },
      language, transliterate, translation: status,
      days: days.map(({ key, ...day }) => {
        const t = byKey.get(key);
        if (!day.cooking || !t) return day;
        return {
          ...day, title: t.title,
          // Words from the translation, numbers from canonical data — position by position.
          ingredients: day.ingredients.map((ing, index) => ({ ...ing, name: t.ingredients[index]?.name ?? ing.name, unit: t.ingredients[index]?.unit ?? ing.unit })),
          steps: t.steps.length === day.steps.length ? t.steps : day.steps,
        };
      }),
    };
  }

  /** Cache-first translation; a miss calls the intelligence service once, and only successes are cached. */
  private async translate(householdId: string, planId: string, sources: CookMealSource[], language: CookLanguage, transliterate: boolean): Promise<{ meals: TranslatedMeal[]; status: string }> {
    if (language === 'en' || !sources.length) return { meals: sources.map((s) => ({ ...s, translated: false })), status: 'not_needed' };
    const keyOf = (s: CookMealSource) => sha256([TRANSLATION_VERSION, language, transliterate ? 'latin' : 'native', s.key, s.title, JSON.stringify(s.ingredients), JSON.stringify(s.steps)].join('|'));
    const keys = sources.map(keyOf);
    const cached = await this.db.select().from(cookTranslations).where(inArray(cookTranslations.cacheKey, keys));
    const hit = new Map(cached.map((row) => [row.cacheKey, row.payload as unknown as TranslatedMeal]));
    const missing = sources.filter((s, i) => !hit.has(keys[i]));
    let fresh: TranslatedMeal[] = [];
    let failed = false;
    if (missing.length) {
      try {
        const res = await this.intelligence.json<{ meals: TranslatedMeal[]; status: string }>('POST', '/api/kitchen-circle/cook/translate', {
          timeoutMs: this.env.AI_TIMEOUT_MS, body: { language, transliterate, meals: missing },
        });
        fresh = res.meals;
        const good = fresh.filter((m) => m.translated);
        if (good.length) {
          await this.db.insert(cookTranslations).values(good.map((m) => ({
            cacheKey: keyOf(missing.find((s) => s.key === m.key)!), language, transliterate, payload: m as unknown as Record<string, unknown>,
          }))).onConflictDoNothing();
        }
        failed = good.length < missing.length;
      } catch (err) {
        this.log.warn(`cook translation unavailable: ${(err as Error).message}`);
        failed = true;
      }
    }
    if (failed) await this.db.insert(plannerActivities).values({ householdId, planId, eventType: 'translation_failed', after: { language, transliterate, meals: missing.length } });
    const freshByKey = new Map(fresh.map((m) => [m.key, m]));
    const meals = sources.map((s, i) => hit.get(keys[i]) ?? freshByKey.get(s.key) ?? { ...s, translated: false });
    const translated = meals.filter((m) => m.translated).length;
    return { meals, status: translated === meals.length ? 'ok' : translated ? 'partial' : 'fallback' };
  }

  async settings(userId: string, householdId: string) {
    await this.member(householdId, userId);
    const [row] = await this.db.select().from(householdMemberSettings)
      .where(and(eq(householdMemberSettings.householdId, householdId), eq(householdMemberSettings.userId, userId))).limit(1);
    return row ?? { householdId, userId, notifyChanges: true, notifyWeekend: true, notifyTodayMeal: false, cookLanguage: 'en', cookTransliterate: false };
  }

  async updateSettings(userId: string, householdId: string, input: Partial<{ notifyChanges: boolean; notifyWeekend: boolean; notifyTodayMeal: boolean; cookLanguage: CookLanguage; cookTransliterate: boolean }>) {
    await this.member(householdId, userId);
    const [row] = await this.db.insert(householdMemberSettings).values({ householdId, userId, ...input })
      .onConflictDoUpdate({ target: [householdMemberSettings.householdId, householdMemberSettings.userId], set: { ...input, updatedAt: new Date() } }).returning();
    return row;
  }
}

