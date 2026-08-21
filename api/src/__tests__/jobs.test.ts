import { test, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { v4 as uuidv4 } from 'uuid';

let token: string;
let orgId: string;
let projectId: string;
let queueId: string;

beforeAll(async () => {
  // Create test user and get token
  const email = `jobs-test-${Date.now()}@example.com`;
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'password123', name: 'Jobs Test User' },
  });
  
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'password123' },
  });
  token = loginRes.json().token;
  
  // Setup org, project, queue
  orgId = uuidv4();
  projectId = uuidv4();
  queueId = uuidv4();

  await pool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Jobs Test Org', $1)`, [orgId]);
  await pool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Jobs Test Proj')`, [projectId, orgId]);
  await pool.query(`INSERT INTO queues (id, project_id, name) VALUES ($1, $2, 'Jobs Test Queue')`, [queueId, projectId]);
});

afterAll(async () => {
  await pool.query('DELETE FROM jobs WHERE queue_id = $1', [queueId]);
  await pool.query('DELETE FROM queues WHERE id = $1', [queueId]);
});

test('Create immediate job', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/jobs',
    headers: { Authorization: `Bearer ${token}` },
    payload: {
      queue_id: queueId,
      job_type: 'test_job',
      payload: { foo: 'bar' },
      priority: 10
    }
  });

  expect(res.statusCode).toBe(201);
  const job = res.json();
  expect(job.status).toBe('queued');
  expect(job.priority).toBe(10);
  expect(job.payload).toEqual({ foo: 'bar' });
});

test('Idempotent job creation', async () => {
  const idempotencyKey = uuidv4();
  
  const payload = {
    queue_id: queueId,
    job_type: 'test_job',
    payload: {},
    idempotency_key: idempotencyKey
  };

  const res1 = await app.inject({
    method: 'POST',
    url: '/api/v1/jobs',
    headers: { Authorization: `Bearer ${token}` },
    payload
  });
  
  expect(res1.statusCode).toBe(201);
  const job1 = res1.json();

  const res2 = await app.inject({
    method: 'POST',
    url: '/api/v1/jobs',
    headers: { Authorization: `Bearer ${token}` },
    payload
  });
  
  expect(res2.statusCode).toBe(200); // 200 OK means it returned existing
  const job2 = res2.json();
  
  expect(job1.id).toBe(job2.id);
});
