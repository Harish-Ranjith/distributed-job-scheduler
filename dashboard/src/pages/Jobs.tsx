import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';
import type { Job, PaginatedResponse } from '@job-scheduler/shared';

export function Jobs() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  
  const { data, isLoading } = useQuery<PaginatedResponse<Job>>({
    queryKey: ['jobs', page, statusFilter],
    queryFn: () => api.get(`/jobs?page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`),
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem' }}>Jobs</h1>
        <select 
          value={statusFilter} 
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ width: 'auto' }}
        >
          <option value="">All Statuses</option>
          <option value="queued">Queued</option>
          <option value="scheduled">Scheduled</option>
          <option value="claimed">Claimed</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="dead_letter">Dead Letter</option>
        </select>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Run At</th>
                <th>Created</th>
                <th>Attempts</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/jobs/${job.id}`} style={{ fontFamily: 'monospace' }}>
                      {job.id.split('-')[0]}...
                    </Link>
                  </td>
                  <td>{job.job_type}</td>
                  <td><StatusBadge status={job.status} pulse={job.status === 'running'} /></td>
                  <td>{job.priority}</td>
                  <td>{new Date(job.run_at).toLocaleString()}</td>
                  <td>{new Date(job.created_at).toLocaleString()}</td>
                  <td>{job.attempt_count} / {job.max_attempts}</td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No jobs found
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
