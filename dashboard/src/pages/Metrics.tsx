import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api/client.js';

export function Metrics() {
  const [window, setWindow] = useState<'1h' | '6h' | '24h'>('1h');

  const { data, isLoading } = useQuery<{ data: any[] }>({
    queryKey: ['metrics-throughput', window],
    queryFn: () => api.get(`/metrics/throughput?window=${window}`),
  });

  const formatXAxis = (tickItem: string) => {
    const d = new Date(tickItem);
    if (window === '24h') return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:00`;
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem' }}>Metrics & Throughput</h1>
        <select 
          value={window} 
          onChange={(e) => setWindow(e.target.value as any)}
          style={{ width: 'auto' }}
        >
          <option value="1h">Last 1 Hour (5m bins)</option>
          <option value="6h">Last 6 Hours (30m bins)</option>
          <option value="24h">Last 24 Hours (2h bins)</option>
        </select>
      </div>

      <div className="glass-panel" style={{ height: 500, padding: '2rem 2rem 2rem 0' }}>
        <h3 style={{ marginLeft: '2rem', marginBottom: '1.5rem', fontWeight: 500 }}>Throughput (Jobs completed/failed)</h3>
        {isLoading ? (
          <div style={{ marginLeft: '2rem' }}>Loading chart data...</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.data || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={formatXAxis} 
                stroke="var(--text-muted)" 
                fontSize={12}
                minTickGap={30}
              />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-color)', borderColor: 'var(--panel-border)', borderRadius: 8 }}
                labelFormatter={(l) => new Date(l).toLocaleString()}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="total" 
                name="Total Processed"
                stroke="var(--text-muted)" 
                strokeWidth={2} 
                dot={false} 
              />
              <Line 
                type="monotone" 
                dataKey="completed" 
                name="Completed"
                stroke="var(--success)" 
                strokeWidth={2} 
                dot={false} 
              />
              <Line 
                type="monotone" 
                dataKey="failed" 
                name="Failed"
                stroke="var(--error)" 
                strokeWidth={2} 
                dot={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
