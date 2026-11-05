import { createApp } from './app.js';
import { createPool, migrate, waitForDb } from './db.js';

const PORT = Number(process.env.PORT) || 4000;

const pool = createPool();
await waitForDb(pool);
await migrate(pool);

const server = createApp({ pool }).listen(PORT, () => {
  console.log(`Amoba API listening on :${PORT} (version ${process.env.APP_VERSION || 'dev'})`);
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
