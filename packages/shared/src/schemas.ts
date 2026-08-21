import { z } from 'zod';

// ─── Primitives ───────────────────────────────────────────────────────────────
const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime({ offset: true });

// ─── Auth & User ─────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  display_name: z.string().min(1).max(100).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Organization ─────────────────────────────────────────────────────────────
export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial();

export const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']),
});

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type AddMemberInput = z.infer<typeof AddMemberSchema>;

// ─── Project ──────────────────────────────────────────────────────────────────
export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;

// ─── Retry Policy ─────────────────────────────────────────────────────────────
export const RetryPolicySchema = z.object({
  name: z.string().min(1).max(100),
  strategy: z.enum(['fixed', 'linear', 'exponential']),
  base_delay_ms: z.number().int().min(100).max(3_600_000),
  max_delay_ms: z.number().int().min(100).max(86_400_000),
  jitter: z.boolean().default(true),
});

export type RetryPolicyInput = z.infer<typeof RetryPolicySchema>;

// ─── Queue ────────────────────────────────────────────────────────────────────
export const CreateQueueSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(-100).max(100).default(0),
  concurrency_limit: z.number().int().min(1).max(1000).default(10),
  retry_policy_id: uuidSchema.optional().nullable(),
});

export const UpdateQueueSchema = CreateQueueSchema.partial();

export type CreateQueueInput = z.infer<typeof CreateQueueSchema>;
export type UpdateQueueInput = z.infer<typeof UpdateQueueSchema>;

// ─── Job Creation ─────────────────────────────────────────────────────────────
const JobBaseSchema = z.object({
  queue_id: uuidSchema,
  job_type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(-100).max(100).default(0),
  max_attempts: z.number().int().min(1).max(25).default(3),
  idempotency_key: z.string().max(255).optional().nullable(),
});

export const CreateImmediateJobSchema = JobBaseSchema;

export const CreateDelayedJobSchema = JobBaseSchema.extend({
  delay_seconds: z.number().int().min(1).max(604_800), // max 7 days
});

export const CreateScheduledJobSchema = JobBaseSchema.extend({
  run_at: isoDateSchema,
});

export const CreateCronJobSchema = z.object({
  queue_id: uuidSchema,
  name: z.string().min(1).max(100),
  cron_expression: z.string().min(1),
  job_type: z.string().min(1).max(100),
  payload: z.record(z.unknown()).default({}),
  priority: z.number().int().min(-100).max(100).default(0),
  max_attempts: z.number().int().min(1).max(25).default(3),
});

export const CreateBatchJobSchema = z.object({
  jobs: z.array(CreateImmediateJobSchema).min(1).max(500),
});

export type CreateImmediateJobInput = z.infer<typeof CreateImmediateJobSchema>;
export type CreateDelayedJobInput = z.infer<typeof CreateDelayedJobSchema>;
export type CreateScheduledJobInput = z.infer<typeof CreateScheduledJobSchema>;
export type CreateCronJobInput = z.infer<typeof CreateCronJobSchema>;
export type CreateBatchJobInput = z.infer<typeof CreateBatchJobSchema>;

// ─── Job Filters (query params) ───────────────────────────────────────────────
export const JobFiltersSchema = z.object({
  status: z
    .enum(['queued', 'scheduled', 'claimed', 'running', 'completed', 'failed', 'dead_letter'])
    .optional(),
  queue_id: uuidSchema.optional(),
  job_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type JobFilters = z.infer<typeof JobFiltersSchema>;

// ─── Metrics Query ────────────────────────────────────────────────────────────
export const MetricsWindowSchema = z.object({
  window: z.enum(['1h', '6h', '24h']).default('1h'),
});

export type MetricsWindow = z.infer<typeof MetricsWindowSchema>;
