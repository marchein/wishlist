import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { I18nService } from './i18n';

describe('I18nService', () => {
  let i18n: I18nService;

  beforeEach(() => {
    localStorage.clear();
    i18n = TestBed.inject(I18nService);
  });

  it('interpolates parameters and picks plural forms', () => {
    i18n.setLanguage('de');
    expect(i18n.t('wishlists.wishCount', { count: 1 })).toBe('1 Wunsch');
    expect(i18n.t('wishlists.wishCount', { count: 3 })).toBe('3 Wünsche');
    expect(i18n.t('shared.heading', { name: 'Marc' })).toBe('Wunschliste von Marc');

    i18n.setLanguage('en');
    expect(i18n.t('wishlists.wishCount', { count: 0 })).toBe('0 wishes');
    expect(i18n.t('shared.heading', { name: 'Marc' })).toBe("Marc's wishlist");
  });

  it('remembers the chosen language', () => {
    i18n.setLanguage('de');
    expect(localStorage.getItem('wishlist.language')).toBe('de');
  });

  it('translates API error codes and falls back for unknown ones', () => {
    i18n.setLanguage('de');
    const error = (body: unknown, status = 409) => new HttpErrorResponse({ status, error: body });
    expect(i18n.errorMessage(error({ code: 'NOT_ENOUGH_REMAINING', params: { remaining: 2 } }))).toBe('Nur noch 2 offen.');
    expect(i18n.errorMessage(error({ code: 'SOMETHING_NEW', message: 'x' }))).toBe(
      'Etwas ist schiefgelaufen. Bitte versuche es noch einmal.',
    );
    expect(i18n.errorMessage(error(null, 0))).toBe('Der Server ist nicht erreichbar. Bist du online?');
  });

  it('formats event dates as calendar days', () => {
    i18n.setLanguage('de');
    expect(i18n.formatDate('2026-12-24', 'longDate')).toContain('24. Dezember 2026');
  });
});
