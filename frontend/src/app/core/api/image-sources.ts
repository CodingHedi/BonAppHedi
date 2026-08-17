import type { ImageSource } from './models';

/**
 * The widths the server offers a photograph at, smallest first.
 *
 * **This is a mirror, not the source of truth.** The real API sends the list on
 * every `ImageRef`, and nothing in the running site derives one from these
 * numbers — that is the whole reason the API sends them explicitly rather than
 * leaving a client to apply a rule (see `Dto.ImageSource`). This copy exists so
 * the *mocked* build can produce the same shape as the real one, because there
 * is no server there to ask.
 *
 * It must agree with `MediaStorage.WIDTH_LADDER` in the backend, and the drift
 * would be silent and one-directional: offer a width here that the server does
 * not, and the mocked build renders a `srcset` the e2e suite is perfectly happy
 * with while production answers 404 for a photograph nobody looked at.
 * `MediaLadderTest` reads this file and fails when the two disagree — the same
 * arrangement `AvatarTest` uses for the avatar vocabulary, and for the same
 * reason.
 */
export const WIDTH_LADDER = [400, 800];

/** Matches `MediaStorage.derivativeName`: `babka.jpg` at 400 → `babka@400.jpg`. */
function derivativeUrl(url: string, width: number): string {
  const dot = url.lastIndexOf('.');
  return dot < 0 ? `${url}@${width}` : `${url.slice(0, dot)}@${width}${url.slice(dot)}`;
}

/**
 * Every address for one photograph: the ladder widths below the stored one,
 * then the original at its own width.
 *
 * Mirrors `MediaStorage.widthsFor`. A photograph narrower than a ladder step
 * gets no entry there — the server refuses to enlarge, so offering one would
 * promise a file that will never exist.
 */
export function imageSources(url: string, width: number | undefined): readonly ImageSource[] {
  if (!width || width <= 0) return [];

  const sources = WIDTH_LADDER.filter((step) => step < width).map((step) => ({
    url: derivativeUrl(url, step),
    width: step,
  }));

  return [...sources, { url, width }];
}
