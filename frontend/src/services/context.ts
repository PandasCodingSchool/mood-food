// 3.2 — Passive context: consent-gated weather enrichment. Location is only
// read when the user has explicitly opted in (stored flag); we never prompt
// silently. Falls back to "any" weather when consent isn't granted or the
// lookup fails, so the rest of the pipeline is unaffected either way.

const CONSENT_KEY = "moodfood_location_consent";
const CACHE_KEY = "moodfood_weather_cache";
const CACHE_TTL_MS = 30 * 60 * 1000;

export function hasLocationConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function setLocationConsent(granted: boolean): void {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    // ignore
  }
}

function readCache(): { weather: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(weather: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ weather, ts: Date.now() }));
  } catch {
    // ignore
  }
}

/** Requests browser geolocation (only if consent already granted) and resolves weather. */
export async function getPassiveWeather(): Promise<string> {
  if (!hasLocationConsent() || typeof navigator === "undefined" || !navigator.geolocation) {
    return "any";
  }
  const cached = readCache();
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.weather;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const apiUrl = import.meta.env.VITE_API_URL || "/api";
          const response = await fetch(
            `${apiUrl}/weather?lat=${latitude}&lon=${longitude}`,
          );
          const data = await response.json();
          const weather = data?.weather || "any";
          writeCache(weather);
          resolve(weather);
        } catch {
          resolve("any");
        }
      },
      () => resolve("any"),
      { timeout: 5000, maximumAge: CACHE_TTL_MS },
    );
  });
}
