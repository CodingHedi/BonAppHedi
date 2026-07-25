import type { Locale } from '../core/i18n/locale';

/**
 * Relative time, e.g. "il y a 4 jours" / "4 days ago".
 *
 * `numeric: 'always'` is load-bearing. With the default 'auto', Intl produces
 * "le mois dernier" and "yesterday" for the -1 cases, but the design copy calls
 * for "il y a 1 mois". Changing this quietly breaks the seed content.
 */
export function relativeTime(iso: string, locale: Locale, now: Date = new Date()): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((then - now.getTime()) / 1000);
  const abs = Math.abs(seconds);

  const MINUTE = 60;
  const HOUR = 3600;
  const DAY = 86_400;
  // Mean Gregorian month. Using a flat 30 makes a 31-day-old post read as
  // "1 month" a day early, which is visible on the seed data.
  const MONTH = 30.44 * DAY;
  const YEAR = 365.25 * DAY;

  // Under a minute Intl would say "in 0 seconds", so the caller supplies a
  // translated "just now" instead. Null is the signal for that.
  if (abs < MINUTE) return null;

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });

  if (abs < HOUR) return rtf.format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(seconds / HOUR), 'hour');
  if (abs < 30 * DAY) return rtf.format(Math.round(seconds / DAY), 'day');
  if (abs < YEAR) return rtf.format(Math.round(seconds / MONTH), 'month');
  return rtf.format(Math.round(seconds / YEAR), 'year');
}

/**
 * Splits a duration into the parts a template needs. Formatting differs by
 * language ("1 h 30" vs "1 hr 30"), so the strings themselves live in the
 * translation files and this only does the arithmetic.
 */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** Seconds into a video as mm:ss — 10 → "00:10", 372 → "06:12". */
export function videoTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
