import express from 'express';
import { validateMatch } from './validation.js';
import { insertMatch, listMatches, getLeaderboard } from './db.js';

/**
 * Builds the Express app. The pool is injected so integration tests can
 * point it at a throwaway database.
 */
export function createApp({ pool, version = process.env.APP_VERSION || 'dev' }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'up', version });
    } catch {
      res.status(503).json({ status: 'error', db: 'down', version });
    }
  });

  app.get('/api/matches', async (req, res, next) => {
    try {
      const limit = Math.min(Number.parseInt(req.query.limit, 10) || 20, 100);
      res.json(await listMatches(pool, limit));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/matches', async (req, res, next) => {
    const result = validateMatch(req.body);
    if (!result.valid) return res.status(400).json({ errors: result.errors });
    try {
      res.status(201).json(await insertMatch(pool, result.value));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/leaderboard', async (_req, res, next) => {
    try {
      res.json(await getLeaderboard(pool));
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
