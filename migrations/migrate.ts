/**
 * Migration runner — reads all *.sql files from ./migrations/ in numeric order,
 * wraps each in a transaction, and records applied filenames in _migrations so
 * subsequent runs are idempotent (already-applied files are skipped).
 *
 * Usage:  npx tsx migrations/migrate.ts
 * Requires DATABASE_DIRECT_URL (session-mode connection — pooled won't work here).
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

// Load .env manually (tsx doesn't auto-load it, keep it explicit)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const connectionString = process.env['DATABASE_DIRECT_URL'];
if (!connectionString) {
  console.error('ERROR: DATABASE_DIRECT_URL is not set in your .env file.');
  console.error('Use the direct (non-pooled) Neon connection string for migrations.');
  process.exit(1);
}
const resolvedConnectionString = connectionString as string;

async function run() {
  const client = new Client({
    connectionString: resolvedConnectionString,
    ssl: /localhost|127\.0\.0\.1/.test(resolvedConnectionString) ? false : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Ensure the tracking table exists (bootstrapping the first run)
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Find already-applied migrations
    const { rows: applied } = await client.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map((r) => r.filename));

    // Collect migration files in order
    const migrationsDir = __dirname;
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic = numeric because files are zero-padded (001_, 002_, …)

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  skip  ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓     ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗     ${file} — FAILED`);
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }

    console.log(`\nMigrations complete: ${appliedCount} applied, ${skippedCount} skipped.`);
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
