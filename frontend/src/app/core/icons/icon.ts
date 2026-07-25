import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import {
  BRAND_ICONS,
  ICONS,
  type BrandIconName,
  type IconDef,
  type IconName,
  isBrandIcon,
} from './icons.data';

/**
 * Renders a registry icon inline.
 *
 * Inline rather than a sprite or an <img> because these icons inherit
 * `currentColor` — a nav button that tints to the accent on hover, a star that
 * fills when rated. That is not achievable with an external asset.
 *
 * Always decorative: every icon in this app sits inside a labelled control, so
 * the <svg> is marked aria-hidden and the accessible name comes from the parent.
 */
@Component({
  selector: 'bah-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="fill()"
      [attr.stroke]="stroke()"
      [attr.stroke-width]="stroke() === 'none' ? null : strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      [innerHTML]="body()"
    ></svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName | BrandIconName>();
  readonly size = input(17);
  readonly strokeWidth = input(2.75);

  // Annotated rather than inferred: `as const` narrows each registry entry to
  // its own literal shape, so the inferred union would not agree that `filled`
  // exists at all.
  private readonly def = computed<IconDef | null>(() => {
    const name = this.name();
    return isBrandIcon(name) ? null : ICONS[name];
  });

  protected readonly fill = computed(() => {
    const name = this.name();
    if (isBrandIcon(name)) return null; // brand marks carry their own fills
    return this.def()?.filled ? 'currentColor' : 'none';
  });

  protected readonly stroke = computed(() => {
    const name = this.name();
    if (isBrandIcon(name) || this.def()?.filled) return 'none';
    return 'currentColor';
  });

  protected readonly body = computed<SafeHtml>(() => {
    const name = this.name();
    const markup = isBrandIcon(name) ? BRAND_ICONS[name] : ICONS[name].body;
    // The registry is a compile-time constant in our own source, never user
    // input, so bypassing the sanitizer here is safe and avoids stripping the
    // presentational attributes the brand marks depend on.
    return this.sanitizer.bypassSecurityTrustHtml(markup);
  });
}
