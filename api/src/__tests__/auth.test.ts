import { test, expect } from 'vitest';
import { app } from '../app.js';
import { pool } from '../db/pool.js';

test('auth flow - register, login, me', async () => {
  const email = `test-${Date.now()}@example.com`;
  
  // 1. Register
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: 'password123', name: 'Test User' },
  });
  
  expect(regRes.statusCode).toBe(201);
  const regBody = regRes.json();
  expect(regBody.user.email).toBe(email);
  expect(regBody.token).toBeDefined();

  // 2. Login
  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: 'password123' },
  });
  
  expect(loginRes.statusCode).toBe(200);
  const token = loginRes.json().token;

  // 3. Me
  const meRes = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { Authorization: `Bearer ${token}` }
  });
  
  expect(meRes.statusCode).toBe(200);
  expect(meRes.json().email).toBe(email);
  
  // Cleanup
  await pool.query('DELETE FROM users WHERE id = $1', [meRes.json().id]);
});
