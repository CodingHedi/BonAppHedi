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

/**
 * Metric units that have a bigger sibling to graduate into once a scaled-up
 * recipe crosses 1000 of them.
 *
 * Deliberately only these two. `cl` has a litre above it as well, but nothing
 * asked for that and adding it would silently restate amounts on recipes nobody
 * complained about; the same goes downward, where 0.5 g does not become 500 mg.
 * A new row here is a decision, not a completion.
 */
const METRIC_STEPS: readonly { from: string; to: string; per: number }[] = [
  { from: 'g', to: 'kg', per: 1000 },
  { from: 'ml', to: 'l', per: 1000 },
];

/**
 * Up to two decimals, never padded. One is not enough: 1234 g shown as "1.2 kg"
 * quietly loses 34 g of flour, which is the kind of error a scaled-up bake
 * actually notices.
 */
function formatConverted(value: number): string {
  return String(Number(value.toFixed(2)));
}

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;

export function clampServings(value: number): number {
  return Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.trunc(value) || MIN_SERVINGS));
}

/** A formatted amount and the unit it should be read in. */
export interface ScaledMeasure {
  /** The number, already formatted for display. */
  value: string;
  /**
   * The unit key to localize. NOT necessarily the one stored on the
   * ingredient: scaling a recipe up can carry a quantity across a metric
   * boundary, and 1500 g is read as 1.5 kg.
   */
  unit: string;
}

/**
 * Scales one ingredient and returns both halves of the amount, because the two
 * cannot be decided independently — whether the unit is grams or kilograms is a
 * function of the scaled number.
 *
 * The unit is returned as a key rather than a label, so the arithmetic here
 * stays language-agnostic and the caller still localizes.
 *
 * Null base quantity means the ingredient has no measurable amount at all
 * ("salt and pepper, to taste"); the caller renders the note instead.
 */
export function scaleMeasure(
  baseQuantity: number | null,
  baseServings: number,
  servings: number,
  unit: string,
  scalable = true,
): ScaledMeasure | null {
  if (baseQuantity === null) return null;

  // Guard against a malformed recipe rather than emitting Infinity into the UI.
  const perServing = baseServings > 0 ? baseQuantity / baseServings : baseQuantity;
  const value = scalable ? perServing * servings : baseQuantity;

  if (COUNTABLE_UNITS.has(unit)) return { value: String(Math.round(value)), unit };

  // The unit field in the editor is free text, so 'G' and 'mL' both get here.
  const key = unit.trim().toLowerCase();
  const step = METRIC_STEPS.find((s) => s.from === key);
  if (step && value >= step.per) {
    return { value: formatConverted(value / step.per), unit: step.to };
  }

  return { value: Number.isInteger(value) ? String(value) : value.toFixed(1), unit };
}
