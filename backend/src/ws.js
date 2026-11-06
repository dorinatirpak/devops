import { WebSocketServer, WebSocket } from 'ws';
import { Lobby } from './lobby.js';
import { insertMatch } from './db.js';

export const WS_PATH = '/api/ws';
const HEARTBEAT_MS = 25_000; // below typical proxy idle timeouts (NPM/Cloudflare)

/** Attaches the matchmaking WebSocket endpoint to an existing HTTP server. */
export function attachLobby(server, { pool, lobby = new Lobby({ onFinish: (m) => insertMatch(pool, m) }) }) {
  const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 1024 });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    const conn = {
      send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    };

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return conn.send({ type: 'error', code: 'bad_message', message: 'Invalid JSON' });
      }
      return lobby.handle(conn, msg);
    });
    ws.on('close', () => lobby.leave(conn));
  });

  // Drop connections that vanished without a close frame (closed laptop, lost Wi-Fi).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return { wss, lobby };
}
