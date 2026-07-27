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
  // --- the avatar selection ---------------------------------------------------
  //
  // The twelve avatars a visitor may choose on the profile page (ADR 7). Drawn
  // in the same 24×24 / 2.75-stroke style as everything above, and kept here
  // rather than in a set of their own so one component renders every icon on the
  // site and an avatar costs no extra bytes.
  //
  // AVATAR_ICONS in core/avatar/avatar-token.ts names these, and those names are
  // stored in the database against real accounts: a drawing here may be
  // improved, but a key may never be renamed or pointed at a different subject.
  // Upright and tapering to a point. Drawn on the diagonal first, where a root
  // of constant width plus two fronds read unmistakably as a screw.
  carrot: {
    body:
      '<path d="M8 9.5h8l-3.2 10.9a.85.85 0 0 1-1.6 0z"/>' +
      '<path d="M12 9.5V5.4M12 7.2 9.1 4.7M12 7.2l2.9-2.5"/>',
  },
  citrus: {
    body:
      '<circle cx="12" cy="12" r="8.5"/>' +
      '<path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18"/>',
  },
  cherry: {
    body:
      '<circle cx="8.5" cy="16.5" r="4"/><circle cx="17" cy="15" r="3.2"/>' +
      '<path d="M8.5 12.5C10 8 13.5 4.5 18 3.5M17 11.8c-.5-3 .4-5.6 2.8-7.6"/>',
  },
  herb: {
    body: '<path d="M4 20c0-8 5-13 16-13 0 8-5 13-16 13z"/><path d="M4 20 15 9"/>',
  },
  egg: {
    body: '<path d="M12 3c3.6 0 6.5 5 6.5 9.6S15.6 21 12 21s-6.5-3.8-6.5-8.4S8.4 3 12 3z"/>',
  },
  bread: {
    body:
      '<path d="M4 16v-2a8 8 0 0 1 16 0v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>' +
      '<path d="M9 8.6 7.5 13M13 8.2l-1.5 4.8M16.8 9.4 15.4 13"/>',
  },
  // Three frosting bumps, not a dome: a single arc over a tapered wrapper is a
  // bucket, and nothing about it says cake.
  cupcake: {
    body:
      '<path d="M6.8 11.5a3.1 3.1 0 0 1 1.4-5.3 3.3 3.3 0 0 1 6.1-1.2 3.1 3.1 0 0 1 2.9 6.5z"/>' +
      '<path d="M6.9 11.5h10.2l-1.2 7.8a1.6 1.6 0 0 1-1.6 1.4H9.7a1.6 1.6 0 0 1-1.6-1.4z"/>',
  },
  mushroom: {
    body: '<path d="M4 11a8 8 0 0 1 16 0z"/><path d="M10 11v6.6a2 2 0 0 0 4 0V11"/>',
  },
  pot: {
    body:
      '<path d="M4.5 9.5h15V15a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4z"/>' +
      '<path d="M2.5 9.5h19M8 6.5h8M12 6.5V4.5"/>',
  },
  // The handle is a shape, not a line. A circle with a line coming off it is a
  // magnifying glass, which is also already an icon on this site.
  pan: {
    body: '<circle cx="9.5" cy="12.5" r="6.5"/><rect x="16.2" y="11" width="5.8" height="3" rx="1.5"/>',
  },
  // A rolling pin, where a balloon whisk was tried first and failed: an outer
  // loop plus its inner wires is six strokes crossing inside 12px, and at 2.75
  // they merge into a filled blob that reads as a tree.
  'rolling-pin': {
    body: '<rect x="5.5" y="9" width="13" height="6" rx="3"/><path d="M5.5 12H2M18.5 12H22"/>',
  },
  mug: {
    body:
      '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/>' +
      '<path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/>',
  },

  // --- brand silhouettes, for sharing ----------------------------------------
  //
  // The real marks, drawn as one filled path in `currentColor` rather than in
  // brand colours. A blue disc and a green disc side by side fight the warm
  // palette everywhere else on the page, and monochrome means they follow the
  // theme for free — near-black on the light one, near-white on the dark.
  //
  // The coloured versions still exist in BRAND_ICONS and are still used for
  // sign-in, where the provider's own branding rules apply. Sharing to a
  // network carries no such obligation.
  'facebook-mark': {
    body:
      '<path d="M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.95 10.13 ' +
      '11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95' +
      'h-1.51c-1.49 0-1.96.93-1.96 1.88v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.02 24 18.06 24 12.07z"/>',
    filled: true,
  },
  'whatsapp-mark': {
    body:
      '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 ' +
      '1.16-.17.2-.35.23-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.18-.3-.02-.46' +
      '.13-.6.13-.14.3-.35.44-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24' +
      '-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37s-1.04 1.02-1.04 2.48c0 1.46 1.07 2.87 1.22 3.07' +
      '.15.2 2.09 3.2 5.07 4.49.71.3 1.26.49 1.7.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25' +
      '-.7.25-1.29.18-1.42-.08-.12-.28-.2-.57-.35z"/>' +
      '<path d="M20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 ' +
      '5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45h.01c6.54 0 11.88-5.34 11.88-11.89 0-3.18' +
      '-1.24-6.17-3.48-8.42zM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65' +
      '-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 2.64 0 5.12 1.03 6.99 2.9' +
      'a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.43 9.89-9.88 9.89z"/>',
    filled: true,
  },
  'x-mark': {
    body:
      '<path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15' +
      'h7.59l5.25 6.93zm-1.29 19.49h2.04L6.49 3.24H4.3z"/>',
    filled: true,
  },
  // Kept on one line on purpose. Splitting path data across concatenated
  // strings silently drops the separator at each join — "1.69" + "0 1.03"
  // becomes "1.690 1.03" — and the glyph renders as an unreadable blob that no
  // test catches, because nothing asserts what an icon looks like.
  'pinterest-mark': {
    body: '<path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>',
    filled: true,
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
