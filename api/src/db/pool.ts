import { Pool, Client } from 'pg';

const databaseUrl = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const databaseSsl = databaseUrl && !/localhost|127\.0\.0\.1/.test(databaseUrl)
  ? { rejectUnauthorized: false }
  : false;

// ─── Shared pool for all API queries (pooled Neon connection) ─────────────────
// PgBouncer transaction mode: safe for standard queries but NOT for LISTEN/NOTIFY
// or multi-statement session operations.
export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err);
});

// ─── Direct client factory (session-mode Neon connection) ─────────────────────
// Use for: LISTEN/NOTIFY relay and migration runner.
// Each call creates a new client; caller is responsible for connect() and end().
export function createDirectClient(): Client {
  const directUrl = process.env['DATABASE_DIRECT_URL'];
  return new Client({
    connectionString: directUrl,
    ssl: directUrl && !/localhost|127\.0\.0\.1/.test(directUrl) ? { rejectUnauthorized: false } : false,
  });
}
