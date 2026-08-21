import { Pool } from 'pg';

// Worker uses DATABASE_URL (pooled) for queries.
// Each worker process creates its own pool.
export function createWorkerPool(connectionString?: string): Pool {
  return new Pool({
    connectionString: connectionString ?? process.env['DATABASE_URL'],
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
