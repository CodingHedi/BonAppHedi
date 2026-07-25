import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'bah-site-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <footer>
      <div class="container inner">
        <span>{{ 'site.title' | transloco }} — {{ 'site.tagline' | transloco }}</span>
        <span>{{ 'footer.copyright' | transloco: { year } }}</span>
      </div>
    </footer>
  `,
  styles: `
    footer {
      border-top: 1px solid var(--color-divider);
      padding: 34px 0 50px;
    }

    .inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      opacity: 0.6;
    }
  `,
})
export class SiteFooterComponent {
  // Dynamic rather than the prototype's hardcoded "© 2026" — that string would
  // silently go stale in five months.
  protected readonly year = new Date().getFullYear();
}
