# API Reference

Base URL: `/api/v1`

Authentication: Standard `Authorization: Bearer <JWT>` header required for all endpoints except `/auth/register` and `/auth/login`.

## Authentication

- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login and receive JWT
- `GET /auth/me` - Get current user profile

## Organizations & Projects

- `POST /organizations` - Create organization
- `GET /organizations` - List user's organizations
- `POST /projects` - Create project in an organization
- `GET /projects?organization_id={id}` - List projects

## Queues

- `POST /queues` - Create a queue (Immediate/Delayed/Cron)
- `GET /queues` - List queues
- `POST /queues/retry-policies` - Create a reusable retry policy
- `POST /queues/:id/pause` - Pause a queue (stops workers from claiming)
- `POST /queues/:id/resume` - Resume a paused queue
- `GET /queues/:id/stats` - Get queue health stats

## Jobs

- `POST /jobs` - Enqueue an immediate job
- `POST /jobs/delayed` - Enqueue a job with a delay
- `POST /jobs/cron` - Schedule a recurring job
- `POST /jobs/batch` - Enqueue multiple jobs in a single transaction
- `GET /jobs` - List jobs (with pagination and filters)
- `GET /jobs/:id` - Get job details, including executions and logs
- `DELETE /jobs/:id` - Cancel a queued/scheduled job
- `POST /jobs/:id/retry` - Manually retry a failed job
- `GET /jobs/dead-letter` - List dead letter queue jobs
- `POST /jobs/dead-letter/:id/retry` - Requeue a DLQ job

## Workers & Metrics

- `GET /workers` - List registered workers and their status
- `GET /metrics/summary` - Get high-level system metrics (cached for 10s)
- `GET /metrics/throughput?window=1h|6h|24h` - Get time-series throughput data

## WebSocket

- `GET /ws?token={jwt}` - Upgrade to WebSocket connection for real-time `job_events` and `worker_events` from Postgres.
