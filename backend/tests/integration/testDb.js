// Shared setup for the integration tests: they need a real, throwaway PostgreSQL.
import { createPool, migrate } from '../../src/db.js';

export const TEST_DB_URL = process.env.DATABASE_URL || 'postgres://amoba:amoba@localhost:5432/amoba_test';

export const createTestPool = () => createPool(TEST_DB_URL);

/** Creates the schema, or fails with one clear message instead of a cascade of errors. */
export async function prepareTestDb(pool) {
  try {
    await migrate(pool);
  } catch (err) {
    const where = TEST_DB_URL.replace(/:[^:@/]+@/, ':***@');
    throw new Error(
      `Integration tests need a PostgreSQL test database at ${where} (${err.message}).\n` +
        'Start one with Docker:\n' +
        '  docker run --rm -d --name amoba-pg -p 5433:5432 -e POSTGRES_USER=amoba -e POSTGRES_PASSWORD=amoba ' +
        '-e POSTGRES_DB=amoba_test postgres:16-alpine\n' +
        'then (PowerShell): $env:DATABASE_URL="postgres://amoba:amoba@localhost:5433/amoba_test"; npm run test:integration\n' +
        'No Docker? Skip them locally: CI runs them on every push.',
    );
  }
}
