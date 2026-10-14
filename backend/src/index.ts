import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';

const db = openDatabase(config.databaseFile);
const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`Wishlist API listening on http://localhost:${config.port}`);
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
