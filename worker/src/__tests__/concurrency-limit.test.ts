import { test, expect, beforeAll, afterEach } from 'vitest';
import { testPool } from './setup.js';
import { claimNextJob } from '../claimer.js';
import { v4 as uuidv4 } from 'uuid';

let queueId: string;

beforeAll(async () => {
    const organizationId = uuidv4();
    const projectId = uuidv4();
    queueId = uuidv4();
    await testPool.query(`INSERT INTO organizations (id, name, slug) VALUES ($1, 'Limit Org', $1)`, [organizationId]);
    await testPool.query(`INSERT INTO projects (id, organization_id, name) VALUES ($1, $2, 'Limit Project')`, [projectId, organizationId]);
    await testPool.query(`INSERT INTO queues (id, project_id, name, concurrency_limit) VALUES ($1, $2, 'Limit Queue', 2)`, [queueId, projectId]);
});

afterEach(async () => {
    await testPool.query('DELETE FROM jobs WHERE queue_id = $1', [queueId]);
});

test('concurrent claims never exceed queue concurrency limit', async () => {
    for (let index = 0; index < 10; index += 1) {
        await testPool.query(`INSERT INTO jobs (queue_id, job_type, payload) VALUES ($1, 'test', '{}')`, [queueId]);
    }

    const results = await Promise.all(
        Array.from({ length: 10 }, () => claimNextJob(testPool, uuidv4()))
    );
    const claimed = results.filter((job) => job !== null);
    const { rows } = await testPool.query(
        `SELECT COUNT(*)::int AS count FROM jobs WHERE queue_id = $1 AND status IN ('claimed', 'running')`,
        [queueId]
    );

    expect(claimed.length).toBe(2);
    expect(rows[0].count).toBeLessThanOrEqual(2);
});