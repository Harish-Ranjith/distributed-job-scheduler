import { test, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { runSchedulerTick } from '../services/scheduler.js';
import { runReaperTick } from '../services/reaper.js';
import type { FastifyBaseLogger } from 'fastify';

const log = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;
let queueId: string;
let testWorkerId: string | null = null;

beforeAll(async () => {
  const organizationId = uuidv4();
  const projectId = uuidv4();
  queueId = uuidv4();
  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Recovery Org', $1)`, [organizationId]);
  await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Recovery Project')`, [projectId, organizationId]);
  await pool.query(`INSERT INTO queues (id, project_id, name) VALUES ($1, $2, 'Recovery Queue')`, [queueId, projectId]);
});

afterEach(async () => {
  await pool.query('DELETE FROM scheduled_jobs WHERE queue_id = $1', [queueId]);
  await pool.query('DELETE FROM jobs WHERE queue_id = $1', [queueId]);
  if (testWorkerId) {
    await pool.query('DELETE FROM workers WHERE id = $1', [testWorkerId]);
    testWorkerId = null;
  }
});

afterAll(async () => {
  await pool.end();
});

test('concurrent scheduler ticks spawn one job instance', async () => {
  const scheduleId = uuidv4();
  await pool.query(
    `INSERT INTO scheduled_jobs (id, queue_id, name, cron_expression, job_template, next_run_at)
     VALUES ($1, $2, 'Every minute', '* * * * *', '{"job_type":"send_email","payload":{}}', NOW() - INTERVAL '1 minute')`,
    [scheduleId, queueId]
  );

  await Promise.all([runSchedulerTick(log), runSchedulerTick(log)]);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM jobs WHERE queue_id = $1', [queueId]);
  expect(rows[0].count).toBe(1);
});

test('reaper recovers expired lease and clears ownership', async () => {
  const workerId = uuidv4();
  testWorkerId = workerId;
  const jobId = uuidv4();
  await pool.query(
    `INSERT INTO workers (id, hostname, pid, status) VALUES ($1, 'test', 1, 'active')`,
    [workerId]
  );
  await pool.query(
    `INSERT INTO worker_heartbeats (worker_id, received_at) VALUES ($1, NOW() - INTERVAL '2 minutes')`,
    [workerId]
  );
  await pool.query(
    `INSERT INTO jobs (id, queue_id, job_type, status, worker_id, lease_token, lease_expires_at)
     VALUES ($1, $2, 'send_email', 'running', $3, $4, NOW() - INTERVAL '1 minute')`,
    [jobId, queueId, workerId, uuidv4()]
  );

  await runReaperTick(log);

  const { rows } = await pool.query('SELECT status, worker_id, lease_token FROM jobs WHERE id = $1', [jobId]);
  const workerRows = await pool.query('SELECT status FROM workers WHERE id = $1', [workerId]);
  expect(rows[0].status).toBe('queued');
  expect(rows[0].worker_id).toBeNull();
  expect(rows[0].lease_token).toBeNull();
  expect(workerRows.rows[0].status).toBe('offline');
});
