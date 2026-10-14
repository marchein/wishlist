import { Component, computed, inject, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { I18nService, type TranslationKey } from '../core/i18n/i18n';

@Component({
  selector: 'app-priority-stars',
  imports: [IonIcon],
  template: `
    <span class="stars" [attr.title]="label()">
      @for (n of levels; track n) {
        @if (editable()) {
          <button type="button" [attr.aria-label]="labelFor(n)" (click)="valueChange.emit(n)">
            <ion-icon [name]="n <= value() ? 'star' : 'star-outline'" />
          </button>
        } @else {
          <ion-icon [name]="n <= value() ? 'star' : 'star-outline'" />
        }
      }
      @if (showLabel()) {
        <span class="label">{{ label() }}</span>
      }
    </span>
  `,
  styles: `
    .stars { display: inline-flex; align-items: center; gap: 2px; color: var(--ion-color-warning); }
    button { background: none; border: 0; padding: 4px; color: inherit; font-size: 1.6rem; cursor: pointer; }
    .label { margin-left: 6px; color: var(--ion-color-medium); font-size: 0.85em; }
  `,
})
export class PriorityStarsComponent {
  private readonly i18n = inject(I18nService);

  readonly value = input(3);
  readonly editable = input(false);
  readonly showLabel = input(false);
  readonly valueChange = output<number>();

  protected readonly levels = [1, 2, 3, 4, 5];
  protected readonly label = computed(() => this.labelFor(this.value()));

  protected labelFor(level: number): string {
    return this.i18n.t(`priority.${level}` as TranslationKey);
  }
}
