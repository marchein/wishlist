import * as cheerio from 'cheerio';

type CheerioAPI = cheerio.CheerioAPI;
type Json = Record<string, unknown>;

/** Where a value came from (stable code, translated by clients). */
export type ScrapeSource =
  | 'structured-data'
  | 'product-page'
  | 'preview-tags'
  | 'product-markup'
  | 'page-title'
  | 'page'
  | 'link-address'
  | 'pasted-text'
  | 'link-itself';

export interface Extracted {
  title?: string;
  image?: string;
  price?: number;
  currency?: string;
  siteName?: string;
  description?: string;
  /** Where each value came from – shown to the user so they can judge how trustworthy it is. */
  sources: { title?: ScrapeSource; image?: ScrapeSource; price?: ScrapeSource };
  /** The shop served a captcha / bot wall instead of the product page. */
  blocked: boolean;
}

const PRODUCT_TYPES =
  /^(Product|ProductGroup|ProductModel|IndividualProduct|Book|VideoGame|Game|SoftwareApplication|MobileApplication|MusicAlbum|Movie|Vehicle|Car)$/i;
const BLOCKED_TITLE = /robot check|captcha|access denied|attention required|just a moment|are you a (human|robot)|bot detection/i;

const CURRENCY_SYMBOLS: [string, string][] = [
  ['US$', 'USD'],
  ['R$', 'BRL'],
  ['A$', 'AUD'],
  ['C$', 'CAD'],
  ['CA$', 'CAD'],
  ['zł', 'PLN'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['₹', 'INR'],
  ['₩', 'KRW'],
  ['$', 'USD'],
];
const CURRENCY_CODES = new Set([
  'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'KRW', 'BRL', 'AUD', 'CAD', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'TRY', 'MXN', 'NZD',
]);

export function parsePrice(text: string): { amount?: number; currency?: string } {
  const clean = text.replace(/[\u00a0\u202f\u2009]/g, ' ').trim();
  let currency = [...clean.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]!).find((code) => CURRENCY_CODES.has(code));
  currency ??= CURRENCY_SYMBOLS.find(([symbol]) => clean.includes(symbol))?.[1];

  const match = /\d[\d.,'’ ]*/.exec(clean);
  if (!match) return { currency };
  let number = match[0].replace(/[ '’]/g, '').replace(/[.,]+$/, '');

  const lastComma = number.lastIndexOf(',');
  const lastDot = number.lastIndexOf('.');
  let decimalSeparator: ',' | '.' | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.';
    const occurrences = number.split(separator).length - 1;
    const digitsAfter = number.length - number.lastIndexOf(separator) - 1;
    // "1.299" / "1,299" are thousands separators; "12,99" / "12.5" are decimals.
    decimalSeparator = occurrences === 1 && digitsAfter !== 3 ? separator : null;
  }
  if (decimalSeparator) {
    const thousands = decimalSeparator === ',' ? '.' : ',';
    number = number.split(thousands).join('').replace(decimalSeparator, '.');
  } else {
    number = number.replace(/[.,]/g, '');
  }
  const amount = Number(number);
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : undefined, currency };
}

function toPrice(value: unknown): number | undefined {
  if (typeof value === 'number') return value > 0 ? value : undefined;
  if (typeof value === 'string') return parsePrice(value).amount;
  return undefined;
}

function absoluteHttpUrl(value: unknown, base: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = cheerio.load(value).text().replace(/\s+/g, ' ').trim();
  return cleaned || undefined;
}

// ---- JSON-LD (schema.org) -------------------------------------------------------------

function findJsonLdProducts($: CheerioAPI): Json[] {
  const products: Json[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const obj = node as Json;
    const types = ([] as unknown[]).concat(obj['@type']);
    if (types.some((type) => typeof type === 'string' && PRODUCT_TYPES.test(type))) products.push(obj);
    visit(obj['@graph']);
    visit(obj['mainEntity']);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // Broken JSON-LD is common; just ignore it.
    }
  });
  return products;
}

function jsonLdImage(value: unknown): unknown {
  if (Array.isArray(value)) return jsonLdImage(value[0]);
  if (value && typeof value === 'object') return (value as Json)['url'] ?? (value as Json)['contentUrl'];
  return value;
}

function jsonLdOffer(offers: unknown): { price?: number; currency?: string } {
  for (const offer of ([] as unknown[]).concat(offers)) {
    if (!offer || typeof offer !== 'object') continue;
    const o = offer as Json;
    const spec = ([] as unknown[]).concat(o['priceSpecification'])[0] as Json | undefined;
    const price = toPrice(o['price'] ?? o['lowPrice'] ?? spec?.['price']);
    const currency = (o['priceCurrency'] ?? spec?.['priceCurrency']) as string | undefined;
    if (price !== undefined) return { price, currency: typeof currency === 'string' ? currency : undefined };
    const nested = jsonLdOffer(o['offers']);
    if (nested.price !== undefined) return nested;
  }
  return {};
}

// ---- Title clean-up -------------------------------------------------------------------

/** Removes shop branding like "Amazon.de: …" or "… | Xbox" from page titles. */
function stripBranding(title: string, brands: string[]): string {
  const parts = title.split(/\s+[|–—]\s+|\s+-\s+|\s*:\s+/);
  if (parts.length < 2) return title;
  const isBrand = (part: string) =>
    part.length < 40 && brands.some((brand) => brand && part.toLowerCase().includes(brand.toLowerCase()));
  let start = 0;
  let end = parts.length;
  while (end - start > 1 && isBrand(parts[start]!)) start++;
  while (end - start > 1 && isBrand(parts[end - 1]!)) end--;
  if (start === 0 && end === parts.length) return title;
  // Re-slice the original string so separators inside the product name survive.
  const first = parts[start]!;
  const last = parts[end - 1]!;
  const from = title.indexOf(first);
  const to = title.lastIndexOf(last) + last.length;
  return title.slice(from, to).trim();
}

function brandOf(hostname: string): string {
  const labels = hostname.replace(/^www\./, '').split('.');
  return labels.length >= 2 ? labels[labels.length - 2]! : labels[0]!;
}

// ---- Main extraction ------------------------------------------------------------------

export function extractFromHtml(html: string, pageUrl: string): Extracted {
  const $ = cheerio.load(html);
  const meta = (key: string) =>
    text($(`meta[property="${key}"]`).attr('content') ?? $(`meta[name="${key}"]`).attr('content'));
  const result: Extracted = { sources: {}, blocked: false };
  const hostname = new URL(pageUrl).hostname;

  const set = <K extends 'title' | 'image' | 'price'>(key: K, value: Extracted[K] | undefined, source: ScrapeSource) => {
    if (value === undefined || result[key] !== undefined) return;
    result[key] = value;
    result.sources[key] = source;
  };

  const pageTitle = text($('title').first().text());
  if ((pageTitle && BLOCKED_TITLE.test(pageTitle)) || $('form[action*="validateCaptcha"]').length) {
    result.blocked = true;
    return result;
  }

  result.siteName = meta('og:site_name') ?? hostname.replace(/^www\./, '');
  result.description = meta('og:description') ?? meta('description');
  const brands = [result.siteName, brandOf(hostname)];

  // 1. Structured data – the most reliable source when present.
  for (const product of findJsonLdProducts($)) {
    set('title', text(product['name']), 'structured-data');
    set('image', absoluteHttpUrl(jsonLdImage(product['image']), pageUrl), 'structured-data');
    let offer = jsonLdOffer(product['offers']);
    if (offer.price === undefined) {
      const variants = ([] as unknown[]).concat(product['hasVariant']).filter(Boolean) as Json[];
      offer = jsonLdOffer(variants.map((variant) => variant['offers']));
    }
    if (offer.price !== undefined && result.price === undefined) {
      set('price', offer.price, 'structured-data');
      result.currency = offer.currency;
    }
  }

  // 2. Shop specific markup (Amazon doesn't ship Open Graph or JSON-LD for products).
  set('title', text($('#productTitle').text()), 'product-page');
  const amazonImage = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront').first();
  const dynamicImages = amazonImage.attr('data-a-dynamic-image');
  let largestDynamic: string | undefined;
  if (dynamicImages) {
    try {
      const sizes = JSON.parse(dynamicImages) as Record<string, [number, number]>;
      largestDynamic = Object.entries(sizes).sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1])[0]?.[0];
    } catch {
      // ignore malformed attribute
    }
  }
  set(
    'image',
    absoluteHttpUrl(amazonImage.attr('data-old-hires') || largestDynamic || amazonImage.attr('src'), pageUrl),
    'product-page',
  );
  const amazonPrice = text(
    $(
      '#corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox',
    )
      .first()
      .text(),
  );
  if (amazonPrice && result.price === undefined) {
    const parsed = parsePrice(amazonPrice);
    if (parsed.amount !== undefined) {
      set('price', parsed.amount, 'product-page');
      result.currency = parsed.currency;
    }
  }

  // 3. Open Graph / Twitter cards / microdata.
  const ogTitle = meta('og:title') ?? meta('twitter:title');
  set('title', ogTitle && stripBranding(ogTitle, brands), 'preview-tags');
  set(
    'image',
    absoluteHttpUrl(meta('og:image:secure_url') ?? meta('og:image') ?? meta('twitter:image'), pageUrl),
    'preview-tags',
  );
  const metaPrice = meta('product:price:amount') ?? meta('og:price:amount');
  if (metaPrice && result.price === undefined) {
    set('price', parsePrice(metaPrice).amount, 'preview-tags');
    result.currency = meta('product:price:currency') ?? meta('og:price:currency');
  }

  const itemPrice = $('[itemprop="price"]').first();
  if (itemPrice.length && result.price === undefined) {
    const raw = itemPrice.attr('content') ?? itemPrice.text();
    const parsed = parsePrice(raw);
    set('price', parsed.amount, 'product-markup');
    result.currency ??=
      $('[itemprop="priceCurrency"]').first().attr('content') ?? parsed.currency;
  }
  set('title', text($('[itemtype*="schema.org/Product"] [itemprop="name"]').first().text()), 'product-markup');
  const itemImage = $('[itemtype*="schema.org/Product"] [itemprop="image"]').first();
  set('image', absoluteHttpUrl(itemImage.attr('content') ?? itemImage.attr('src'), pageUrl), 'product-markup');

  // 4. Last resort.
  set('title', pageTitle && stripBranding(pageTitle, brands), 'page-title');
  set('image', absoluteHttpUrl($('link[rel="image_src"]').attr('href'), pageUrl), 'page');

  if (result.currency) result.currency = result.currency.toUpperCase();
  return result;
}

// ---- Helpers for when the page can't be loaded ------------------------------------------

/** Finds the first link in pasted text (share sheets often add "Look what I found: …"). */
export function extractUrl(input: string): string | undefined {
  const match = /https?:\/\/[^\s<>"'`]+/i.exec(input);
  if (match) return match[0].replace(/[),.;!?\]]+$/, '');
  const bare = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i.exec(input.trim());
  return bare ? `https://${bare[0]}` : undefined;
}

/** Guesses a product title from a URL slug, e.g. /Sony-WH-1000XM5-Kopfhoerer/dp/B09… */
export function guessTitleFromUrl(url: URL): string | undefined {
  const candidates = url.pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .map((segment) => segment.replace(/\.(html?|php|aspx?)$/i, ''))
    .filter(
      (segment) =>
        segment.length >= 6 &&
        /[-_+]/.test(segment) &&
        /\p{L}{2,}/u.test(segment) &&
        !/^[a-z]{2}[-_][a-z]{2}$/i.test(segment),
    )
    .sort((a, b) => b.length - a.length);
  const best = candidates[0]?.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  return best ? best.charAt(0).toUpperCase() + best.slice(1) : undefined;
}
