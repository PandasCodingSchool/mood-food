// Today's mood check-in (1.1) — persisted in localStorage so the gate only
// fires once/day per browser.

export type Occasion = "treat" | "fuel" | "reward";

export interface MoodCheckin {
  energy: number;
  stress: number;
  hunger: number;
  social: number;
  occasion?: Occasion;
  day: string; // YYYY-MM-DD
}

const KEY = "moodfood_mood_checkin";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTodayCheckin(): MoodCheckin | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const checkin: MoodCheckin = JSON.parse(raw);
    return checkin.day === today() ? checkin : null;
  } catch {
    return null;
  }
}

export function saveTodayCheckin(values: Omit<MoodCheckin, "day">): MoodCheckin {
  const checkin: MoodCheckin = { ...values, day: today() };
  try {
    localStorage.setItem(KEY, JSON.stringify(checkin));
  } catch {
    // in-memory session is fine as a fallback
  }
  return checkin;
}

export function hasCheckedInToday(): boolean {
  return getTodayCheckin() !== null;
}
