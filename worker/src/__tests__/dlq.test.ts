import { test, expect, beforeAll, afterEach } from 'vitest';
import { testPool } from './setup.js';
import { executeJob } from '../executor.js';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const noopLog = pino({ level: 'silent' });
let orgId: string, projectId: string, queueId: string;

beforeAll(async () => {
  orgId = uuidv4();
  projectId = uuidv4();
  queueId = uuidv4();

  await testPool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Test Org', $1)`, [orgId]);
  await testPool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Test Proj')`, [projectId, orgId]);
  await testPool.query(`INSERT INTO queues (id, project_id, name) VALUES ($1, $2, 'DLQ Test')`, [queueId, projectId]);
});

afterEach(async () => {
  await testPool.query('DELETE FROM dead_letter_jobs WHERE queue_id = $1', [queueId]);
  await testPool.query('DELETE FROM jobs WHERE queue_id = $1', [queueId]);
});

test('Job hitting max attempts goes to dead letter queue', async () => {
  // Create job that is at its max attempt and claims to fail
  const { rows } = await testPool.query(
    `INSERT INTO jobs (queue_id, job_type, payload, status, attempt_count, max_attempts)
     VALUES ($1, 'send_email', '{"throwError": true}', 'claimed', 2, 3) RETURNING *`,
    [queueId]
  );
  
  const job = rows[0];

  // Execute it (this is attempt #3)
  await executeJob(testPool, job, 'test-worker', noopLog);

  // Check jobs table -> status should be dead_letter
  const { rows: jobsRows } = await testPool.query('SELECT status, attempt_count FROM jobs WHERE id = $1', [job.id]);
  expect(jobsRows[0].status).toBe('dead_letter');
  expect(jobsRows[0].attempt_count).toBe(3);

  // Check dead_letter_jobs table
  const { rows: dlqRows } = await testPool.query('SELECT * FROM dead_letter_jobs WHERE original_job_id = $1', [job.id]);
  expect(dlqRows).toHaveLength(1);
  expect(dlqRows[0].failure_reason).toBe('Simulated failure');
});
