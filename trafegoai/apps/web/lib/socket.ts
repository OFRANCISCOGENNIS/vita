'use client';

import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

let socket: Socket | null = null;

/** Conexão WebSocket única (singleton) para alertas em tempo real. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

/** Entra na sala da organização para receber os eventos dela. */
export function joinOrg(orgId: string) {
  const s = getSocket();
  const emit = () => s.emit('join-org', orgId);
  if (s.connected) emit();
  s.on('connect', emit);
}

export interface RealtimeNotification {
  type: 'anomaly' | 'rule';
  severity: string;
  title: string;
  message: string;
  at: string;
}
