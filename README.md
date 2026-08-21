# Distributed Job Scheduler

A production-inspired, reliable async job execution platform built purely on PostgreSQL, Node.js, and TypeScript. No Redis, no Kafka, no Kubernetes required.

## Features

- **Reliable Queuing**: Uses PostgreSQL `SELECT FOR UPDATE SKIP LOCKED` for atomic, high-concurrency job claiming without blocking.
- **Advanced Scheduling**: Supports Immediate, Delayed, Scheduled (fixed date), Cron, and Batch jobs.
- **Robust Retries**: Built-in fixed, linear, and exponential backoff strategies with optional jitter.
- **Dead Letter Handling**: Terminal jobs are moved to a DLQ for manual inspection and requeuing.
- **Live Dashboard**: A stunning, glassmorphic React dashboard driven by PostgreSQL `LISTEN/NOTIFY` -> WebSockets for instant UI updates.
- **Worker Liveness**: Heartbeat tracking and an automatic Stale Job Reaper to recover jobs from crashed workers.
- **End-to-End Type Safety**: Shared Zod schemas power API validation, database types, and frontend React Query clients.

## Tech Stack

- **Monorepo**: npm workspaces
- **Database**: PostgreSQL (Neon, `pg`, raw SQL queries)
- **API Service**: Fastify, Zod, JWT
- **Worker Service**: Node.js, `croner`
- **Dashboard**: React 19, Vite, TanStack Query, Zustand, Recharts, standard CSS
- **Testing**: Vitest

## Getting Started

1. Set up a PostgreSQL database (e.g., Neon).
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `DATABASE_DIRECT_URL`.
3. Run migrations:
   ```bash
   npm run migrate
   ```
4. Start the cluster (API, Dashboard, Worker) in three terminals:
   ```bash
   npm run dev:api
   npm run dev:worker
   npm run dev:dashboard
   ```

For validation, run `npm run build` and `npm run typecheck`. The API and worker integration tests require a PostgreSQL database with the migrations applied and connection settings compatible with the target server.

The repeatable verification command is `npm run verify`, which runs typecheck, tests, and the production build. CI provisions PostgreSQL, applies migrations, and runs the same checks.

Worker reliability settings include `WORKER_LEASE_DURATION_SECONDS`, `WORKER_HEARTBEAT_INTERVAL_MS`, `WORKER_JOB_TIMEOUT_MS`, and `WORKER_SHUTDOWN_TIMEOUT_MS`; see `.env.example` for defaults.

## Documentation

- [Architecture & Data Flow](./docs/architecture.md)
- [Database Schema (ER Diagram)](./docs/er-diagram.md)
- [Design Decisions & Trade-offs](./docs/design-decisions.md)
- [API Reference](./docs/api.md)
