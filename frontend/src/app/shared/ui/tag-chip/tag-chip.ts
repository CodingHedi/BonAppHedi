import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Tag } from '../../../core/api/models';

@Component({
  selector: 'bah-tag-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="tag" [class]="variantClass()">{{ tag().label }}</span>`,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class TagChipComponent {
  readonly tag = input.required<Tag>();

  // Colour comes from the tag's own data, not from its position in a list, so
  // "dessert" is the same accent everywhere it appears.
  protected readonly variantClass = computed(() =>
    this.tag().colorVariant === 'accent2' ? 'tag--accent2' : 'tag--accent',
  );
}
