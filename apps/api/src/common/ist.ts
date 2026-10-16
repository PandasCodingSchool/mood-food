/**
 * Time-of-day bucket in IST — the app's market. The server owns this so a
 * phone's clock or bucketing (e.g. "night" from 19:00) can't skew picks.
 */
export function istParts(now: Date = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const hour = ist.getUTCHours();
  const day = ist.getUTCDay();
  return {
    hour,
    time_of_day: hour < 5 ? 'late_night' : hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 22 ? 'dinner' : 'late_night',
    day_of_week: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day],
    is_weekend: day === 0 || day === 6,
  };
}
