'use client';

import { useState } from 'react';
import { useApi } from '@/lib/useApi';
import { api, qs } from '@/lib/api';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { num } from '@/lib/format';

interface Product {
  id: string; name: string; category: string; platforms: string[]; country: string;
  priceRange: string; demandScore: number; growth7d: number;
  competition: 'BAIXA' | 'MEDIA' | 'ALTA'; trend: number[]; insight: string;
}
interface Video {
  id: string; title: string; platform: string; country: string; category: string;
  views: number; growth24h: number; format: string; hook: string; whyItWorks: string; url?: string;
}

const COUNTRIES = [
  { v: '', l: '🌎 Mundo todo' },
  { v: 'BR', l: '🇧🇷 Brasil' },
  { v: 'US', l: '🇺🇸 Estados Unidos' },
];
const MARKETPLACES: Record<string, string> = {
  TIKTOK_SHOP: 'TikTok Shop', SHOPEE: 'Shopee', MERCADO_LIVRE: 'Mercado Livre', AMAZON: 'Amazon',
};
const SOCIAL_LABEL: Record<string, string> = { TIKTOK: 'TikTok', REELS: 'Reels', SHORTS: 'Shorts', YOUTUBE: 'YouTube' };
const SOCIAL_COLOR: Record<string, string> = { TIKTOK: '#d55181', REELS: '#9085e9', SHORTS: '#e66767', YOUTUBE: '#e66767' };

/** Sparkline SVG minimalista (12 pontos, um matiz). */
function Sparkline({ data }: { data: number[] }) {
  const w = 120, h = 32;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <polyline points={pts} fill="none" stroke="#3987e5" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function RadarPage() {
  const [tab, setTab] = useState<'produtos' | 'videos'>('produtos');
  const [country, setCountry] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [social, setSocial] = useState('');

  const products = useApi<{ source: string; items: Product[] }>(
    () => api.get(`/radar/products${qs({ country: country || undefined, platform: marketplace || undefined })}`),
    [country, marketplace],
  );
  const videos = useApi<{ source: string; items: Video[] }>(
    () => api.get(`/radar/videos${qs({ country: country || undefined, platform: social || undefined })}`),
    [country, social],
  );

  const compTone = { BAIXA: 'good', MEDIA: 'warn', ALTA: 'bad' } as const;

  return (
    <div>
      <PageHeader
        title="Radar de Tendências"
        subtitle="A máquina de inteligência: produtos que estão vendendo e vídeos em alta no mundo, atualizados continuamente."
      />

      {/* Tabs + filtros */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border" role="tablist">
          <button role="tab" aria-selected={tab === 'produtos'} className={`px-4 py-2 text-sm ${tab === 'produtos' ? 'bg-accent text-white' : 'text-ink-2 hover:bg-border/40'}`} onClick={() => setTab('produtos')}>
            🛒 Produtos em alta
          </button>
          <button role="tab" aria-selected={tab === 'videos'} className={`px-4 py-2 text-sm ${tab === 'videos' ? 'bg-accent text-white' : 'text-ink-2 hover:bg-border/40'}`} onClick={() => setTab('videos')}>
            🎬 Vídeos em alta
          </button>
        </div>
        <label className="sr-only" htmlFor="radar-pais">País</label>
        <select id="radar-pais" className="input !w-auto" value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
        </select>
        {tab === 'produtos' ? (
          <>
            <label className="sr-only" htmlFor="radar-mkt">Marketplace</label>
            <select id="radar-mkt" className="input !w-auto" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
              <option value="">Todos os marketplaces</option>
              {Object.entries(MARKETPLACES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor="radar-rede">Rede</label>
            <select id="radar-rede" className="input !w-auto" value={social} onChange={(e) => setSocial(e.target.value)}>
              <option value="">Todas as redes</option>
              {Object.entries(SOCIAL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </>
        )}
      </div>

      {tab === 'produtos' && (
        products.loading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : products.error ? (
          <ErrorState message={products.error} onRetry={products.retry} />
        ) : products.data!.items.length === 0 ? (
          <EmptyState title="Nenhum produto com esses filtros" hint="Tente outro país ou marketplace." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {products.data!.items.map((p, idx) => (
              <article key={p.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">#{idx + 1} · {p.category} · {p.country === 'GLOBAL' ? '🌎 Global' : p.country === 'BR' ? '🇧🇷 Brasil' : `🇺🇸 ${p.country}`}</p>
                    <h3 className="mt-0.5 font-medium">{p.name}</h3>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {p.platforms.map((m) => <Badge key={m}>{MARKETPLACES[m] ?? m}</Badge>)}
                      <Badge tone={compTone[p.competition]}>concorrência {p.competition.toLowerCase()}</Badge>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum font-display text-2xl font-bold text-accent">{p.demandScore}</p>
                    <p className="text-[10px] text-muted">demanda</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Sparkline data={p.trend} />
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold text-green-400">▲ {p.growth7d}% em 7 dias</p>
                    <p className="text-xs text-muted">{p.priceRange}</p>
                  </div>
                </div>
                <p className="mt-3 border-t border-border pt-2 text-sm text-ink-2">💡 {p.insight}</p>
              </article>
            ))}
          </div>
        )
      )}

      {tab === 'videos' && (
        videos.loading ? (
          <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
        ) : videos.error ? (
          <ErrorState message={videos.error} onRetry={videos.retry} />
        ) : videos.data!.items.length === 0 ? (
          <EmptyState title="Nenhum vídeo com esses filtros" hint="Tente outra rede ou país." />
        ) : (
          <>
            {videos.data!.source.includes('youtube-api') && (
              <p className="mb-3 text-xs text-muted">✅ Vídeos do YouTube vindos da YouTube Data API em tempo real.</p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {videos.data!.items.map((v) => (
                <article key={v.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <span className="h-2 w-2 rounded-full" style={{ background: SOCIAL_COLOR[v.platform] }} aria-hidden />
                        {SOCIAL_LABEL[v.platform]} · {v.country === 'GLOBAL' ? '🌎' : v.country === 'BR' ? '🇧🇷' : '🇺🇸'} · {v.category}
                      </p>
                      <h3 className="mt-0.5 font-medium">{v.url ? <a href={v.url} target="_blank" rel="noreferrer" className="hover:underline">{v.title}</a> : v.title}</h3>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum font-display text-lg font-bold">{v.views >= 1_000_000 ? `${(v.views / 1_000_000).toFixed(1)}M` : num(v.views)}</p>
                      <p className="text-[10px] text-muted">views</p>
                      {v.growth24h > 0 && <p className="tnum text-xs font-semibold text-green-400">▲ {v.growth24h}%/24h</p>}
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                    <div><dt className="inline text-muted">Formato: </dt><dd className="inline text-ink-2">{v.format}</dd></div>
                    {v.hook !== '—' && <div><dt className="inline text-muted">Gancho: </dt><dd className="inline text-ink-2">{v.hook}</dd></div>}
                    <div><dt className="inline text-muted">Por que funciona: </dt><dd className="inline text-ink-2">{v.whyItWorks}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
