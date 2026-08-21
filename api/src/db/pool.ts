import { Pool, Client } from 'pg';

// ─── Shared pool for all API queries (pooled Neon connection) ─────────────────
// PgBouncer transaction mode: safe for standard queries but NOT for LISTEN/NOTIFY
// or multi-statement session operations.
export const pool = new Pool({
  connectionString: process.env['DATABASE_URL'],
  ssl: { rejectUnauthorized: false },
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
  return new Client({
    connectionString: process.env['DATABASE_DIRECT_URL'],
    ssl: { rejectUnauthorized: false },
  });
}
