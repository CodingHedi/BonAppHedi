/**
 * The facts the mentions légales are made of.
 *
 * In one place because they are the only part of that page that is not prose:
 * everything else is boilerplate that never changes, and these are six strings
 * that must be right. Keeping them apart from the template means updating them
 * is an edit to a list rather than surgery on markup in two languages.
 *
 * `null` means "not settled yet", and it is not the same as an empty string.
 * `scripts/check-legal.mjs` fails on any null and runs as part of
 * `npm run verify:prod` — the gate before a deploy — so an incomplete notice
 * cannot reach production while day-to-day `npm run verify` stays green.
 *
 * ## Why the address is absent, deliberately
 *
 * LCEN article 6-III-2 lets a person publishing in a non-professional capacity
 * withhold their name and address from the page, provided the host holds their
 * identity and the host's own details are published in full. That is the case
 * here: OVH is both registrar and host. So the site names its publisher and
 * gives OVH's address, and Hedi's home address is not on a public page indexed
 * by search engines.
 *
 * Two things would end that exemption, and both are worth recognising before
 * they happen: taking money in any form — advertising, affiliate links,
 * sponsorship, selling anything — or otherwise publishing "à titre
 * professionnel". At that point the full identity and address become mandatory.
 */

export interface LegalHost {
  readonly name: string;
  readonly address: string;
  readonly phone: string;
  readonly url: string;
}

export interface LegalDetails {
  /** Shown as the publisher. A first name is enough while the site is personal. */
  readonly publisher: string | null;

  /**
   * For a site published by an individual this is that individual, by
   * definition — it is not a role that has to be appointed or a company found
   * to fill. Kept as its own field because the law names it separately and a
   * reader looking for it expects to find it under its own heading.
   */
  readonly publicationDirector: string | null;

  /** The published contact address. Must be one that is actually read. */
  readonly contactEmail: string | null;

  /** Whose machine the site runs on. Published in full — see above. */
  readonly host: LegalHost;
}

export const LEGAL_DETAILS: LegalDetails = {
  publisher: 'Hedi',
  publicationDirector: 'Hedi',

  // This has to be a mailbox that exists and is read. It is the only channel
  // the notice offers, and a legal notice pointing at an address that bounces
  // is worse than useless - it looks like contact was offered when it was not.
  // Hosted on OVH's MX Plan alongside the domain; SPF already authorises it.
  contactEmail: 'contact@bonapphedi.fr',

  host: {
    name: 'OVH SAS',
    address: '2 rue Kellermann, 59100 Roubaix, France',
    phone: '+33 9 72 10 10 07',
    url: 'https://www.ovhcloud.com',
  },
};
