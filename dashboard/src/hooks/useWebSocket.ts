import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/index.js';
import type { WsEvent } from '@job-scheduler/shared';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export function useWebSocket() {
  const queryClient = useQueryClient();
  const setWsConnected = useStore((state) => state.setWsConnected);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000;

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        reconnectDelay = 1000;
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent;

          if (data.event === 'reload') {
            // Event payload was too large, invalidate all queries
            void queryClient.invalidateQueries();
            return;
          }

          // Invalidate specific lists based on event type
          if (data.event.startsWith('job_')) {
            void queryClient.invalidateQueries({ queryKey: ['jobs'] });
            if (data.id) {
              void queryClient.invalidateQueries({ queryKey: ['job', data.id] });
            }
            if (data.event === 'job_dead_letter') {
              void queryClient.invalidateQueries({ queryKey: ['dead-letters'] });
            }
          }

          if (data.event.startsWith('worker_')) {
            void queryClient.invalidateQueries({ queryKey: ['workers'] });
          }

          // Always invalidate metrics when events happen
          void queryClient.invalidateQueries({ queryKey: ['metrics-summary'] });
          void queryClient.invalidateQueries({ queryKey: ['metrics-throughput'] });

        } catch (err) {
          console.error('Failed to parse WS message', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('WebSocket disconnected, reconnecting in', reconnectDelay);
        reconnectTimeout = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [queryClient, setWsConnected]);
}
