import type { Job } from '@job-scheduler/shared';

const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function handleExampleJob(job: Job, log: (msg: string, meta?: any) => void): Promise<void> {
  const { to, subject, throwError } = job.payload as any;

  log('Parsing payload', { to, subject });
  await wait(50);

  if (throwError) {
    log('Simulating a failure as requested by payload');
    throw new Error('Simulated failure');
  }

  log('Sending email...');
  await wait(150);

  log('Email sent successfully');
}
