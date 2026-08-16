import type { Locale } from '../core/i18n/locale';

/**
 * A number as the reader's language writes it: French uses a comma for the
 * decimal mark, so 10.5 g of yeast is "10,5 g" on the French page and
 * "10.5 g" on the English one.
 *
 * `useGrouping: false` on purpose. Turning it on would also restyle the
 * thousands — "1 500 pc" where the page has always said "1500 pc" — and that
 * is a separate decision from the decimal mark.
 *
 * The minimum defaults to 0, so a trailing zero is never padded on and 2 stays
 * "2" rather than becoming "2,0". A rating passes 1 for both, because "4,0 / 5"
 * is how that control is drawn and dropping to "4 / 5" would make the score
 * jump a character wider and narrower as votes land.
 */
export function decimal(
  value: number,
  locale: Locale,
  maximumFractionDigits = 1,
  minimumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: false,
  }).format(value);
}

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
