import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { createDirectClient } from '../db/pool.js';
import type WebSocket from 'ws';
import type { Client } from 'pg';

// ─── WebSocket broadcast registry ─────────────────────────────────────────────
const connectedClients = new Map<WebSocket, Set<string>>();

export function addClient(ws: WebSocket, organizationIds: string[]): void {
  connectedClients.set(ws, new Set(organizationIds));
}

export function removeClient(ws: WebSocket): void {
  connectedClients.delete(ws);
}

export function broadcastToClients(payload: string): void {
  let organizationIds: string[] = [];
  try {
    const event = JSON.parse(payload) as { organization_id?: string; organization_ids?: string[] };
    organizationIds = event.organization_ids ?? (event.organization_id ? [event.organization_id] : []);
  } catch {
    return;
  }

  for (const [client, clientOrganizations] of connectedClients) {
    const isGlobalReload = payload.includes('"event":"reload"');
    if ((isGlobalReload || organizationIds.some((id) => clientOrganizations.has(id))) && client.readyState === 1) {
      client.send(payload);
    }
  }
}

// ─── LISTEN/NOTIFY relay ──────────────────────────────────────────────────────
let listenerClient: Client | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectDelay = 1_000;
const MAX_RECONNECT_DELAY = 30_000;

async function connectListener(log: ReturnType<typeof import('fastify')['default']>['log']): Promise<void> {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  try {
    const client = createDirectClient();
    await client.connect();
    await client.query('LISTEN job_events');

    client.on('notification', (msg) => {
      if (msg.payload) {
        broadcastToClients(msg.payload);
      }
    });

    client.on('error', (err) => {
      log.error({ err }, 'LISTEN client error — will reconnect');
      void scheduleReconnect(log);
    });

    client.on('end', () => {
      log.warn('LISTEN client connection ended — will reconnect');
      void scheduleReconnect(log);
    });

    listenerClient = client;
    reconnectDelay = 1_000; // reset backoff on successful connect
    log.info('✓ PostgreSQL LISTEN/NOTIFY relay connected (job_events channel)');
  } catch (err) {
    log.error({ err }, 'Failed to connect LISTEN client — will retry');
    void scheduleReconnect(log);
  }
}

function scheduleReconnect(log: ReturnType<typeof import('fastify')['default']>['log']): void {
  listenerClient = null;
  reconnectTimeout = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    void connectListener(log);
  }, reconnectDelay);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────
const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await connectListener(fastify.log);

  fastify.addHook('onClose', async () => {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (listenerClient) {
      await listenerClient.end().catch(() => null);
    }
  });
};

export default fp(websocketPlugin, { name: 'websocket-relay' });
