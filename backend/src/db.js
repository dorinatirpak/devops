import pg from 'pg';

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new pg.Pool({ connectionString, max: 5 });
}

export async function migrate(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id          SERIAL PRIMARY KEY,
      player_x    TEXT        NOT NULL,
      player_o    TEXT        NOT NULL,
      mode        TEXT        NOT NULL CHECK (mode IN ('pvp', 'pve')),
      winner      TEXT        NOT NULL CHECK (winner IN ('X', 'O', 'draw')),
      moves       INTEGER     NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

/** Retries until Postgres accepts connections (useful on container start). */
export async function waitForDb(pool, { retries = 20, delayMs = 1500 } = {}) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`DB not ready (attempt ${i}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function insertMatch(pool, m) {
  const { rows } = await pool.query(
    `INSERT INTO matches (player_x, player_o, mode, winner, moves)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, player_x AS "playerX", player_o AS "playerO", mode, winner, moves, created_at AS "createdAt"`,
    [m.playerX, m.playerO, m.mode, m.winner, m.moves],
  );
  return rows[0];
}

export async function listMatches(pool, limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, player_x AS "playerX", player_o AS "playerO", mode, winner, moves, created_at AS "createdAt"
     FROM matches ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function getLeaderboard(pool, limit = 10) {
  const { rows } = await pool.query(
    `WITH results AS (
       SELECT player_x AS name,
              (winner = 'X')::int AS win, (winner = 'O')::int AS loss, (winner = 'draw')::int AS draw
       FROM matches
       UNION ALL
       SELECT player_o,
              (winner = 'O')::int, (winner = 'X')::int, (winner = 'draw')::int
       FROM matches
     )
     -- "Dorina" and "dorina" are the same player
     SELECT MIN(name)      AS name,
            SUM(win)::int  AS wins,
            SUM(loss)::int AS losses,
            SUM(draw)::int AS draws,
            COUNT(*)::int  AS games
     FROM results
     GROUP BY lower(name)
     ORDER BY wins DESC, losses ASC, MIN(name) ASC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
