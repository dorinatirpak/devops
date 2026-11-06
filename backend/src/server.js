import { createApp } from './app.js';
import { createPool, migrate, waitForDb, insertMatch } from './db.js';
import { Lobby } from './lobby.js';
import { attachLobby } from './ws.js';

const PORT = Number(process.env.PORT) || 4000;

const pool = createPool();
await waitForDb(pool);
await migrate(pool);

// Online matches are decided and saved by the server, never by a browser.
const lobby = new Lobby({ onFinish: (match) => insertMatch(pool, match) });

const server = createApp({ pool, lobby }).listen(PORT, () => {
  console.log(`Amoba API listening on :${PORT} (version ${process.env.APP_VERSION || 'dev'})`);
});
const { wss } = attachLobby(server, { pool, lobby });

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  wss.close();
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
