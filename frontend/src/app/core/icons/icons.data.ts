/**
 * Icon registry.
 *
 * `search`, `user`, `moon`, `sun`, `star` and `play` are transcribed verbatim
 * from the prototypes — do not "tidy" the path data, the proportions are part
 * of the design.
 *
 * The rest are additions in the same drawing style (24×24 box, 2.75 stroke,
 * round caps) either because the prototype used a text glyph or emoji where a
 * real icon belongs, or because a later screen needs one.
 */

export interface IconDef {
  /** Raw inner SVG markup, rendered inside a 0 0 24 24 viewBox. */
  readonly body: string;
  /** Filled icons opt out of the shared stroke treatment. */
  readonly filled?: boolean;
}

export const ICONS = {
  // --- verbatim from the prototypes -----------------------------------------
  search: {
    body: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  },
  user: {
    body: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4.5 5-6 8-6s6.5 1.5 8 6"/>',
  },
  moon: {
    body: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>',
  },
  sun: {
    body:
      '<circle cx="12" cy="12" r="4.2"/>' +
      '<path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7' +
      'M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>',
  },
  star: {
    body: '<polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9"/>',
  },
  play: {
    body: '<path d="M8 5v14l11-7z"/>',
    filled: true,
  },

  // --- replacing the prototype's text glyphs and emoji ----------------------
  // The prototype's arrows were the literal characters ‹ and ›, which screen
  // readers announce as nothing useful.
  'chevron-left': { body: '<path d="M15 5l-7 7 7 7"/>' },
  'chevron-right': { body: '<path d="M9 5l7 7-7 7"/>' },
  'chevron-down': { body: '<path d="M6 9l6 6 6-6"/>' },
  // The reaction button was the 🙂 emoji, which renders differently on every
  // platform and cannot be styled.
  heart: {
    body: '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7-2.8c0 4.8-7 14.8-7 14.8z"/>',
  },

  // --- additions for later screens -------------------------------------------
  plus: { body: '<path d="M12 5v14M5 12h14"/>' },
  minus: { body: '<path d="M5 12h14"/>' },
  check: { body: '<path d="M4 12.5l5 5L20 6.5"/>' },
  x: { body: '<path d="M6 6l12 12M18 6L6 18"/>' },
  edit: { body: '<path d="M4 20h4L20 8l-4-4L4 16v4z"/>' },
  trash: {
    body: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  },
  eye: {
    body: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  },
  image: {
    body: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/>',
  },
  clock: { body: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>' },
  globe: {
    body: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18-2.5-2.6-2.5-15.4 0-18z"/>',
  },
  share: {
    body: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4"/>',
  },
  link: {
    body: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  },
  logout: {
    body: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;

/**
 * Brand marks. Kept out of ICONS because they must keep their official colours
 * and multi-path fills — running them through `currentColor` would make Google's
 * "G" a solid umber blob, which is both ugly and against brand guidelines.
 */
export const BRAND_ICONS = {
  google:
    '<path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/>' +
    '<path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/>' +
    '<path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z"/>' +
    '<path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 7 8.9 4.8 12 4.8z"/>',
  facebook:
    '<path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.24 2.7.24v2.9h-1.5c-1.5 0-1.9.9-1.9 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/>',
} as const;

export type BrandIconName = keyof typeof BRAND_ICONS;

export function isBrandIcon(name: string): name is BrandIconName {
  return name in BRAND_ICONS;
}
