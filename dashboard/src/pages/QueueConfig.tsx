import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function QueueConfig() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{ data: any[] }>({
    queryKey: ['queues'],
    queryFn: () => api.get('/queues'),
  });

  const pauseMutation = useMutation({
    mutationFn: ({ id, pause }: { id: string, pause: boolean }) => 
      api.post(`/queues/${id}/${pause ? 'pause' : 'resume'}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queues'] }),
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
              {/* In a real app, clicking edit would open a modal with a form to PUT /api/v1/queues/:id */}
              <button className="btn btn-outline">Edit Config</button>
            </div>
          </div>
        ))}
        
        {(!data?.data || data.data.length === 0) && (
          <div className="glass-panel" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
            No queues found. (You need to create a project and queue via API first).
          </div>
        )}
      </div>
    </div>
  );
}
