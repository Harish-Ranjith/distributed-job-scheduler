import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import type { DeadLetterJob, PaginatedResponse } from '@job-scheduler/shared';

export function DeadLetter() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse<DeadLetterJob>>({
    queryKey: ['dead-letters', page],
    queryFn: () => api.get(`/jobs/dead-letter?page=${page}&limit=20`),
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.post(`/jobs/dead-letter/${id}/retry`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dead-letters'] });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return (
    <div>
      <h1 style={{ marginBottom: '2rem', fontSize: '1.875rem' }}>Dead Letter Queue</h1>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th>Original ID</th>
                <th>Type</th>
                <th>Failed At</th>
                <th>Reason</th>
                <th>Attempts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((job) => (
                <tr key={job.id}>
                  <td style={{ fontFamily: 'monospace' }}>
                    {job.original_job_id ? job.original_job_id.split('-')[0] : 'N/A'}
                  </td>
                  <td>{job.job_type}</td>
                  <td>{new Date(job.failed_at).toLocaleString()}</td>
                  <td style={{ color: 'var(--error)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.failure_reason}
                  </td>
                  <td>{job.attempt_count}</td>
                  <td>
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => retryMutation.mutate(job.id)}
                      disabled={retryMutation.isPending}
                    >
                      Requeue
                    </button>
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    Dead letter queue is empty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {data && data.pagination.total_pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button 
            className="btn btn-outline" 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem' }}>
            Page {page} of {data.pagination.total_pages}
          </span>
          <button 
            className="btn btn-outline"
            disabled={page === data.pagination.total_pages}
            onClick={() => setPage(p => Math.min(data.pagination.total_pages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
