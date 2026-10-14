import { randomBytes, randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { requireAuth } from '../auth.js';
import type { DB } from '../db.js';
import { notFound } from '../errors.js';
import { now, toItemDto, toWishlistDto, type ItemRow, type WishlistRow } from '../models.js';
import {
  createItemSchema,
  createWishlistSchema,
  updateItemSchema,
  updateWishlistSchema,
} from '../validation.js';

export const newShareToken = () => randomBytes(16).toString('base64url');

/** Builds "col = @key" assignments only for keys the client actually sent (PATCH semantics). */
function pickUpdates(req: Request, parsed: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const params: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.hasOwn(req.body ?? {}, key)) continue;
    const value = parsed[key];
    sets.push(`${column} = @${key}`);
    params[key] = Array.isArray(value) ? JSON.stringify(value) : value;
  }
  return { sets, params };
}

export function wishlistsRouter(db: DB): Router {
  const router = Router();
  router.use(requireAuth(db));

  const getOwnedWishlist = (id: string | undefined, userId: string) => {
    const row = db.prepare('SELECT * FROM wishlists WHERE id = ? AND owner_id = ?').get(id, userId) as
      | WishlistRow
      | undefined;
    if (!row) throw notFound('Wishlist');
    return row;
  };

  const getItem = (wishlistId: string, itemId: string | undefined) => {
    const row = db.prepare('SELECT * FROM items WHERE id = ? AND wishlist_id = ?').get(itemId, wishlistId) as
      | ItemRow
      | undefined;
    if (!row) throw notFound('Item');
    return row;
  };

  const touchWishlist = (id: string) => db.prepare('UPDATE wishlists SET updated_at = ? WHERE id = ?').run(now(), id);

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT w.*, (SELECT COUNT(*) FROM items i WHERE i.wishlist_id = w.id) AS item_count
         FROM wishlists w WHERE w.owner_id = ? ORDER BY w.updated_at DESC`,
      )
      .all(req.user!.id) as (WishlistRow & { item_count: number })[];
    res.json(rows.map(toWishlistDto));
  });

  router.post('/', (req, res) => {
    const input = createWishlistSchema.parse(req.body);
    const timestamp = now();
    const row: WishlistRow = {
      id: randomUUID(),
      owner_id: req.user!.id,
      title: input.title,
      description: input.description,
      event_date: input.eventDate,
      share_token: newShareToken(),
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.prepare(
      `INSERT INTO wishlists (id, owner_id, title, description, event_date, share_token, created_at, updated_at)
       VALUES (@id, @owner_id, @title, @description, @event_date, @share_token, @created_at, @updated_at)`,
    ).run(row);
    res.status(201).json(toWishlistDto({ ...row, item_count: 0 }));
  });

  // Owner view: deliberately contains no purchase information so the surprise isn't spoiled.
  router.get('/:id', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    const items = db
      .prepare('SELECT * FROM items WHERE wishlist_id = ? ORDER BY priority DESC, created_at ASC')
      .all(wishlist.id) as ItemRow[];
    res.json({ ...toWishlistDto({ ...wishlist, item_count: items.length }), items: items.map(toItemDto) });
  });

  router.patch('/:id', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    const input = updateWishlistSchema.parse(req.body);
    const { sets, params } = pickUpdates(req, input, {
      title: 'title',
      description: 'description',
      eventDate: 'event_date',
    });
    if (sets.length) {
      db.prepare(`UPDATE wishlists SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run({
        ...params,
        updatedAt: now(),
        id: wishlist.id,
      });
    }
    res.json(toWishlistDto(getOwnedWishlist(wishlist.id, req.user!.id)));
  });

  router.delete('/:id', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    db.prepare('DELETE FROM wishlists WHERE id = ?').run(wishlist.id);
    res.status(204).end();
  });

  // Invalidates the old share link, e.g. when it was sent to the wrong people.
  router.post('/:id/share-token', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    db.prepare('UPDATE wishlists SET share_token = ?, updated_at = ? WHERE id = ?').run(
      newShareToken(),
      now(),
      wishlist.id,
    );
    res.json(toWishlistDto(getOwnedWishlist(wishlist.id, req.user!.id)));
  });

  router.post('/:id/items', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    const input = createItemSchema.parse(req.body);
    const timestamp = now();
    const row: ItemRow = {
      id: randomUUID(),
      wishlist_id: wishlist.id,
      title: input.title,
      notes: input.notes,
      image_url: input.imageUrl,
      price: input.price,
      currency: input.currency,
      priority: input.priority,
      quantity: input.quantity,
      links: JSON.stringify(input.links),
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.prepare(
      `INSERT INTO items (id, wishlist_id, title, notes, image_url, price, currency, priority, quantity, links, created_at, updated_at)
       VALUES (@id, @wishlist_id, @title, @notes, @image_url, @price, @currency, @priority, @quantity, @links, @created_at, @updated_at)`,
    ).run(row);
    touchWishlist(wishlist.id);
    res.status(201).json(toItemDto(row));
  });

  router.patch('/:id/items/:itemId', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    const item = getItem(wishlist.id, req.params.itemId);
    const input = updateItemSchema.parse(req.body);
    const { sets, params } = pickUpdates(req, input, {
      title: 'title',
      notes: 'notes',
      imageUrl: 'image_url',
      price: 'price',
      currency: 'currency',
      priority: 'priority',
      quantity: 'quantity',
      links: 'links',
    });
    if (sets.length) {
      db.prepare(`UPDATE items SET ${sets.join(', ')}, updated_at = @updatedAt WHERE id = @id`).run({
        ...params,
        updatedAt: now(),
        id: item.id,
      });
      touchWishlist(wishlist.id);
    }
    res.json(toItemDto(getItem(wishlist.id, item.id)));
  });

  router.delete('/:id/items/:itemId', (req, res) => {
    const wishlist = getOwnedWishlist(req.params.id, req.user!.id);
    const item = getItem(wishlist.id, req.params.itemId);
    db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
    touchWishlist(wishlist.id);
    res.status(204).end();
  });

  return router;
}
