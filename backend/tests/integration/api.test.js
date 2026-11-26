/**
 * ============================================================================
 *  INTEGRATION TESTS – REST API + PostgreSQL       Testing Pyramid level: 3
 * ============================================================================
 *  Type:     Integration test (Vitest + Supertest)
 *  Tests:    backend/src/app.js (the Express routes), backend/src/validation.js
 *            and backend/src/db.js (the SQL queries) WORKING TOGETHER with a
 *            real PostgreSQL database.
 *              POST /api/matches    save a finished AI game
 *              GET  /api/leaderboard  wins/losses/draws per player (SQL)
 *  Fakes:    nothing. Supertest sends real HTTP requests to the Express app,
 *            and the data really goes into PostgreSQL.
 *  Needs:    a throwaway PostgreSQL database (see testDb.js)
 *              - in CI: GitHub starts one automatically (service container)
 *              - locally: docker run ... postgres:16-alpine (README, section 5)
 *  Speed:    seconds
 *  Run:      cd backend  ->  npm run test:integration
 * ============================================================================
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestPool, prepareTestDb } from './testDb.js';

const pool = createTestPool(); // connection to the test database
const app = createApp({ pool, version: 'test' }); // the real Express app

// Once before all tests: create the "matches" table (or explain clearly
// that the test database is missing).
beforeAll(async () => {
  await prepareTestDb(pool);
});
// Before EACH test: empty the table, so tests never depend on each other.
beforeEach(async () => {
  await pool.query('TRUNCATE matches RESTART IDENTITY');
});
// After all tests: close the database connection.
afterAll(async () => {
  await pool.end();
});

describe('Amoba API + PostgreSQL (integration)', () => {
  // --------------------------------------------------------------------------
  // TEST 1 – Saving results and building the leaderboard (business logic, SQL)
  // Checks:
  //   1. POST /api/matches saves an AI game and answers 201 Created with the
  //      stored row (it got id 1, so it really is in the database)
  //   2. the leaderboard SQL counts wins, losses and draws for BOTH sides
  //   3. "Dorina" and "dorina" are counted as ONE player (case-insensitive)
  //   4. the order is correct: most wins first
  // Why: unit tests cannot check SQL; only a real database proves it works.
  // --------------------------------------------------------------------------
  it('stores AI games and builds the leaderboard from them, merging names case-insensitively', async () => {
    // Helper: send an AI game result (O is always the Neon AI).
    const post = (m) => request(app).post('/api/matches').send({ playerO: 'Neon AI', mode: 'pve', ...m });
    const created = await post({ playerX: 'Dorina', winner: 'X', moves: 9 }); // Dorina wins
    expect(created.status).toBe(201); // 1. created
    expect(created.body).toMatchObject({ id: 1, playerX: 'Dorina', playerO: 'Neon AI', winner: 'X' });
    await post({ playerX: 'dorina', winner: 'X', moves: 11 }); // lowercase "dorina" wins again
    await post({ playerX: 'Dorina', winner: 'draw', moves: 225 }); // a draw on a full board

    const board = await request(app).get('/api/leaderboard');
    // 2-4. One row per player, "Dorina" + "dorina" merged: 2 wins, 1 draw, 3 games.
    expect(board.body).toEqual([
      { name: 'Dorina', wins: 2, losses: 0, draws: 1, games: 3 },
      { name: 'Neon AI', wins: 0, losses: 2, draws: 1, games: 3 },
    ]);
  });

  // --------------------------------------------------------------------------
  // TEST 2 – Forged or invalid results are refused (security rule)
  // Sends five bad results to the API. Each must be refused with
  // 400 Bad Request and an error list, and NOTHING may be saved.
  //   1. an online (PvP) result from a browser - online games are saved only
  //      by the server, so a browser cannot invent online wins
  //   2. a generic name ("Player X")
  //   3. a human pretending to be the AI ("Neon AI")
  //   4. an impossible number of moves (the board only has 225 cells)
  //   5. empty / nonsense data
  // Finally: the database is checked directly - it must still be empty.
  // --------------------------------------------------------------------------
  it('rejects forged or invalid results and stores nothing', async () => {
    const forged = [
      { playerX: 'Alice', playerO: 'Bob', mode: 'pvp', winner: 'X', moves: 9 }, // 1. PvP is recorded by the server only
      { playerX: 'Player X', mode: 'pve', winner: 'X', moves: 9 }, // 2. generic name
      { playerX: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 }, // 3. impersonating the AI
      { playerX: 'Dorina', mode: 'pve', winner: 'X', moves: 500 }, // 4. impossible move count
      { playerX: '', mode: 'x' }, // 5. junk
    ];
    for (const body of forged) {
      const res = await request(app).post('/api/matches').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400); // refused
      expect(res.body.errors.length).toBeGreaterThan(0); // with a reason
    }
    // Look directly into the database: nothing was saved.
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM matches');
    expect(rows[0].n).toBe(0);
  });
});
