import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import type { Worker } from '@job-scheduler/shared';

interface WorkerWithStats extends Worker {
  latest_heartbeat: string | null;
  seconds_since_heartbeat: number | null;
  active_jobs: number;
}

export function Workers() {
  const { data, isLoading } = useQuery<{ data: WorkerWithStats[] }>({
    queryKey: ['workers'],
    queryFn: () => api.get('/workers'),
  });

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem' }}>Workers</h1>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th>ID</th>
                <th>Hostname</th>
                <th>Status</th>
                <th>Load (Active / Max)</th>
                <th>Last Heartbeat</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((worker) => {
                const isStale = worker.seconds_since_heartbeat !== null && worker.seconds_since_heartbeat > 30;
                const heartbeatColor = isStale 
                  ? 'var(--error)' 
                  : (worker.seconds_since_heartbeat !== null && worker.seconds_since_heartbeat > 15 ? 'var(--warning)' : 'var(--success)');

                return (
                  <tr key={worker.id}>
                    <td style={{ fontFamily: 'monospace' }}>{worker.id.split('-')[0]}...</td>
                    <td>{worker.hostname} (PID: {worker.pid})</td>
                    <td><StatusBadge status={worker.status} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{worker.active_jobs} / {worker.concurrency}</span>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.1)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ 
                            background: 'var(--primary)', 
                            height: '100%', 
                            width: `${Math.min(100, (worker.active_jobs / worker.concurrency) * 100)}%` 
                          }} />
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: heartbeatColor }} />
                        {worker.seconds_since_heartbeat !== null ? `${worker.seconds_since_heartbeat}s ago` : 'Never'}
                      </div>
                    </td>
                    <td>{new Date(worker.registered_at).toLocaleString()}</td>
                  </tr>
                );
              })}
              {(!data?.data || data.data.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No workers registered
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
