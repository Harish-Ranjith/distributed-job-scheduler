import type { RetryStrategy } from '@job-scheduler/shared';

export function computeRetryDelay(
  strategy: RetryStrategy,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean,
  attemptCount: number // this is the number of failed attempts so far (e.g. 1 means it just failed the 1st attempt)
): number {
  let delay = 0;

  switch (strategy) {
    case 'fixed':
      delay = baseDelayMs;
      break;
    case 'linear':
      delay = baseDelayMs * attemptCount;
      break;
    case 'exponential':
      // 2^(attemptCount - 1)
      delay = baseDelayMs * Math.pow(2, attemptCount - 1);
      break;
  }

  // Cap at maxDelay
  if (delay > maxDelayMs) {
    delay = maxDelayMs;
  }

  if (jitter) {
    // Add ±10% jitter
    const jitterFactor = 0.9 + Math.random() * 0.2;
    delay = Math.round(delay * jitterFactor);
  }

  return delay;
}
