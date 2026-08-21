import { Pool } from 'pg';

// Worker uses DATABASE_URL (pooled) for queries.
// Each worker process creates its own pool.
export function createWorkerPool(connectionString?: string): Pool {
  const url = connectionString ?? process.env['DATABASE_URL'];
  return new Pool({
    connectionString: url,
    ssl: url && !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
