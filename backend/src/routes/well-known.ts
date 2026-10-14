import { Router } from 'express';
import { notFound } from '../errors.js';

/** Files under /.well-known that operating systems fetch from the public domain. */
export function wellKnownRouter(iosAppIds: readonly string[]): Router {
  const router = Router();

  // Universal Links: iOS opens https://<domain>/s/<token> in the app instead of Safari.
  router.get('/apple-app-site-association', (_req, res) => {
    if (iosAppIds.length === 0) throw notFound('Endpoint');
    res.json({
      applinks: {
        details: [{ appIDs: iosAppIds, components: [{ '/': '/s/*', comment: 'Shared wishlists' }] }],
      },
    });
  });

  return router;
}
