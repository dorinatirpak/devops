/**
 * Integration: real HTTP server + real WebSocket clients + real PostgreSQL.
 * Two players are matched by the lobby, play to five in a row, and the
 * server (not a browser) writes the result to the database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApp } from '../../src/app.js';
import { createPool, migrate, insertMatch } from '../../src/db.js';
import { Lobby } from '../../src/lobby.js';
import { attachLobby, WS_PATH } from '../../src/ws.js';

const pool = createPool(process.env.DATABASE_URL || 'postgres://amoba:amoba@localhost:5432/amoba_test');
const lobby = new Lobby({ onFinish: (m) => insertMatch(pool, m), random: () => 0 });
const app = createApp({ pool, lobby, version: 'test' });
let server;
let wss;
let url;

beforeAll(async () => {
  await migrate(pool);
  server = app.listen(0);
  ({ wss } = attachLobby(server, { pool, lobby }));
  url = `ws://127.0.0.1:${server.address().port}${WS_PATH}`;
});
beforeEach(async () => {
  await pool.query('TRUNCATE matches RESTART IDENTITY');
});
afterAll(async () => {
  for (const ws of wss.clients) ws.terminate();
  wss.close();
  await new Promise((r) => server.close(r));
  await pool.end();
});

/** Opens a socket; next(type) resolves with the next message of that type. */
async function client() {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.type === msg.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((r) => ws.once('open', r));
  return {
    send: (m) => ws.send(JSON.stringify(m)),
    next: (type) => {
      const i = inbox.findIndex((m) => m.type === type);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve) => waiters.push({ type, resolve }));
    },
    close: () => ws.close(),
  };
}

describe('Online matchmaking over WebSocket (integration)', () => {
  it('pairs two players, plays the game on the server and stores the result', async () => {
    const a = await client();
    const b = await client();
    a.send({ type: 'join', name: 'Alice' });
    await a.next('queued');
    expect((await request(app).get('/api/lobby')).body).toEqual({ waiting: 1, playing: 0 });

    b.send({ type: 'join', name: 'Bob' });
    expect(await a.next('start')).toMatchObject({ you: 'X', players: { X: 'Alice', O: 'Bob' } });
    expect(await b.next('start')).toMatchObject({ you: 'O' });

    for (let c = 0; c < 4; c++) {
      a.send({ type: 'move', index: c });
      await b.next('move');
      b.send({ type: 'move', index: 15 + c });
      await a.next('move');
    }
    a.send({ type: 'move', index: 4 });
    expect(await b.next('end')).toMatchObject({ winner: 'X', reason: 'five' });
    await a.next('saved');

    const { body } = await request(app).get('/api/matches');
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ playerX: 'Alice', playerO: 'Bob', mode: 'pvp', winner: 'X', moves: 9 });
    a.close();
    b.close();
  });

  it('refuses a second connection with a name that is already online', async () => {
    const a = await client();
    const b = await client();
    a.send({ type: 'join', name: 'Carol' });
    await a.next('queued');
    b.send({ type: 'join', name: 'CAROL' });
    expect(await b.next('error')).toMatchObject({ code: 'name_taken' });
    a.close();
    b.close();
  });

  it('POST /api/matches no longer accepts PvP results from browsers', async () => {
    const res = await request(app)
      .post('/api/matches')
      .send({ playerX: 'Alice', playerO: 'Bob', mode: 'pvp', winner: 'X', moves: 9 });
    expect(res.status).toBe(400);
  });
});
