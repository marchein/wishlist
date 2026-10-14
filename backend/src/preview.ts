/** Open Graph / Twitter meta tags for share links, so messengers (WhatsApp, iMessage, …) show a rich preview. */

export type PreviewLanguage = 'de' | 'en';

export interface PreviewWishlist {
  title: string;
  description: string | null;
  eventDate: string | null;
  ownerName: string;
  itemCount: number;
  imageUrl: string | null;
}

const TEXT = {
  de: {
    siteName: 'Wunschliste',
    title: (list: string, owner: string) => `${list} – Wunschliste von ${owner}`,
    wishes: (count: number) => (count === 1 ? '1 Wunsch' : `${count} Wünsche`),
    notFound: 'Wunschliste nicht gefunden',
    locale: 'de-DE',
    ogLocale: 'de_DE',
  },
  en: {
    siteName: 'Wishlist',
    title: (list: string, owner: string) => `${list} – ${owner}'s wishlist`,
    wishes: (count: number) => (count === 1 ? '1 wish' : `${count} wishes`),
    notFound: 'Wishlist not found',
    locale: 'en-US',
    ogLocale: 'en_US',
  },
} as const;

/**
 * Preview fetchers often send no Accept-Language at all; share links mostly go to German speakers,
 * so that case defaults to German. Otherwise the first German/English preference wins, else English.
 */
export function previewLanguage(acceptLanguage: string | undefined): PreviewLanguage {
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map((part) => part.split(';')[0]!.trim().toLowerCase())
    .filter((tag) => tag && tag !== '*');
  if (tags.length === 0) return 'de';
  for (const tag of tags) {
    const base = tag.slice(0, 2);
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);

function formatEventDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function renderPreviewTags(options: {
  language: PreviewLanguage;
  /** Public origin, e.g. https://wishlist.example.com */
  origin: string;
  pageUrl: string;
  wishlist: PreviewWishlist | undefined;
}): string {
  const text = TEXT[options.language];
  const { wishlist } = options;
  const image = wishlist?.imageUrl?.startsWith('/') ? `${options.origin}${wishlist.imageUrl}` : wishlist?.imageUrl;

  const title = wishlist ? text.title(wishlist.title, wishlist.ownerName) : text.notFound;
  const description = wishlist
    ? [
        wishlist.description,
        text.wishes(wishlist.itemCount),
        wishlist.eventDate && formatEventDate(wishlist.eventDate, text.locale),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const properties: [string, string | null | undefined][] = [
    ['og:type', 'website'],
    ['og:site_name', text.siteName],
    ['og:locale', text.ogLocale],
    ['og:url', options.pageUrl],
    ['og:title', title],
    ['og:description', description],
    ['og:image', image],
  ];
  const names: [string, string | null | undefined][] = [
    // Share links are private by nature – keep them out of search engines.
    ['robots', 'noindex, nofollow'],
    ['description', description],
    ['twitter:card', image ? 'summary_large_image' : 'summary'],
    ['twitter:title', title],
    ['twitter:description', description],
    ['twitter:image', image],
  ];

  return [
    ...properties.filter(([, value]) => value).map(([key, value]) => `<meta property="${key}" content="${escapeHtml(value!)}">`),
    ...names.filter(([, value]) => value).map(([key, value]) => `<meta name="${key}" content="${escapeHtml(value!)}">`),
  ].join('\n');
}
