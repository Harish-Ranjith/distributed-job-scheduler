import { test, expect } from 'vitest';
import { computeRetryDelay } from '../retry.js';

test('fixed retry strategy', () => {
  const delay = computeRetryDelay('fixed', 5000, 30000, false, 1);
  expect(delay).toBe(5000);
});

test('linear retry strategy', () => {
  expect(computeRetryDelay('linear', 5000, 30000, false, 1)).toBe(5000);
  expect(computeRetryDelay('linear', 5000, 30000, false, 2)).toBe(10000);
  expect(computeRetryDelay('linear', 5000, 30000, false, 3)).toBe(15000);
});

test('exponential retry strategy', () => {
  expect(computeRetryDelay('exponential', 5000, 30000, false, 1)).toBe(5000);
  expect(computeRetryDelay('exponential', 5000, 30000, false, 2)).toBe(10000);
  expect(computeRetryDelay('exponential', 5000, 30000, false, 3)).toBe(20000);
  expect(computeRetryDelay('exponential', 5000, 30000, false, 4)).toBe(30000); // capped at 30k
});

test('jitter adds variance', () => {
  const delays = Array.from({ length: 50 }).map(() => computeRetryDelay('fixed', 10000, 30000, true, 1));
  const hasVariance = delays.some(d => d !== 10000);
  expect(hasVariance).toBe(true);
  
  // Should stay within 90-110% of base
  delays.forEach(d => {
    expect(d).toBeGreaterThanOrEqual(9000);
    expect(d).toBeLessThanOrEqual(11000);
  });
});
