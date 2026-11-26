/**
 * ============================================================================
 *  INTEGRATION TEST – online play over WebSocket   Testing Pyramid level: 3
 * ============================================================================
 *  Type:     Integration test (Vitest + the "ws" WebSocket client + Supertest)
 *  Tests:    the pieces of online play WORKING TOGETHER:
 *              backend/src/ws.js     the WebSocket endpoint (/api/ws)
 *              backend/src/lobby.js  matchmaking and the game rules
 *              backend/src/db.js     saving the result in PostgreSQL
 *            The unit tests check the Lobby alone with fake connections; this
 *            test uses a real HTTP server, real WebSocket connections and a
 *            real database.
 *  Fakes:    nothing. (random() is fixed so that the first player is always X.)
 *  Needs:    a throwaway PostgreSQL database (see testDb.js)
 *  Speed:    about a second
 *  Run:      cd backend  ->  npm run test:integration
 * ============================================================================
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApp } from '../../src/app.js';
import { insertMatch } from '../../src/db.js';
import { createTestPool, prepareTestDb } from './testDb.js';
import { Lobby } from '../../src/lobby.js';
import { attachLobby, WS_PATH } from '../../src/ws.js';

const pool = createTestPool(); // connection to the test database
// The real Lobby, saving finished games into the real database.
const lobby = new Lobby({ onFinish: (m) => insertMatch(pool, m), random: () => 0 });
const app = createApp({ pool, lobby, version: 'test' });
let server;
let wss;
let url;

// Once: create the table, start the HTTP server on a free port (0 = any),
// attach the WebSocket endpoint and remember its address.
beforeAll(async () => {
  await prepareTestDb(pool);
  server = app.listen(0);
  ({ wss } = attachLobby(server, { pool, lobby }));
  url = `ws://127.0.0.1:${server.address().port}${WS_PATH}`;
});
// Before each test: empty the matches table.
beforeEach(async () => {
  await pool.query('TRUNCATE matches RESTART IDENTITY');
});
// At the end: close every connection, the server and the database.
afterAll(async () => {
  // Guarded: if the database was unreachable, the server was never started.
  for (const ws of wss?.clients ?? []) ws.terminate();
  wss?.close();
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
});

/**
 * A small test client = one player's browser connection.
 *   send(msg)          sends a message to the server
 *   next(type, match)  waits for the next message of that type from the server
 *                      (optionally one that also matches a condition)
 * Both players receive every move, so the test waits for a SPECIFIC move
 * (by cell index), not just "any move".
 */
async function client() {
  const ws = new WebSocket(url);
  const inbox = []; // messages that arrived before anyone waited for them
  const waiters = []; // tests currently waiting for a message
  const fits = (w, msg) => w.type === msg.type && w.match(msg);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex((w) => fits(w, msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((r) => ws.once('open', r)); // wait until connected
  return {
    send: (m) => ws.send(JSON.stringify(m)),
    next: (type, match = () => true) => {
      const i = inbox.findIndex((m) => fits({ type, match }, m));
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve) => waiters.push({ type, match, resolve }));
    },
    close: () => ws.close(),
  };
}

describe('Online matchmaking over WebSocket (integration)', () => {
  // --------------------------------------------------------------------------
  // TEST 1 – A whole online game through the real network and database
  // Checks:
  //   1. Alice joins over a real WebSocket and is queued; the REST endpoint
  //      /api/lobby shows 1 waiting player (WebSocket and REST share state)
  //   2. Bob joins -> both are paired: Alice is X, Bob is O
  //   3. they play alternately; every move travels to the OTHER player
  //   4. Alice completes five -> Bob is told "X wins (five in a row)"
  //   5. the server confirms the match was saved
  //   6. GET /api/matches reads it back from PostgreSQL with the right data
  //      (names, mode "pvp", winner X, 9 moves)
  // --------------------------------------------------------------------------
  it('pairs two players, plays the game on the server and stores the result', async () => {
    const a = await client(); // Alice's connection
    const b = await client(); // Bob's connection

    // 1. Alice joins and waits.
    a.send({ type: 'join', name: 'Alice' });
    await a.next('queued');
    expect((await request(app).get('/api/lobby')).body).toEqual({ waiting: 1, playing: 0 });

    // 2. Bob joins -> the game starts.
    b.send({ type: 'join', name: 'Bob' });
    expect(await a.next('start')).toMatchObject({ you: 'X', players: { X: 'Alice', O: 'Bob' } });
    expect(await b.next('start')).toMatchObject({ you: 'O' });

    // 3. Four rounds: Alice (X) on row 0, Bob (O) on row 1.
    //    After each move, wait until the OTHER player has received it.
    for (let c = 0; c < 4; c++) {
      a.send({ type: 'move', index: c });
      await b.next('move', (m) => m.index === c);
      b.send({ type: 'move', index: 15 + c });
      await a.next('move', (m) => m.index === 15 + c);
    }
    // 4. Alice's fifth X (cell 4) completes the line.
    a.send({ type: 'move', index: 4 });
    expect(await b.next('end')).toMatchObject({ winner: 'X', reason: 'five' });
    // 5. The server has written the result to the database.
    await a.next('saved');

    // 6. Read it back through the REST API (from PostgreSQL).
    const { body } = await request(app).get('/api/matches');
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ playerX: 'Alice', playerO: 'Bob', mode: 'pvp', winner: 'X', moves: 9 });
    a.close();
    b.close();
  });
});
