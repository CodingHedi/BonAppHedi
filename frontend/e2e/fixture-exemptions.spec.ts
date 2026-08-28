import { expect, test } from './fixtures';
import { isExpectedApiNotFound, isExpectedUploadRefusal } from './fixtures';

/**
 * The guards on the guard.
 *
 * `fixtures.ts` fails a spec whenever the browser logged a console error, and
 * that is the highest-value behaviour in this suite — it is what catches a
 * translation file 404ing, a lazy chunk rotting, or an asset path breaking
 * after a build-config change. Two narrow exemptions are carved out of it, both
 * for a server correctly refusing something a spec asked it to refuse.
 *
 * Every exemption is a hole, and a hole nobody tests is a hole that widens. The
 * failure mode is specific and silent: somebody loosens a pattern to fix one
 * red spec, the suite goes green, and from then on it cannot see a whole class
 * of real breakage. Nothing would fail to say so.
 *
 * So the exemptions get the same treatment `AvatarTest` and `MediaLadderTest`
 * give their vocabularies — asserted from the outside, including the cases that
 * must NOT match, which are the half that matters.
 *
 * No browser is opened here. These are pure predicates.
 */

const AT = (status: number) =>
  `Failed to load resource: the server responded with a status of ${status} (Something)`;

test.describe('the 404 exemption', () => {
  test('lets an API 404 through, because that is the API answering', () => {
    // The server returns the same 404 for an unknown slug, a draft, and a slug
    // from the other language, so that asking cannot confirm a draft exists.
    expect(isExpectedApiNotFound(AT(404), 'https://x/api/recipes/nope?locale=fr')).toBe(true);
  });

  test('still fails a 404 on anything that is not the API', () => {
    // The first thing the fixture was written to catch. If these ever start
    // passing, the suite has gone blind to a broken deploy.
    expect(isExpectedApiNotFound(AT(404), 'https://x/i18n/fr.json')).toBe(false);
    expect(isExpectedApiNotFound(AT(404), 'https://x/chunk-ABC.js')).toBe(false);
    expect(isExpectedApiNotFound(AT(404), 'https://x/assets/work-sans.woff2')).toBe(false);
  });

  test('still fails a non-404 from the API', () => {
    expect(isExpectedApiNotFound(AT(500), 'https://x/api/recipes')).toBe(false);
  });
});

test.describe('the 415 exemption', () => {
  test('lets the photo upload refuse a non-image', () => {
    expect(isExpectedUploadRefusal(AT(415), 'https://x/api/admin/recipes/babka/photo')).toBe(true);
    // Keys are percent-encoded by the client, so the segment is not always bare.
    expect(
      isExpectedUploadRefusal(AT(415), 'https://x/api/admin/recipes/tarte%20tatin/photo'),
    ).toBe(true);
  });

  test('still fails a 415 from anywhere else', () => {
    // A 415 the site did not ask for means a client sending something the
    // server never agreed to accept, which is a defect.
    expect(isExpectedUploadRefusal(AT(415), 'https://x/api/admin/recipes')).toBe(false);
    expect(isExpectedUploadRefusal(AT(415), 'https://x/api/recipes?locale=fr')).toBe(false);
    expect(isExpectedUploadRefusal(AT(415), 'https://x/chunk-ABC.js')).toBe(false);
  });

  test('is anchored, so a longer path does not borrow the exemption', () => {
    // Without the trailing anchor this passes, and every 415 under a path that
    // merely starts the same way goes unseen.
    expect(isExpectedUploadRefusal(AT(415), 'https://x/api/admin/recipes/x/photo/evil')).toBe(
      false,
    );
  });

  test('still fails a non-415 from the upload endpoint', () => {
    // A 500 there is the ingest crashing, which is exactly what this suite
    // should refuse to let through quietly.
    expect(isExpectedUploadRefusal(AT(500), 'https://x/api/admin/recipes/babka/photo')).toBe(false);
    expect(isExpectedUploadRefusal(AT(404), 'https://x/api/admin/recipes/babka/photo')).toBe(false);
  });
});
