import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import type { MetricsSummary } from '@job-scheduler/shared';

export function Dashboard() {
  const { data, isLoading } = useQuery<MetricsSummary>({
    queryKey: ['metrics-summary'],
    queryFn: () => api.get('/metrics/summary'),
  });

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>Failed to load metrics.</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem' }}>Overview</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Active Workers</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.active_workers}</div>
        </div>
        <div className="glass-panel">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Jobs per Minute</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.jobs_per_minute}</div>
        </div>
        <div className="glass-panel">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Success Rate</div>
          <div style={{ fontSize: '2rem', fontWeight: 600, color: data.success_rate > 0.95 ? 'var(--success)' : 'var(--warning)' }}>
            {(data.success_rate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="glass-panel">
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Avg Execution Time</div>
          <div style={{ fontSize: '2rem', fontWeight: 600 }}>{data.avg_execution_ms}ms</div>
        </div>
      </div>

      <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Queue Health</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {Object.entries(data.queue_depths).map(([queueId, stats]) => (
          <div key={queueId} className="glass-panel">
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', fontWeight: 500 }}>Queue: {queueId.split('-')[0]}...</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Queued</span>
              <span style={{ fontWeight: 600 }}>{stats.queued || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Running</span>
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{stats.running || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Failed</span>
              <span style={{ fontWeight: 600, color: stats.failed > 0 ? 'var(--error)' : 'inherit' }}>{stats.failed || 0}</span>
            </div>
          </div>
        ))}
        {Object.keys(data.queue_depths).length === 0 && (
          <div style={{ color: 'var(--text-muted)' }}>No active queues found.</div>
        )}
      </div>
    </div>
  );
}
