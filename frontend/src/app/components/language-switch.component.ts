import { Component, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { I18nService, TranslatePipe, type Language } from '../core/i18n/i18n';

/** Unobtrusive language choice for the bottom of a page; language names are shown in their own language. */
@Component({
  selector: 'app-language-switch',
  imports: [IonIcon, TranslatePipe],
  template: `
    <div class="switch" role="group" [attr.aria-label]="'common.language' | t">
      <ion-icon name="language-outline" aria-hidden="true" />
      @for (option of options; track option.value) {
        <button
          type="button"
          [lang]="option.value"
          [class.active]="i18n.language() === option.value"
          [attr.aria-pressed]="i18n.language() === option.value"
          (click)="i18n.setLanguage(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .switch {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 4px;
      padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
      color: var(--ion-color-medium);
    }
    button {
      padding: 4px 8px;
      border: 0;
      border-radius: 4px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .active {
      color: var(--ion-text-color);
      font-weight: 600;
    }
  `,
})
export class LanguageSwitchComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly options: { value: Language; label: string }[] = [
    { value: 'de', label: 'Deutsch' },
    { value: 'en', label: 'English' },
  ];
}
