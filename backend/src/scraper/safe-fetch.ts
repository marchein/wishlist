import dns from 'node:dns';
import net, { type LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch, type Response } from 'undici';

// Fetching arbitrary user-supplied URLs is an SSRF risk. Every hop (including redirects) is checked,
// and DNS answers are validated at connect time so DNS rebinding can't sneak in private addresses.

export type ScrapeErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'URL_HAS_CREDENTIALS'
  | 'PORT_NOT_ALLOWED'
  | 'PRIVATE_ADDRESS'
  | 'TOO_MANY_REDIRECTS';

export class ScrapeError extends Error {
  constructor(
    readonly code: ScrapeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === 'unicast';
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      return callback(new ScrapeError('PRIVATE_ADDRESS', `${hostname} resolves to a private or reserved address`), '');
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 5_000 },
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
});

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScrapeError('INVALID_URL', 'This is not a valid link');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScrapeError('UNSUPPORTED_PROTOCOL', 'Only http(s) links are supported');
  }
  if (url.username || url.password) throw new ScrapeError('URL_HAS_CREDENTIALS', 'Links with credentials are not supported');
  if (!ALLOWED_PORTS.has(url.port)) throw new ScrapeError('PORT_NOT_ALLOWED', 'This port is not allowed');

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isPrivateIp = net.isIP(host) !== 0 && !isPublicAddress(host);
  if (isPrivateIp || host === 'localhost' || /\.(localhost|local|internal|home\.arpa)$/.test(host)) {
    throw new ScrapeError('PRIVATE_ADDRESS', 'Private or local addresses are not allowed');
  }
  return url;
}

export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  /** Decoded HTML, or null when the response wasn't an HTML document. */
  html: string | null;
}

export async function fetchPage(rawUrl: string, acceptLanguage: string): Promise<FetchedPage> {
  let url = assertSafeUrl(rawUrl);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  // Some shops set cookies on a redirect and expect them on the next hop; kept per host only.
  const cookieJar = new Map<string, Map<string, string>>();

  for (let hop = 0; ; hop++) {
    const cookies = cookieJar.get(url.host);
    const response = await fetch(url, {
      dispatcher: agent,
      redirect: 'manual',
      signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': acceptLanguage,
        ...(cookies?.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
    });

    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq <= 0) continue;
      const jar = cookieJar.get(url.host) ?? new Map<string, string>();
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      cookieJar.set(url.host, jar);
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      if (hop >= MAX_REDIRECTS) throw new ScrapeError('TOO_MANY_REDIRECTS', 'Too many redirects');
      url = assertSafeUrl(new URL(location, url).toString());
      continue;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      return { finalUrl: url.toString(), status: response.status, contentType, html: null };
    }
    return {
      finalUrl: url.toString(),
      status: response.status,
      contentType,
      html: await readHtml(response, contentType),
    };
  }
}

async function readHtml(response: Response, contentType: string): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
      if (total >= MAX_BODY_BYTES) {
        // A truncated page still contains the <head> meta tags we care about.
        await reader.cancel();
        break;
      }
    }
  }
  const buffer = Buffer.concat(chunks);
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(buffer.subarray(0, 4096).toString('latin1'))?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}
