import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import type { DB } from '../db.js';
import { scrape } from '../scraper/index.js';
import { scrapeSchema } from '../validation.js';

export function scrapeRouter(db: DB): Router {
  const router = Router();

  router.post(
    '/',
    requireAuth(db),
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      message: { code: 'RATE_LIMITED', message: 'Too many link lookups, please wait a minute' },
    }),
    async (req, res) => {
      const { input } = scrapeSchema.parse(req.body);
      res.json(await scrape(input, config.scraperAcceptLanguage));
    },
  );

  return router;
}
