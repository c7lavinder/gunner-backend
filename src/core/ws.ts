/**
 * WebSocket server for real-time audit log streaming.
 * Attaches to the existing HTTP server on /ws/audit.
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AuditEntry } from './audit';

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: HTTPServer): void {
  wss = new WebSocketServer({ server, path: '/ws/audit' });

  wss.on('connection', (ws) => {
    console.log('[ws] client connected');
    ws.on('close', () => console.log('[ws] client disconnected'));
    ws.on('error', (err) => console.error('[ws] error:', err.message));
  });

  console.log('[ws] WebSocket server attached on /ws/audit');
}

export function broadcastAuditEntry(entry: AuditEntry): void {
  if (!wss) return;
  const msg = JSON.stringify(entry);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}
