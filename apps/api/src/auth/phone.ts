import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalises user input to E.164 (+919876543210) so "+91 98765 43210",
 * "098765 43210" and "9876543210" are one account. Returns null if invalid.
 */
export function normalizePhone(raw: unknown, defaultRegion: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^[\d\s\-().+]{7,25}$/.test(trimmed) || (trimmed.match(/\+/g)?.length ?? 0) > 1) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultRegion as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}
