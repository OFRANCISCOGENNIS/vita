'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [mode, setMode] = useState<'login' | 'registro'>(params.get('modo') === 'registro' ? 'registro' : 'login');
  const [email, setEmail] = useState('demo@trafegoai.com');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.post<{ accessToken: string }>('/auth/login', { email, password })
          : await api.post<{ accessToken: string }>('/auth/register', { email, password, name });
      setSession(res.accessToken);
      router.push('/painel');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao autenticar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-display text-2xl font-bold">
          <span aria-hidden>🚀</span> TrafegoAI
        </Link>
        <form className="card space-y-4" onSubmit={submit} aria-label={mode === 'login' ? 'Entrar' : 'Criar conta'}>
          <h1 className="font-display text-xl font-semibold">{mode === 'login' ? 'Entrar' : 'Criar conta grátis'}</h1>
          {mode === 'registro' && (
            <div>
              <label htmlFor="nome" className="mb-1 block text-sm text-ink-2">Nome</label>
              <input id="nome" className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-ink-2">E-mail</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="senha" className="mb-1 block text-sm text-ink-2">Senha</label>
            <input id="senha" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'login' && (
              <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => alert('Enviamos um link de recuperação para o seu e-mail (demonstração).')}>
                Esqueci minha senha
              </button>
            )}
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => alert('Login com Google requer GOOGLE_OAUTH_CLIENT_ID configurado (ver README).')}
          >
            <span aria-hidden>🔵</span> Continuar com Google
          </button>
          <p className="text-center text-sm text-muted">
            {mode === 'login' ? (
              <>Não tem conta? <button type="button" className="text-accent hover:underline" onClick={() => setMode('registro')}>Cadastre-se</button></>
            ) : (
              <>Já tem conta? <button type="button" className="text-accent hover:underline" onClick={() => setMode('login')}>Entrar</button></>
            )}
          </p>
          <p className="rounded-lg bg-accent/10 px-3 py-2 text-center text-xs text-ink-2">
            Demo: <strong>demo@trafegoai.com</strong> / <strong>demo1234</strong>
          </p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
