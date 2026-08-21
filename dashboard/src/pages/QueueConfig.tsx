import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface QueueView {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'paused';
  priority: number;
  concurrency_limit: number;
  active?: number;
  retry_strategy?: string | null;
}

export function QueueConfig() {
  const queryClient = useQueryClient();
  const [editingQueue, setEditingQueue] = useState<QueueView | null>(null);
  const { data, isLoading } = useQuery<{ data: QueueView[] }>({
    queryKey: ['queues'],
    queryFn: () => api.get('/queues'),
  });

  const pauseMutation = useMutation({
    mutationFn: ({ id, pause }: { id: string, pause: boolean }) => 
      api.post(`/queues/${id}/${pause ? 'pause' : 'resume'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queues'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (queue: QueueView) => api.put(`/queues/${queue.id}`, {
      name: queue.name,
      description: queue.description || undefined,
      priority: queue.priority,
      concurrency_limit: queue.concurrency_limit,
    }),
    onSuccess: () => {
      setEditingQueue(null);
      void queryClient.invalidateQueries({ queryKey: ['queues'] });
    },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem' }}>Queue Configuration</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {data?.data.map((queue) => (
          <div key={queue.id} className="glass-panel" style={{ display: 'flex', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.25rem' }}>{queue.name}</h3>
                <StatusBadge status={queue.status} />
              </div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>{queue.description || 'No description'}</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                <div><span style={{ color: 'var(--text-muted)', display: 'block' }}>Priority</span> {queue.priority}</div>
                <div><span style={{ color: 'var(--text-muted)', display: 'block' }}>Concurrency Limit</span> {queue.concurrency_limit}</div>
                <div><span style={{ color: 'var(--text-muted)', display: 'block' }}>Slots In Use</span> {queue.active ?? 0} / {queue.concurrency_limit}</div>
                <div><span style={{ color: 'var(--text-muted)', display: 'block' }}>Retry Policy</span> {queue.retry_strategy || 'None'}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
              {queue.status === 'active' ? (
                <button 
                  className="btn btn-outline" 
                  style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}
                  onClick={() => pauseMutation.mutate({ id: queue.id, pause: true })}
                >
                  Pause Queue
                </button>
              ) : (
                <button 
                  className="btn btn-primary"
                  onClick={() => pauseMutation.mutate({ id: queue.id, pause: false })}
                >
                  Resume Queue
                </button>
              )}
              <button className="btn btn-outline" onClick={() => setEditingQueue({ ...queue })}>Edit Config</button>
            </div>
          </div>
        ))}
        
        {(!data?.data || data.data.length === 0) && (
          <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            No queues found. (You need to create a project and queue via API first).
          </div>
        )}
      </div>

      {editingQueue && (
        <div className="glass-panel" style={{ marginTop: '1.5rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Edit {editingQueue.name}</h2>
          <div style={{ display: 'grid', gap: '0.75rem', maxWidth: 420 }}>
            <label>Name<input value={editingQueue.name} onChange={(event) => setEditingQueue({ ...editingQueue, name: event.target.value })} /></label>
            <label>Description<input value={editingQueue.description ?? ''} onChange={(event) => setEditingQueue({ ...editingQueue, description: event.target.value })} /></label>
            <label>Priority<input type="number" value={editingQueue.priority} onChange={(event) => setEditingQueue({ ...editingQueue, priority: Number(event.target.value) })} /></label>
            <label>Concurrency limit<input type="number" min={1} value={editingQueue.concurrency_limit} onChange={(event) => setEditingQueue({ ...editingQueue, concurrency_limit: Number(event.target.value) })} /></label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate(editingQueue)}>Save</button>
              <button className="btn btn-outline" onClick={() => setEditingQueue(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
