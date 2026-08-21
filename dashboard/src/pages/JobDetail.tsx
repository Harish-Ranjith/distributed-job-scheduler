import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import type { JobWithDetails, JobLog } from '@job-scheduler/shared';

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useQuery<JobWithDetails>({
    queryKey: ['job', id],
    queryFn: () => api.get(`/jobs/${id}`),
  });

  const retryMutation = useMutation({
    mutationFn: () => api.post(`/jobs/${id}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['job', id] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (!job) return <div>Job not found.</div>;

  const canRetry = job.status === 'failed' || job.status === 'dead_letter';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            Job <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', color: 'var(--text-muted)' }}>{job.id}</span>
          </h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <StatusBadge status={job.status} pulse={job.status === 'running'} />
            <span style={{ color: 'var(--text-muted)' }}>Type: {job.job_type}</span>
          </div>
        </div>
        {canRetry && (
          <button 
            className="btn btn-primary" 
            onClick={() => retryMutation.mutate()}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? 'Retrying...' : 'Retry Job'}
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div><span style={{ color: 'var(--text-muted)', width: 120, display: 'inline-block' }}>Priority</span> {job.priority}</div>
            <div><span style={{ color: 'var(--text-muted)', width: 120, display: 'inline-block' }}>Attempts</span> {job.attempt_count} / {job.max_attempts}</div>
            <div><span style={{ color: 'var(--text-muted)', width: 120, display: 'inline-block' }}>Created</span> {new Date(job.created_at).toLocaleString()}</div>
            <div><span style={{ color: 'var(--text-muted)', width: 120, display: 'inline-block' }}>Run At</span> {new Date(job.run_at).toLocaleString()}</div>
          </div>
        </div>
        
        <div className="glass-panel" style={{ overflow: 'auto' }}>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>Payload</h3>
          <pre style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0, fontFamily: 'monospace' }}>
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </div>
      </div>

      <div className="glass-panel" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Executions</h3>
        {job.executions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No executions yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Worker</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {job.executions.map((exec) => (
                <tr key={exec.id}>
                  <td>#{exec.attempt_number}</td>
                  <td><StatusBadge status={exec.status} /></td>
                  <td>{new Date(exec.started_at).toLocaleString()}</td>
                  <td>{exec.duration_ms ? `${exec.duration_ms}ms` : '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{exec.worker_id ? exec.worker_id.split('-')[0] : '-'}</td>
                  <td style={{ color: 'var(--error)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exec.error_message || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass-panel">
        <h3 style={{ marginBottom: '1rem' }}>Logs</h3>
        {job.logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No logs available.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>
            {job.logs.map((log: JobLog) => (
              <div key={log.id} style={{ display: 'flex', gap: '1rem' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: 180 }}>{new Date(log.logged_at).toISOString().replace('T', ' ')}</span>
                <span style={{ 
                  minWidth: 50, 
                  color: log.level === 'error' ? 'var(--error)' : log.level === 'warn' ? 'var(--warning)' : log.level === 'debug' ? 'var(--text-muted)' : 'var(--info)'
                }}>
                  {log.level.toUpperCase()}
                </span>
                <span>{log.message}</span>
                {log.metadata && <span style={{ color: 'var(--text-muted)' }}>{JSON.stringify(log.metadata)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
