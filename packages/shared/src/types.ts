// ─── Job Status Enum ─────────────────────────────────────────────────────────
export type JobStatus =
  | 'queued'
  | 'scheduled'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'dead_letter';

export const JOB_STATUSES: JobStatus[] = [
  'queued',
  'scheduled',
  'claimed',
  'running',
  'completed',
  'failed',
  'dead_letter',
];

// ─── Retry Strategy ───────────────────────────────────────────────────────────
export type RetryStrategy = 'fixed' | 'linear' | 'exponential';

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  base_delay_ms: number;
  max_delay_ms: number;
  jitter: boolean;
  created_at: Date;
}

// ─── User & Auth ─────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
}

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  org_id: string | null;
  role: MembershipRole | null;
  iat?: number;
  exp?: number;
}

// ─── Organization & Membership ────────────────────────────────────────────────
export type MembershipRole = 'owner' | 'admin' | 'member';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: MembershipRole;
  created_at: Date;
}

// ─── Project ──────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Queue ────────────────────────────────────────────────────────────────────
export type QueueStatus = 'active' | 'paused';

export interface Queue {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: QueueStatus;
  priority: number;
  concurrency_limit: number;
  retry_policy_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface QueueStats {
  queue_id: string;
  queued: number;
  scheduled: number;
  claimed: number;
  running: number;
  completed: number;
  failed: number;
  dead_letter: number;
  total: number;
}

// ─── Job ──────────────────────────────────────────────────────────────────────
export interface Job {
  id: string;
  queue_id: string;
  status: JobStatus;
  job_type: string;
  payload: Record<string, unknown>;
  priority: number;
  run_at: Date;
  max_attempts: number;
  attempt_count: number;
  idempotency_key: string | null;
  cron_expression: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobWithDetails extends Job {
  executions: JobExecution[];
  logs: JobLog[];
  queue?: Queue;
}

// ─── Job Execution ────────────────────────────────────────────────────────────
export type ExecutionStatus = 'running' | 'completed' | 'failed';

export interface JobExecution {
  id: string;
  job_id: string;
  worker_id: string | null;
  attempt_number: number;
  status: ExecutionStatus;
  started_at: Date;
  finished_at: Date | null;
  error_message: string | null;
  duration_ms: number | null;
}

// ─── Job Log ─────────────────────────────────────────────────────────────────
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface JobLog {
  id: string;
  job_id: string;
  execution_id: string | null;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  logged_at: Date;
}

// ─── Worker ───────────────────────────────────────────────────────────────────
export type WorkerStatus = 'active' | 'draining' | 'offline';

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  concurrency: number;
  registered_at: Date;
  last_seen: Date;
}

export interface WorkerHeartbeat {
  id: string;
  worker_id: string;
  received_at: Date;
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────
export interface DeadLetterJob {
  id: string;
  original_job_id: string | null;
  queue_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  failure_reason: string;
  attempt_count: number;
  max_attempts: number;
  failed_at: Date;
  created_at: Date;
}

// ─── Scheduled Job ────────────────────────────────────────────────────────────
export interface ScheduledJob {
  id: string;
  queue_id: string;
  name: string;
  cron_expression: string;
  job_template: {
    job_type: string;
    payload: Record<string, unknown>;
    priority?: number;
    max_attempts?: number;
  };
  is_active: boolean;
  next_run_at: Date | null;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
export interface MetricsSummary {
  jobs_per_minute: number;
  success_rate: number;
  avg_execution_ms: number;
  queue_depths: Record<string, QueueStats>;
  active_workers: number;
  total_jobs_today: number;
}

export interface ThroughputDataPoint {
  timestamp: string;
  total: number;
  completed: number;
  failed: number;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────
export type WsEventType =
  | 'job_created'
  | 'job_updated'
  | 'job_completed'
  | 'job_failed'
  | 'job_dead_letter'
  | 'worker_registered'
  | 'worker_heartbeat'
  | 'worker_offline'
  | 'queue_updated'
  | 'reload';

export interface WsEvent {
  event: WsEventType;
  id: string;
  status?: JobStatus | WorkerStatus;
  queue_id?: string;
  timestamp: string;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}
