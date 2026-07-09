import Link from 'next/link';

/** Landing page vendedora — hero, prova social, como funciona, planos e FAQ. */
export default function LandingPage() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      {/* Header */}
      <header className="flex items-center justify-between py-6">
        <span className="flex items-center gap-2 font-display text-xl font-bold">
          <span aria-hidden>🚀</span> TrafegoAI
        </span>
        <nav className="flex items-center gap-3 text-sm" aria-label="Navegação do site">
          <a href="#como-funciona" className="text-ink-2 hover:text-ink max-sm:hidden">Como funciona</a>
          <a href="#planos" className="text-ink-2 hover:text-ink max-sm:hidden">Planos</a>
          <a href="#faq" className="text-ink-2 hover:text-ink max-sm:hidden">FAQ</a>
          <Link href="/login" className="btn-ghost">Entrar</Link>
          <Link href="/login?modo=registro" className="btn-primary">Começar grátis</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="py-20 text-center">
        <p className="mb-4 inline-block rounded-full border border-border px-3 py-1 text-xs text-ink-2">
          Google Ads · Meta Ads · TikTok Ads — unificados
        </p>
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl">
          Todas as suas campanhas do Google, Meta e TikTok em um só painel — <span className="text-accent">otimizadas por IA</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-2">
          O TrafegoAI analisa suas contas como um gestor de tráfego sênior: diagnostica o que queima verba,
          recomenda o que escalar e automatiza as decisões repetitivas — com sua aprovação em cada passo.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login?modo=registro" className="btn-primary !px-6 !py-3 !text-base">Criar conta grátis</Link>
          <Link href="/login" className="btn-ghost !px-6 !py-3 !text-base">Ver demonstração</Link>
        </div>
        <p className="mt-4 text-xs text-muted">Demo: demo@trafegoai.com · senha demo1234</p>
      </section>

      {/* Prova social */}
      <section className="grid gap-4 border-y border-border py-10 text-center sm:grid-cols-3">
        {[
          ['R$ 2,4 mi', 'em mídia gerenciada na plataforma'],
          ['+31%', 'de ROAS médio após 60 dias'],
          ['4.9/5', 'avaliação de gestores e agências'],
        ].map(([v, l]) => (
          <div key={l}>
            <p className="font-display text-3xl font-bold text-accent">{v}</p>
            <p className="mt-1 text-sm text-muted">{l}</p>
          </div>
        ))}
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="py-16">
        <h2 className="text-center font-display text-3xl font-bold">Como funciona</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            ['1. Conecte suas contas', 'OAuth oficial com Google Ads, Meta Marketing e TikTok Ads. Múltiplas contas e clientes, com sincronização automática.', '🔌'],
            ['2. Receba o diagnóstico da IA', 'Em minutos a IA varre tudo e mostra em português claro: o que vai bem, o que queima verba e por quê.', '🤖'],
            ['3. Aplique com um clique', 'Recomendações priorizadas por impacto, aplicáveis via API com confirmação — e regras de automação 24/7.', '⚡'],
          ].map(([t, d, icon]) => (
            <div key={t} className="card">
              <span className="text-2xl" aria-hidden>{icon}</span>
              <h3 className="mt-3 font-display text-lg font-semibold">{t}</h3>
              <p className="mt-2 text-sm text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="py-16">
        <h2 className="text-center font-display text-3xl font-bold">Planos</h2>
        <p className="mt-2 text-center text-sm text-muted">Mensal ou anual (2 meses grátis). Checkout seguro via Stripe.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { name: 'Starter', price: 'R$ 97/mês', items: ['1 conta por plataforma', 'Dashboard unificado', 'Diagnóstico de IA básico', 'Alertas de anomalias'], featured: false },
            { name: 'Pro', price: 'R$ 297/mês', items: ['Contas ilimitadas por plataforma', 'Recomendações + aplicar com 1 clique', 'Regras de automação', 'Gerador de criativos com IA'], featured: true },
            { name: 'Agência', price: 'R$ 697/mês', items: ['Clientes ilimitados', 'Relatórios white-label agendados', 'Dashboard compartilhável por link', 'Papéis e permissões por cliente'], featured: false },
          ].map((p) => (
            <div key={p.name} className={`card flex flex-col ${p.featured ? 'border-accent ring-1 ring-accent' : ''}`}>
              {p.featured && <span className="badge mb-2 self-start bg-accent/15 text-indigo-300">Mais popular</span>}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <p className="mt-1 font-display text-2xl font-bold text-accent">{p.price}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
                {p.items.map((i) => <li key={i} className="flex gap-2"><span className="text-green-400" aria-hidden>✓</span>{i}</li>)}
              </ul>
              <Link href="/login?modo=registro" className={`mt-6 ${p.featured ? 'btn-primary' : 'btn-ghost'} w-full`}>Assinar {p.name}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16">
        <h2 className="text-center font-display text-3xl font-bold">Perguntas frequentes</h2>
        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {[
            ['A IA pode gastar meu orçamento sozinha?', 'Não. Toda ação que altera verba ou campanhas exige sua confirmação explícita — a não ser dentro de regras de automação que você mesmo criou e ativou. Tudo fica registrado em log de auditoria.'],
            ['Preciso dar minha senha do Google/Meta/TikTok?', 'Nunca. A conexão usa OAuth oficial de cada plataforma; os tokens são criptografados em repouso e você pode revogar quando quiser (LGPD).'],
            ['Funciona para agências?', 'Sim — o plano Agência inclui múltiplos clientes, permissões por papel, relatórios white-label com sua marca e dashboards compartilháveis por link.'],
            ['Quais métricas são unificadas?', 'Investimento, receita, ROAS, ROI, CPA, CPC, CPM, CTR, taxa de conversão, impressões, cliques e conversões — normalizadas num schema comum entre as três plataformas.'],
          ].map(([q, a]) => (
            <details key={q} className="card group">
              <summary className="cursor-pointer list-none font-medium marker:hidden">{q}</summary>
              <p className="mt-2 text-sm text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">
        © {new Date().getFullYear()} TrafegoAI — feito para gestores de tráfego. LGPD: seus dados, suas regras.
      </footer>
    </main>
  );
}
