/**
 * Integration tests: real Express app + real PostgreSQL (no mocks).
 * Locally:  see testDb.js / README ("Running locally"); `npm run test:integration`.
 * In CI:    a Postgres "service container" provides the database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createTestPool, prepareTestDb } from './testDb.js';

const pool = createTestPool();
const app = createApp({ pool, version: 'test' });

beforeAll(async () => {
  await prepareTestDb(pool);
});
beforeEach(async () => {
  await pool.query('TRUNCATE matches RESTART IDENTITY');
});
afterAll(async () => {
  await pool.end();
});

describe('Amoba API + PostgreSQL (integration)', () => {
  it('stores AI games and builds the leaderboard from them, merging names case-insensitively', async () => {
    const post = (m) => request(app).post('/api/matches').send({ playerO: 'Neon AI', mode: 'pve', ...m });
    const created = await post({ playerX: 'Dorina', winner: 'X', moves: 9 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 1, playerX: 'Dorina', playerO: 'Neon AI', winner: 'X' });
    await post({ playerX: 'dorina', winner: 'X', moves: 11 });
    await post({ playerX: 'Dorina', winner: 'draw', moves: 225 });

    const board = await request(app).get('/api/leaderboard');
    expect(board.body).toEqual([
      { name: 'Dorina', wins: 2, losses: 0, draws: 1, games: 3 },
      { name: 'Neon AI', wins: 0, losses: 2, draws: 1, games: 3 },
    ]);
  });

  it('rejects forged or invalid results and stores nothing', async () => {
    const forged = [
      { playerX: 'Alice', playerO: 'Bob', mode: 'pvp', winner: 'X', moves: 9 }, // PvP is recorded by the server only
      { playerX: 'Player X', mode: 'pve', winner: 'X', moves: 9 }, // generic name
      { playerX: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 }, // impersonating the AI
      { playerX: 'Dorina', mode: 'pve', winner: 'X', moves: 500 }, // impossible move count
      { playerX: '', mode: 'x' },
    ];
    for (const body of forged) {
      const res = await request(app).post('/api/matches').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.errors.length).toBeGreaterThan(0);
    }
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM matches');
    expect(rows[0].n).toBe(0);
  });
});
