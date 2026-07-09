'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api } from '@/lib/api';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui';

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'Por que minhas vendas caíram essa semana?',
  'Qual criativo devo escalar?',
  'Onde estou desperdiçando verba?',
];

export default function ChatPage() {
  const history = useApi<Msg[]>(() => api.get('/chat/history', true), []);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history.data) setMessages(history.data);
  }, [history.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setInput('');
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: text }]);
    try {
      const answer = await api.post<Msg>('/chat', { question: text });
      setMessages((m) => [...m, answer]);
    } catch (e) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, role: 'assistant', content: '⚠️ Não consegui responder agora. Tente novamente em instantes.' }]);
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <PageHeader title="Assistente de tráfego" subtitle="Pergunte em português — a IA responde analisando os dados reais das suas contas." />
      <div className="card flex flex-1 flex-col overflow-hidden !p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {history.loading ? (
            <Skeleton className="h-24" />
          ) : history.error ? (
            <ErrorState message={history.error} onRetry={history.retry} />
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-2xl" aria-hidden>💬</p>
              <p className="text-ink-2">Comece perguntando, por exemplo:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn-ghost !text-xs" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-accent text-white' : 'bg-border/40 text-ink'
                  }`}
                  dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>') }}
                />
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-border/40 px-4 py-2.5 text-sm text-muted">Analisando suas contas…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
          <label className="sr-only" htmlFor="pergunta">Sua pergunta</label>
          <input
            id="pergunta"
            className="input flex-1"
            placeholder="Ex.: qual campanha devo escalar essa semana?"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button type="submit" className="btn-primary" disabled={sending || !input.trim()}>Enviar</button>
        </form>
      </div>
    </div>
  );
}
