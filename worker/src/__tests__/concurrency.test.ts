import { test, expect, beforeAll, afterEach } from 'vitest';
import { testPool } from './setup.js';
import { claimJob } from '../claimer.js';
import { v4 as uuidv4 } from 'uuid';

let orgId: string;
let projectId: string;
let queueId: string;

beforeAll(async () => {
  // Setup isolated queue for this test
  orgId = uuidv4();
  projectId = uuidv4();
  queueId = uuidv4();

  await testPool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Test Org', $1)`, [orgId]);
  await testPool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Test Proj')`, [projectId, orgId]);
  await testPool.query(`INSERT INTO queues (id, project_id, name, concurrency_limit) VALUES ($1, $2, 'Concurrency Test', 10)`, [queueId, projectId]);
});

afterEach(async () => {
  await testPool.query('DELETE FROM jobs WHERE queue_id = $1', [queueId]);
});

test('Concurrent claimJob calls do not claim the same job (SKIP LOCKED works)', async () => {
  // Insert 5 jobs
  for (let i = 0; i < 5; i++) {
    await testPool.query(
      `INSERT INTO jobs (queue_id, job_type, payload) VALUES ($1, 'test', '{}')`,
      [queueId]
    );
  }

  // Fire 10 concurrent claim requests (simulating 10 workers)
  const claimPromises = Array.from({ length: 10 }).map((_, i) => 
    claimJob(testPool, queueId, uuidv4())
  );

  const results = await Promise.all(claimPromises);
  
  const claimedJobs = results.filter(j => j !== null);
  
  // We expect exactly 5 claims to succeed, and 5 to return null
  expect(claimedJobs.length).toBe(5);

  // Assert no duplicates were claimed
  const jobIds = claimedJobs.map(j => j!.id);
  const uniqueJobIds = new Set(jobIds);
  expect(uniqueJobIds.size).toBe(5);
});
