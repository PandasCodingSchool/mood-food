import AsyncStorage from '@react-native-async-storage/async-storage';

// Today's mood check-in (1.1): persisted locally so every recommendation
// request in the session can carry real state instead of hardcoded defaults.

export type Occasion = 'treat' | 'fuel' | 'reward';

export interface MoodCheckin {
  energy: number; // 1-10
  stress: number; // 1-10
  hunger: number; // 1-10
  social: number; // 1-10 (1 = solo night, 10 = big group)
  occasion?: Occasion;
  day: string; // YYYY-MM-DD
}

const KEY = 'moodfood_mood_checkin';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayCheckin(): Promise<MoodCheckin | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const checkin: MoodCheckin = JSON.parse(raw);
    return checkin.day === today() ? checkin : null;
  } catch {
    return null;
  }
}

export async function saveTodayCheckin(
  values: Omit<MoodCheckin, 'day'>,
): Promise<MoodCheckin> {
  const checkin: MoodCheckin = { ...values, day: today() };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(checkin));
  } catch {
    // in-memory fallback is fine for one session
  }
  return checkin;
}

export async function hasCheckedInToday(): Promise<boolean> {
  return (await getTodayCheckin()) !== null;
}
