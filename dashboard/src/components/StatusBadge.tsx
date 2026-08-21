import React from 'react';
import type { JobStatus, WorkerStatus, ExecutionStatus } from '@job-scheduler/shared';

const STATUS_COLORS: Record<string, { color: string, bg: string }> = {
  // Jobs
  queued: { color: 'var(--text-main)', bg: 'var(--panel-border)' },
  scheduled: { color: 'var(--info)', bg: 'var(--info-bg)' },
  claimed: { color: 'var(--warning)', bg: 'var(--warning-bg)' },
  running: { color: 'var(--primary)', bg: 'rgba(99, 102, 241, 0.2)' },
  completed: { color: 'var(--success)', bg: 'var(--success-bg)' },
  failed: { color: 'var(--error)', bg: 'var(--error-bg)' },
  dead_letter: { color: 'var(--error)', bg: 'var(--error-bg)' },
  // Workers
  active: { color: 'var(--success)', bg: 'var(--success-bg)' },
  draining: { color: 'var(--warning)', bg: 'var(--warning-bg)' },
  offline: { color: 'var(--neutral)', bg: 'var(--neutral-bg)' },
};

export function StatusBadge({ status, pulse = false }: { status: JobStatus | WorkerStatus | ExecutionStatus | string, pulse?: boolean }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['queued'];
  
  return (
    <span 
      className={`badge ${pulse ? 'pulse' : ''}`}
      style={{ color: colors.color, backgroundColor: colors.bg }}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
