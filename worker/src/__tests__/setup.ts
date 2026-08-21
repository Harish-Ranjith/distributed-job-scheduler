import { afterAll } from 'vitest';
import { Pool } from 'pg';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/job_scheduler_test';

export const testPool = new Pool({
  connectionString: TEST_DB_URL,
  ssl: TEST_DB_URL.includes('localhost') || TEST_DB_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
});

afterAll(async () => {
  await testPool.end();
});
