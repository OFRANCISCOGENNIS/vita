'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { getSocket, joinOrg, RealtimeNotification } from '@/lib/socket';
import { relativeTime } from '@/lib/format';

interface Item {
  id: string;
  type: 'anomaly' | 'rule';
  severity: string;
  title: string;
  message: string;
  at: string;
}

/**
 * Sino de notificações com contagem de não-lidas. Recebe eventos em tempo real
 * via WebSocket (canal 'notification') e mantém um histórico via /notifications.
 * Mostra um toast quando chega um alerta novo.
 */
export function NotificationBell() {
  const org = useAuthStore((s) => s.org);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<RealtimeNotification | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.get<{ items: Item[]; unread: number }>('/notifications', true)
      .then((d) => { setItems(d.items); setUnread(d.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000); // fallback de polling
    return () => clearInterval(t);
  }, [load]);

  // Tempo real
  useEffect(() => {
    if (!org?.id) return;
    joinOrg(org.id);
    const socket = getSocket();
    const onNotif = (n: RealtimeNotification) => {
      setToast(n);
      setUnread((u) => u + 1);
      setItems((prev) => [{ id: `rt-${Date.now()}`, ...n }, ...prev].slice(0, 30));
      setTimeout(() => setToast((cur) => (cur === n ? null : cur)), 6000);
    };
    socket.on('notification', onNotif);
    return () => { socket.off('notification', onNotif); };
  }, [org?.id]);

  // Fecha ao clicar fora
  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markAllRead() {
    await api.post('/notifications/read-all');
    setUnread(0);
  }

  const dot = (sev: string) => (sev === 'CRITICAL' ? 'bg-red-500' : sev === 'WARNING' ? 'bg-yellow-500' : 'bg-indigo-400');

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost relative !px-2.5 !py-1.5"
        onClick={() => { setOpen((v) => !v); if (!open && unread) markAllRead(); }}
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}
        aria-expanded={open}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 max-h-[70vh] w-80 overflow-auto rounded-xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notificações</span>
            <button className="text-xs text-accent hover:underline" onClick={markAllRead}>Marcar lidas</button>
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nenhuma notificação.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {items.map((it) => (
                <li key={it.id} className="flex gap-2 px-3 py-2.5 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot(it.severity)}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">{it.title}</p>
                    <p className="text-xs text-ink-2">{it.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{relativeTime(it.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Toast em tempo real */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-border bg-surface px-4 py-3 shadow-2xl" role="status">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot(toast.severity)}`} aria-hidden />
            <div>
              <p className="text-sm font-semibold">{toast.title}</p>
              <p className="text-xs text-ink-2">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
