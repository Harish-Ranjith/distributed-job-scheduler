import type { Job } from '@job-scheduler/shared';
import { handleExampleJob } from './example.js';

export type JobHandler = (job: Job, log: (msg: string, meta?: any) => void) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  'send_email': handleExampleJob,
};

export function getHandler(jobType: string): JobHandler | undefined {
  return handlers[jobType];
}
