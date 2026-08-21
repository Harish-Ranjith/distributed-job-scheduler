# Design Decisions & Trade-offs

## 1. Postgres as the Message Broker

**Decision**: Use PostgreSQL (`SELECT FOR UPDATE SKIP LOCKED`) instead of Redis, RabbitMQ, or Kafka.
**Why**:

- **Operational Simplicity**: A single infrastructure dependency. No need to manage Redis persistence, memory limits, or Kafka partitions.
- **Transactional Guarantees**: We can enqueue a job in the same transaction as our business logic (Outbox pattern built-in).
- **Relational Integrity**: Foreign keys between jobs, executions, and logs guarantee data consistency.
  **Trade-offs**: Lower absolute throughput compared to Redis/Kafka. Postgres might handle thousands of jobs/sec, while Kafka handles millions. For a vast majority of applications, this is more than sufficient.

## 2. Append-Only Heartbeats

**Decision**: The `worker_heartbeats` table is append-only, and we use a separate reaper to monitor `MAX(received_at)`.
**Why**: PostgreSQL's MVCC creates bloat if you constantly `UPDATE` a single row every 10 seconds per worker. Inserting is much cheaper and provides an audit log of worker uptime.
**Trade-offs**: Table size grows over time; requires a cron job to partition or drop old heartbeat records in production.

## 3. CTEs for Atomic Claims

**Decision**: The job claiming query wraps the `SELECT FOR UPDATE SKIP LOCKED` inside a Common Table Expression (CTE) which is then immediately used in an `UPDATE` statement.
**Why**: Eliminates a network round-trip between finding the job and claiming it. Prevents the edge case where a job is found, but before the `UPDATE` is sent, another transaction modifies it.

## 4. LISTEN/NOTIFY for Real-Time Updates

**Decision**: Dashboard updates are powered by PostgreSQL `LISTEN/NOTIFY` mapped to WebSockets, instead of polling or Socket.io.
**Why**:

- Truly event-driven at the DB layer. Any direct DB mutation (e.g. from psql CLI) instantly reflects on the dashboard.
- Avoids the N+1 polling problem on the API layer.
  **Trade-offs**: Payload limit of 8000 bytes per `pg_notify`. If a payload exceeds this, we send a fallback `reload` event instructing clients to refetch data.

## 5. Monorepo (npm workspaces)

**Decision**: Split into `@job-scheduler/api`, `@job-scheduler/worker`, and `@job-scheduler/dashboard` with a shared types package.
**Why**:

- Enforces boundaries (workers don't accidentally import Fastify routes).
- Allows independent scaling and deployment of workers vs API.
- Shares Zod schemas for end-to-end type safety between DB -> API -> Dashboard.

## 6. Security Model and Trade-offs

API access is tenant-scoped through organization membership. Resource ownership resolves through organization -> project -> queue -> job, and privileged membership changes require an admin or owner role. Requests for resources outside the caller's organizations return `404` to avoid organization-ID enumeration. Authentication endpoints use an in-memory Fastify rate limit of 10 requests per minute per client.

WebSocket connections resolve the user's organization memberships at connection time. PostgreSQL job and worker notifications include the owning organization ID set, and the API only broadcasts an event to clients whose membership set contains one of those IDs. Membership changes require reconnecting the socket to refresh the cached membership set; only the data-free `reload` fallback is global.

The scheduler is safe under multiple API instances because each due schedule row remains locked through insertion of the concrete job and advancement of `next_run_at`. Authorization adds database membership checks to resource requests; a larger deployment could cache non-privileged membership lookups, but privileged writes should continue to revalidate against PostgreSQL.

## 7. At-Least-Once Execution and Fenced Leases

Job submission idempotency and execution idempotency are separate guarantees. The partial unique idempotency-key index prevents duplicate logical submissions, but it cannot make an external side effect exactly once. Handlers must tolerate retries and use downstream idempotency keys where applicable.

Claims receive a unique `lease_token` and `lease_expires_at`. Heartbeats renew active leases, the reaper recovers only expired leases, and completion/retry/DLQ updates require the current worker and lease token. A worker that finishes after its job has been reclaimed is fenced and cannot overwrite the newer execution. The resulting guarantee is at-least-once execution with durable, fenced ownership, not exactly-once external side effects.
