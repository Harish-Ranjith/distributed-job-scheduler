import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { addClient, removeClient } from '../plugins/websocket.js';
import type { SocketStream } from '@fastify/websocket';
import { pool } from '../db/pool.js';

const wsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // GET /ws — WebSocket upgrade
  // JWT token passed as ?token= query parameter (can't set Authorization header on WS upgrade)
  fastify.get(
    '/',
    { websocket: true },
    async (connection: SocketStream, request) => {
      const socket = connection.socket;
      // Verify JWT from query param
      const token = (request.query as Record<string, string>)['token'];
      if (!token) {
        socket.close(1008, 'Missing authentication token');
        return;
      }

      try {
        const payload = fastify.jwt.verify<{ sub: string }>(token);
        const { rows: memberships } = await pool.query<{ organization_id: string }>(
          'SELECT organization_id FROM memberships WHERE user_id = $1',
          [payload.sub]
        );
        addClient(socket, memberships.map((membership) => membership.organization_id));
      } catch {
        socket.close(1008, 'Invalid authentication token');
        return;
      }

      fastify.log.info({ clientCount: 1 }, 'WebSocket client connected');

      // Send immediate connection acknowledgment
      socket.send(JSON.stringify({ event: 'connected', timestamp: new Date().toISOString() }));

      socket.on('close', () => {
        removeClient(socket);
        fastify.log.info('WebSocket client disconnected');
      });

      socket.on('error', (err) => {
        fastify.log.error({ err }, 'WebSocket client error');
        removeClient(socket);
      });

      // Heartbeat ping/pong to detect stale connections
      socket.on('message', (data) => {
        const msg = data.toString();
        if (msg === 'ping') {
          socket.send('pong');
        }
      });
    }
  );
};

export default wsRoutes;
