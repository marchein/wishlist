import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Pipe, computed, effect, inject, signal, type PipeTransform } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { de } from './de';
import { en, type TranslationKey, type Translations } from './en';

export type { TranslationKey } from './en';
export type Language = 'de' | 'en';
export type TranslationParams = Record<string, string | number | null | undefined>;

const STORAGE_KEY = 'wishlist.language';
const DICTIONARIES: Record<Language, Translations> = { de, en };
const DEFAULT_LOCALE: Record<Language, string> = { de: 'de-DE', en: 'en-US' };

function browserLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

function detectLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'de' || saved === 'en') return saved;
  // The first supported browser language wins; everyone else gets English.
  for (const tag of browserLanguages()) {
    const base = tag?.slice(0, 2).toLowerCase();
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

export function isTranslationKey(key: string): key is TranslationKey {
  return Object.hasOwn(en, key);
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly title = inject(Title);

  readonly language = signal<Language>(detectLanguage());
  /** Locale for dates and numbers; keeps the browser's region (de-AT, en-GB, …) when the language matches. */
  readonly locale = computed(() => {
    const language = this.language();
    return browserLanguages().find((tag) => tag?.toLowerCase().startsWith(language)) ?? DEFAULT_LOCALE[language];
  });

  constructor() {
    effect(() => {
      document.documentElement.lang = this.language();
      this.title.setTitle(this.t('app.title'));
    });
  }

  setLanguage(language: Language): void {
    localStorage.setItem(STORAGE_KEY, language);
    this.language.set(language);
  }

  t(key: TranslationKey, params?: TranslationParams): string {
    let value = DICTIONARIES[this.language()][key] ?? en[key];
    if (typeof value !== 'string') {
      const count = Number(params?.['count'] ?? 0);
      value = new Intl.PluralRules(this.locale()).select(count) === 'one' ? value.one : value.other;
    }
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, name: string) => (params[name] == null ? match : String(params[name])));
  }

  formatDate(value: string | null | undefined, style: 'date' | 'longDate' | 'dateTime' = 'date'): string {
    if (!value) return '';
    // Date-only values (event dates) are calendar days, not UTC instants.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = dateOnly ? new Date(+dateOnly[1]!, +dateOnly[2]! - 1, +dateOnly[3]!) : new Date(value);
    const options: Intl.DateTimeFormatOptions =
      style === 'longDate'
        ? { dateStyle: 'full' }
        : style === 'dateTime'
          ? { dateStyle: 'medium', timeStyle: 'short' }
          : { dateStyle: 'medium' };
    return new Intl.DateTimeFormat(this.locale(), options).format(date);
  }

  formatPrice(price: number | null | undefined, currency: string | null | undefined): string {
    if (price == null) return '';
    try {
      return new Intl.NumberFormat(this.locale(), { style: 'currency', currency: currency || 'EUR' }).format(price);
    } catch {
      return `${price} ${currency ?? ''}`.trim();
    }
  }

  /** Translates the API's error `code`; unknown codes get a generic message. */
  errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return this.t('errors.OFFLINE');
      const body = error.error as { code?: string; params?: TranslationParams } | null;
      const key = `errors.${body?.code}`;
      if (isTranslationKey(key)) return this.t(key, body?.params);
    }
    return this.t('errors.UNKNOWN');
  }
}

// Impure so templates update when the language signal changes.
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: TranslationKey, params?: TranslationParams): string {
    return this.i18n.t(key, params);
  }
}

@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(value: string | null | undefined, style: 'date' | 'longDate' | 'dateTime' = 'date'): string {
    return this.i18n.formatDate(value, style);
  }
}

@Pipe({ name: 'price', pure: false })
export class PricePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(price: number | null | undefined, currency: string | null | undefined): string {
    return this.i18n.formatPrice(price, currency);
  }
}
