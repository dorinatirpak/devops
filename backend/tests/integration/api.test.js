/**
 * Integration tests: real Express app + real PostgreSQL (no mocks).
 * Locally:  docker run --rm -d -p 5432:5432 -e POSTGRES_USER=amoba -e POSTGRES_PASSWORD=amoba -e POSTGRES_DB=amoba_test postgres:16-alpine
 * In CI:    a Postgres "service container" provides the database.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createPool, migrate } from '../../src/db.js';

const pool = createPool(
  process.env.DATABASE_URL || 'postgres://amoba:amoba@localhost:5432/amoba_test',
);
const app = createApp({ pool, version: 'test' });

beforeAll(async () => {
  await migrate(pool);
});
beforeEach(async () => {
  await pool.query('TRUNCATE matches RESTART IDENTITY');
});
afterAll(async () => {
  await pool.end();
});

describe('Amoba API + PostgreSQL (integration)', () => {
  it('GET /api/health reports the database as up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up', version: 'test' });
  });

  it('POST /api/matches persists a match and it shows up in the leaderboard', async () => {
    const created = await request(app)
      .post('/api/matches')
      .send({ playerX: 'Dorina', playerO: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 1, playerX: 'Dorina', winner: 'X' });

    await request(app)
      .post('/api/matches')
      .send({ playerX: 'Dorina', playerO: 'Neon AI', mode: 'pve', winner: 'draw', moves: 225 });

    const board = await request(app).get('/api/leaderboard');
    expect(board.status).toBe(200);
    expect(board.body[0]).toEqual({ name: 'Dorina', wins: 1, losses: 0, draws: 1, games: 2 });
    expect(board.body[1]).toEqual({ name: 'Neon AI', wins: 0, losses: 1, draws: 1, games: 2 });
  });

  it('GET /api/leaderboard merges names case-insensitively', async () => {
    for (const playerX of ['Dorina', 'dorina']) {
      await request(app)
        .post('/api/matches')
        .send({ playerX, playerO: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 });
    }
    const board = await request(app).get('/api/leaderboard');
    expect(board.body[0]).toEqual({ name: 'Dorina', wins: 2, losses: 0, draws: 0, games: 2 });
    expect(board.body).toHaveLength(2);
  });

  it('POST /api/matches rejects invalid payloads and stores nothing', async () => {
    const res = await request(app).post('/api/matches').send({ playerX: '', mode: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);

    const generic = await request(app)
      .post('/api/matches')
      .send({ playerX: 'Player X', playerO: 'Neon AI', mode: 'pve', winner: 'X', moves: 9 });
    expect(generic.status).toBe(400);

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM matches');
    expect(rows[0].n).toBe(0);
  });

  it('GET /api/matches returns newest first', async () => {
    for (const winner of ['X', 'O']) {
      await request(app)
        .post('/api/matches')
        .send({ playerX: 'Alice', playerO: 'Neon AI', mode: 'pve', winner, moves: 10 });
    }
    const res = await request(app).get('/api/matches');
    expect(res.body.map((m) => m.winner)).toEqual(['O', 'X']);
  });
});
