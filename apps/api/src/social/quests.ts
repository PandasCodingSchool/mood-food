/** Quest catalogue, upserted by key at boot. */
export const QUEST_DEFINITIONS = [
  { key: 'try_3_cuisines', title: 'Try 3 new cuisines', description: "Order from three cuisines you haven't picked before", target: 3 },
  { key: 'mood_streak_7', title: '7-day mood streak', description: 'Check in your mood seven days running', target: 7 },
  { key: 'adventure_score', title: 'Beat your adventurousness score', description: 'Say yes to a wildcard pick', target: 1 },
] as const;

export const yesterdayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export interface QuestProgress {
  count?: number;
  lastCheckinDate?: string;
}

/**
 * Next progress for a quest. Counting quests add `increment`; the daily streak
 * quest's progress is the current streak length (same day = no change,
 * yesterday = +1, gap = reset to 1).
 */
export function nextProgress(
  key: string,
  existing: { progress: QuestProgress; streakCount: number } | null,
  increment: number,
  today: string,
) {
  const count = existing?.progress.count ?? 0;
  let streak = existing?.streakCount ?? 0;
  if (key !== 'mood_streak_7') return { count: count + increment, streak, lastCheckinDate: existing?.progress.lastCheckinDate };

  const last = existing?.progress.lastCheckinDate;
  if (!existing || !last) streak = existing ? Math.min(count, 7) || 1 : 1;
  else if (last === today) streak = existing.streakCount;
  else if (last === yesterdayOf(today)) streak = existing.streakCount + 1;
  else streak = 1;
  return { count: streak, streak, lastCheckinDate: today };
}
