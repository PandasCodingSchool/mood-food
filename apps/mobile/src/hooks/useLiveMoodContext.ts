import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { timeOfDayForHour, type Mood, type TimeOfDay, type Weather } from '@moodfood/tokens';
import { API_BASE_URL } from '../services/apiBase';
import { getTodayCheckin, type MoodCheckin } from '../services/moodState';

export interface LiveMoodContext {
  time: TimeOfDay;
  weather: Weather;
  mood: Mood;
  /** °C when known. */
  temperature: number | null;
  /** True once weather has been resolved (or given up on). */
  ready: boolean;
}

const DEFAULT_WEATHER: Weather = 'cloudy';
const DEFAULT_MOOD: Mood = 'happy';

/**
 * Maps /api/weather's coarse buckets onto the four theme weathers.
 * The backend folds thunderstorms into "rainy", so "stormy" can't be detected yet.
 */
export function toThemeWeather(apiWeather: string | undefined): Weather {
  switch (apiWeather) {
    case 'rainy':
      return 'rainy';
    case 'sunny':
    case 'hot':
      return 'sunny';
    default:
      return DEFAULT_WEATHER;
  }
}

/** Today's check-in (1-10 scales) → theme mood. Mirrors derive() in the 2.0 design. */
export function moodFromCheckin(c: Pick<MoodCheckin, 'energy' | 'stress' | 'social' | 'occasion'>): Mood {
  if (c.stress >= 7) return 'stressed';
  if (c.energy <= 4) return 'tired';
  if (c.energy >= 7 && (c.social >= 7 || c.occasion === 'treat')) return 'adventurous';
  return 'happy';
}

async function fetchWeather(): Promise<{ weather: Weather; temperature: number | null } | null> {
  // Never prompts here; onboarding owns the permission ask.
  const perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos =
    (await Location.getLastKnownPositionAsync()) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
  const { latitude, longitude } = pos.coords;
  const res = await fetch(`${API_BASE_URL}/weather?lat=${latitude.toFixed(3)}&lon=${longitude.toFixed(3)}`);
  const data = await res.json();
  if (!data?.success) return null;
  return { weather: toThemeWeather(data.weather), temperature: data.temperature_c ?? null };
}

/** Real time, weather and mood for the living theme. */
export function useLiveMoodContext(): LiveMoodContext {
  const [time, setTime] = useState<TimeOfDay>(() => timeOfDayForHour(new Date().getHours()));
  const [weather, setWeather] = useState<Weather>(DEFAULT_WEATHER);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [mood, setMood] = useState<Mood>(DEFAULT_MOOD);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(timeOfDayForHour(new Date().getHours())), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let alive = true;
    getTodayCheckin().then((c) => {
      if (alive && c) setMood(moodFromCheckin(c));
    });
    fetchWeather()
      .then((w) => {
        if (alive && w) {
          setWeather(w.weather);
          setTemperature(w.temperature);
        }
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  return { time, weather, mood, temperature, ready };
}
