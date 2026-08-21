# Architecture Overview

## Components

1. **PostgreSQL (The Brain & Backbone)**
   - Acts as the single source of truth for all state.
   - Handles concurrency locking natively using `SELECT FOR UPDATE SKIP LOCKED`.
   - Propagates real-time events via `LISTEN/NOTIFY` (using trigger functions on `jobs` and `worker_heartbeats` tables).

2. **API Service (Fastify + Zod)**
   - Exposes REST endpoints for CRUD operations on queues, jobs, and workers.
   - Manages WebSocket connections for real-time dashboard updates by mapping PostgreSQL `pg_notify` payloads to connected clients.
   - Runs two critical background loops:
     - **Cron Scheduler (`services/scheduler.ts`)**: Ticks every 30s. Atomically spawns jobs from `scheduled_jobs` whose `next_run_at` has elapsed.
     - **Stale Job Reaper (`services/reaper.ts`)**: Ticks every 60s. Detects workers that missed heartbeats, marks them offline, and atomically requeues their claimed/running jobs.

3. **Worker Service (Node.js)**
   - Pulls jobs concurrently from the database using `SKIP LOCKED`.
   - Maintains an append-only heartbeat table (`worker_heartbeats`) to prove liveness.
   - Executes jobs through a registered handler map.
   - Computes backoff delays for failed jobs and updates status to `queued` for retry or `dead_letter` for terminal failure.
   - Emits structured logs into the `job_logs` table during execution.

4. **Dashboard (React + Vite + Zustand)**
   - Provides a glassmorphic, real-time UI.
   - Polls aggregated metrics every 10s.
   - Invalidates local React Query caches instantly upon receiving WebSocket events from the API.

## Data Flow: Job Lifecycle

1. **Creation**: Client POSTs a job to `/api/v1/jobs`. Saved with status `queued` (or `scheduled` if `run_at` is future).
2. **Claiming**: Worker's poll loop runs a CTE query selecting the highest priority, earliest `run_at` job using `SKIP LOCKED`, immediately updating its status to `claimed` and binding its `worker_id`.
3. **Execution**: Worker inserts a row into `job_executions` and updates job to `running`.
4. **Completion/Failure**:
   - On success: execution updated to `completed`, job updated to `completed`.
   - On failure: error logged, job updated back to `queued` with incremented attempt count and delayed `run_at` (based on retry policy). If max attempts reached, moved to `dead_letter_jobs`.

## Data Flow: Real-Time Updates

1. A job changes status (e.g. `running` -> `completed`).
2. PostgreSQL trigger fires `pg_notify('job_events', payload)`.
3. API service's `LISTEN` connection receives the payload.
4. API service broadcasts the payload to all authenticated WebSocket clients.
5. Dashboard receives WebSocket message, invalidates TanStack Query cache for `['jobs']`, and immediately re-fetches the latest state, ensuring the UI reflects the DB perfectly.
