import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import express from 'express';
import { errorHandler } from '../errors.js';
import { wellKnownRouter } from './well-known.js';

async function get(appIds: string[], path: string) {
  const app = express().use('/.well-known', wellKnownRouter(appIds)).use(errorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
    return { status: response.status, type: response.headers.get('content-type'), body: await response.json() };
  } finally {
    server.close();
  }
}

describe('/.well-known', () => {
  it('serves the apple-app-site-association for share links', async () => {
    const result = await get(['ABCDE12345.cx.hein.wishlist'], '/.well-known/apple-app-site-association');
    assert.equal(result.status, 200);
    assert.match(result.type ?? '', /application\/json/);
    assert.deepEqual(result.body.applinks.details[0].appIDs, ['ABCDE12345.cx.hein.wishlist']);
    assert.equal(result.body.applinks.details[0].components[0]['/'], '/s/*');
  });

  it('is absent when no iOS app is configured', async () => {
    const result = await get([], '/.well-known/apple-app-site-association');
    assert.equal(result.status, 404);
  });
});
