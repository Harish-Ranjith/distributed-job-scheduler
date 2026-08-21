import { test, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';
import { v4 as uuidv4 } from 'uuid';

let userAToken: string;
let userBToken: string;
let organizationId: string;
let jobId: string;

async function registerAndLogin(email: string): Promise<string> {
    await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email, password: 'password123', display_name: email },
    });
    const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'password123' },
    });
    return response.json().token as string;
}

beforeAll(async () => {
    userAToken = await registerAndLogin(`authorization-a-${uuidv4()}@example.com`);
    userBToken = await registerAndLogin(`authorization-b-${uuidv4()}@example.com`);

    const organizationResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/organizations',
        headers: { Authorization: `Bearer ${userAToken}` },
        payload: { name: 'Private Organization', slug: `private-${uuidv4()}` },
    });
    organizationId = organizationResponse.json().id as string;

    const projectResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { Authorization: `Bearer ${userAToken}` },
        payload: { organization_id: organizationId, name: 'Private Project' },
    });
    const projectId = projectResponse.json().id as string;

    const queueResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/queues',
        headers: { Authorization: `Bearer ${userAToken}` },
        payload: { project_id: projectId, name: 'Private Queue' },
    });
    const queueId = queueResponse.json().id as string;

    const jobResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { Authorization: `Bearer ${userAToken}` },
        payload: { queue_id: queueId, job_type: 'send_email', payload: {} },
    });
    jobId = jobResponse.json().id as string;
});

afterAll(async () => {
    await pool.end();
});

test('user cannot access another organization resource by ID', async () => {
    const organizationResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${organizationId}`,
        headers: { Authorization: `Bearer ${userBToken}` },
    });
    const jobResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${jobId}`,
        headers: { Authorization: `Bearer ${userBToken}` },
    });

    expect(organizationResponse.statusCode).toBe(404);
    expect(jobResponse.statusCode).toBe(404);
});

test('job listing never returns another organization jobs', async () => {
    const response = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
        headers: { Authorization: `Bearer ${userBToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(0);
});
