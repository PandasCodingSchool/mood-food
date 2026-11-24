/** Calendar-only helpers: KitchenCircle plans are Monday–Sunday in the household timezone.
 * Phase 1 uses date-only client input; timezone-aware scheduling arrives with reminders. */
export interface PlanPeriod {
  weekStart: string;
  startsOn: string;
  weekEnd: string;
  days: string[];
}

const DAY_MS = 86_400_000;

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected YYYY-MM-DD');
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return result;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Returns Monday for the week containing a date-only value. */
export function mondayOf(value: string): string {
  const date = parseDateOnly(value);
  const offset = (date.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  return dateOnly(addDays(date, -offset));
}

/** A current plan begins on the user-selected current date and always ends Sunday. */
export function periodForStart(startsOn: string): PlanPeriod {
  const start = parseDateOnly(startsOn);
  const weekStart = parseDateOnly(mondayOf(startsOn));
  const weekEnd = addDays(weekStart, 6);
  const days: string[] = [];
  for (let cursor = start; cursor <= weekEnd; cursor = addDays(cursor, 1)) days.push(dateOnly(cursor));
  return { weekStart: dateOnly(weekStart), startsOn, weekEnd: dateOnly(weekEnd), days };
}

/** The next plan always starts on the Monday after the current date's week. */
export function nextWeekPeriod(referenceDate: string): PlanPeriod {
  const nextMonday = addDays(parseDateOnly(mondayOf(referenceDate)), 7);
  return periodForStart(dateOnly(nextMonday));
}
