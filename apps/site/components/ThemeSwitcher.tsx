'use client';

import { timeOfDayForHour } from '@moodfood/tokens';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/lib/icons';
import { MOOD_OPTIONS, TIME_OPTIONS } from '@/lib/theme';
import { useLiveTheme } from './ThemeRoot';

/** Try the living theme: the whole page re-themes from the app's own tokens. */
export function ThemeSwitcher() {
  const { mood, time, setMood, setTime } = useLiveTheme();
  return (
    <div className="switcher glass">
      <div className="switch-row" role="radiogroup" aria-label="Mood">
        <span className="label">Mood</span>
        {MOOD_OPTIONS.map((m) => (
          <button key={m.id} role="radio" aria-checked={mood === m.id} className="chip" onClick={() => setMood(m.id)}>
            <Icon name={m.icon as IconName} size={16} />
            {m.label}
          </button>
        ))}
      </div>
      <div className="switch-row" role="radiogroup" aria-label="Time of day">
        <span className="label">Time</span>
        {TIME_OPTIONS.map((t) => (
          <button key={t.id} role="radio" aria-checked={time === t.id} className="chip" onClick={() => setTime(t.id)}>
            <Icon name={t.icon as IconName} size={16} />
            {t.label}
          </button>
        ))}
        <button className="chip chip-ghost" onClick={() => setTime(timeOfDayForHour(new Date().getHours()))}>
          <Icon name="schedule" size={16} />
          Now
        </button>
      </div>
    </div>
  );
}
