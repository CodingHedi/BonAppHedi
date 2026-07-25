import { Pipe, type PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LocaleService } from '../core/i18n/locale.service';
import { relativeTime, splitDuration, videoTimestamp } from './format';

/**
 * "il y a 4 jours" / "4 days ago".
 *
 * Impure because the output depends on wall-clock time and on the active
 * locale, neither of which is an argument. The inputs are a handful of dates
 * per page, so the cost is irrelevant.
 */
@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  private readonly transloco = inject(TranslocoService);

  transform(iso: string | null | undefined): string {
    if (!iso) return '';
    return relativeTime(iso, this.locale.locale()) ?? this.transloco.translate('time.justNow');
  }
}

/** 45 → "45 min", 90 → "1 h 30" (FR) or "1 hr 30" (EN). */
@Pipe({ name: 'duration', pure: false })
export class DurationPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(minutes: number | null | undefined): string {
    if (minutes == null) return '';

    const { hours, minutes: rest } = splitDuration(minutes);
    if (hours === 0) return this.transloco.translate('time.minutes', { value: rest });
    if (rest === 0) return this.transloco.translate('time.hoursOnly', { hours });
    return this.transloco.translate('time.hours', { hours, minutes: rest });
  }
}

/** Unit keys are language-neutral in the data; only the label is translated. */
@Pipe({ name: 'unitLabel', pure: false })
export class UnitLabelPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);

  transform(unit: string | null | undefined): string {
    if (!unit) return '';
    const key = `units.${unit}`;
    const label = this.transloco.translate(key);
    // Transloco echoes the key back when it is missing; fall back to the raw
    // unit so an unmapped one degrades to "42 dl" rather than "42 units.dl".
    return label === key ? unit : label;
  }
}

/** 372 → "06:12". */
@Pipe({ name: 'videoTimestamp' })
export class VideoTimestampPipe implements PipeTransform {
  transform(seconds: number | null | undefined): string {
    return seconds == null ? '' : videoTimestamp(seconds);
  }
}
