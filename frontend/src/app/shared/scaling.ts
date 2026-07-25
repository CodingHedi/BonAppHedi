/**
 * Ingredient quantity scaling.
 *
 * Quantities are stored for a recipe's `baseServings` and scaled linearly from
 * there. The formatting rules are transcribed from the design prototype and are
 * more opinionated than they look:
 *
 *   - countable units ('pc') round to whole numbers, because "2.5 eggs" is not
 *     a thing anyone can act on
 *   - everything else shows one decimal, but only when it needs one, so flour
 *     reads "375 g" rather than "375.0 g"
 */

/** Units counted in whole items rather than measured. */
const COUNTABLE_UNITS = new Set(['pc', 'pcs']);

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;

export function clampServings(value: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.trunc(value) || MIN_SERVINGS));
}

/**
 * Returns the numeric part only — the unit label is localized separately, so
 * the arithmetic here stays language-agnostic.
 *
 * Null base quantity means the ingredient has no measurable amount at all
 * ("salt and pepper, to taste"); the caller renders the note instead.
 */
export function scaleQuantity(
  baseQuantity: number | null,
  baseServings: number,
  servings: number,
  unit: string,
  scalable = true,
): string | null {
  if (baseQuantity === null) return null;

  // Guard against a malformed recipe rather than emitting Infinity into the UI.
  const perServing = baseServings > 0 ? baseQuantity / baseServings : baseQuantity;
  const value = scalable ? perServing * servings : baseQuantity;

  if (COUNTABLE_UNITS.has(unit)) return String(Math.round(value));
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
