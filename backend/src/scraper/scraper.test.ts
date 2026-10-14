import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractFromHtml, extractUrl, guessTitleFromUrl, parsePrice } from './extract.js';
import { assertSafeUrl, isPublicAddress } from './safe-fetch.js';

describe('parsePrice', () => {
  const cases: [string, number | undefined, string | undefined][] = [
    ['29,99 €', 29.99, 'EUR'],
    ['1.299,00 €', 1299, 'EUR'],
    ['$1,299.00', 1299, 'USD'],
    ['EUR 49.95', 49.95, 'EUR'],
    ['£12', 12, 'GBP'],
    ['1.299', 1299, undefined],
    ['CHF 1\u2019299.50', 1299.5, 'CHF'],
    ['gratis', undefined, undefined],
  ];
  for (const [input, amount, currency] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => {
      const result = parsePrice(input);
      assert.equal(result.amount, amount);
      assert.equal(result.currency, currency);
    });
  }
});

describe('extractFromHtml', () => {
  it('prefers JSON-LD product data', () => {
    const html = `<html><head>
      <title>Shop | Great Headphones</title>
      <meta property="og:title" content="OG title">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Great Headphones &amp; Case","image":["/img/1.jpg"],"offers":{"@type":"Offer","price":"199.90","priceCurrency":"EUR"}}]}</script>
    </head></html>`;
    const result = extractFromHtml(html, 'https://shop.example/p/1');
    assert.equal(result.title, 'Great Headphones & Case');
    assert.equal(result.image, 'https://shop.example/img/1.jpg');
    assert.equal(result.price, 199.9);
    assert.equal(result.currency, 'EUR');
    assert.equal(result.sources.title, 'structured-data');
  });

  it('falls back to Open Graph tags and strips shop branding', () => {
    const html = `<html><head>
      <meta property="og:title" content="Forza Horizon 5 | Xbox">
      <meta property="og:image" content="https://img.example/fh5.png">
      <meta property="product:price:amount" content="59.99">
      <meta property="product:price:currency" content="EUR">
    </head></html>`;
    const result = extractFromHtml(html, 'https://www.xbox.com/de-DE/games/store/forza-horizon-5/9NKX70BBCDRN');
    assert.equal(result.title, 'Forza Horizon 5');
    assert.equal(result.image, 'https://img.example/fh5.png');
    assert.equal(result.price, 59.99);
    assert.equal(result.currency, 'EUR');
  });

  it('reads Amazon product markup', () => {
    const html = `<html><head><title>Amazon.de: Sony WH-1000XM5 : Elektronik</title></head><body>
      <span id="productTitle">  Sony WH-1000XM5 Kopfhörer  </span>
      <img id="landingImage" src="https://m.media-amazon.com/small.jpg" data-old-hires="https://m.media-amazon.com/large.jpg">
      <div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">299,00&nbsp;€</span></span></div>
    </body></html>`;
    const result = extractFromHtml(html, 'https://www.amazon.de/dp/B09Y2MYL5C');
    assert.equal(result.title, 'Sony WH-1000XM5 Kopfhörer');
    assert.equal(result.image, 'https://m.media-amazon.com/large.jpg');
    assert.equal(result.price, 299);
    assert.equal(result.currency, 'EUR');
  });

  it('detects bot walls', () => {
    const result = extractFromHtml('<title>Robot Check</title>', 'https://www.amazon.de/dp/x');
    assert.equal(result.blocked, true);
    assert.equal(result.title, undefined);
  });

  it('ignores javascript: image URLs', () => {
    const html = `<meta property="og:image" content="javascript:alert(1)"><title>X</title>`;
    assert.equal(extractFromHtml(html, 'https://a.example/').image, undefined);
  });
});

describe('extractUrl / guessTitleFromUrl', () => {
  it('finds a link inside share text', () => {
    assert.equal(
      extractUrl('Schau mal: Sony Kopfhörer https://amzn.eu/d/abc123.'),
      'https://amzn.eu/d/abc123',
    );
    assert.equal(extractUrl('amazon.de/dp/B0001'), 'https://amazon.de/dp/B0001');
    assert.equal(extractUrl('just some words'), undefined);
  });

  it('guesses a title from the slug', () => {
    assert.equal(
      guessTitleFromUrl(new URL('https://www.amazon.de/Sony-WH-1000XM5-Kopfh%C3%B6rer/dp/B09Y2MYL5C')),
      'Sony WH 1000XM5 Kopfhörer',
    );
    assert.equal(guessTitleFromUrl(new URL('https://www.xbox.com/de-DE/games/store/forza-horizon-5/9NKX')), 'Forza horizon 5');
    assert.equal(guessTitleFromUrl(new URL('https://example.com/p/12345')), undefined);
  });
});

describe('SSRF guard', () => {
  it('classifies addresses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
      assert.equal(isPublicAddress(address), false, address);
    }
    for (const address of ['93.184.216.34', '2606:4700::6810:84e5']) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it('rejects unsafe URLs', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://[::1]/',
      'http://localhost:3000/',
      'file:///etc/passwd',
      'http://user:pw@example.com/',
      'http://example.com:22/',
      'http://printer.local/',
    ]) {
      assert.throws(() => assertSafeUrl(url), undefined, url);
    }
    assert.doesNotThrow(() => assertSafeUrl('https://www.amazon.de/dp/B0001'));
  });
});
