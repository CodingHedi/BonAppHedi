import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleService } from '../../core/i18n/locale.service';

@Component({
  selector: 'bah-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslocoPipe],
  template: `
    <section>
      <h1>{{ 'error.pageNotFound' | transloco }}</h1>
      <p>{{ 'error.pageNotFoundBody' | transloco }}</p>
      <a class="btn btn-primary" [routerLink]="home()">{{ 'error.backHome' | transloco }}</a>
    </section>
  `,
  styles: `
    section {
      padding: 80px 0 60px;
      max-width: 520px;
    }

    h1 {
      font-size: 42px;
      line-height: 1.05;
      margin-bottom: 14px;
    }

    p {
      opacity: 0.75;
      margin: 0 0 28px;
    }
  `,
})
export class NotFoundPage {
  private readonly locale = inject(LocaleService);
  protected readonly home = computed(() => this.locale.link());
}
