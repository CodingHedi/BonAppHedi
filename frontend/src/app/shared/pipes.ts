import { Pipe, type PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { splitDuration, videoTimestamp } from './format';

/*
 * `RelativeTimePipe` was here, and is gone rather than merely unused.
 *
 * Every date on the site now renders through `bah-timestamp`, which shows the
 * relative form *and* the date behind it. Leaving the pipe would leave two ways
 * to draw a date, one of which silently produces the version that cannot be
 * swapped — and the next date added to a page would have had a fifty-fifty
 * chance of being the wrong one. `relativeTime()` in ./format is still the
 * single implementation; only this second entrance to it is gone.
 */

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
