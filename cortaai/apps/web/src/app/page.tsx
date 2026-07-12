import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Captions,
  Clapperboard,
  Download,
  Image as ImageIcon,
  ImagePlus,
  Palette,
  Scissors,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "CortaAí — Editor de vídeo profissional 100% no navegador",
  alternates: { canonical: "/" },
};

const FAQ_ITEMS = [
  {
    question: "Preciso instalar alguma coisa?",
    answer:
      "Não. O CortaAí roda 100% no navegador: timeline multi-trilha, legendas, correção de cor, editor de fotos e estúdio de capa — tudo sem download, sem plugin e sem enviar seus arquivos para terceiros.",
  },
  {
    question: "Quais formatos de vídeo posso enviar?",
    answer:
      "MP4, MOV, MKV e WEBM de até 10 GB. Você também pode selecionar vários arquivos de uma vez e juntar tudo em um vídeo só, direto no navegador.",
  },
  {
    question: "Como funcionam as legendas?",
    answer:
      "Você edita as legendas na própria timeline, escolhe entre 8 estilos visuais (Hormozi, karaokê, neon e mais) com safe zones de cada rede — e exporta o arquivo .srt junto com o vídeo.",
  },
  {
    question: "Qual a qualidade máxima de exportação?",
    answer:
      "Até 4K vertical (2160×3840) a 60fps em H.264 ou H.265, liberado para todo mundo. Nunca fazemos upscale: se a origem é 1080p, entregamos o melhor 1080p possível, com áudio normalizado em -14 LUFS.",
  },
  {
    question: "Os vídeos ficam com marca d'água do CortaAí?",
    answer:
      "Não. Seus vídeos saem sempre limpos e com o seu próprio kit de marca: logo, fontes e cores aplicados automaticamente — se você quiser.",
  },
  {
    question: "Preciso pagar alguma coisa?",
    answer:
      "Não. O CortaAí é gratuito e sem limites: editor completo, legendas, editor de fotos, estúdio de capa e exportação, tudo liberado — sem cartão de crédito.",
  },
];

const SOCIAL_PROOF = [
  "PodCentral", "Estúdio Vira Clip", "Canal do Migue", "FinançasBR", "GamePlay+",
  "Escola do Criador", "TreinoCast", "TechSemFio",
];

function FlowDemo() {
  // Animated CSS demo of the product flow: Envie → Edite → Exporte.
  return (
    <div className="relative mx-auto mt-14 w-full max-w-4xl" aria-hidden>
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {/* Envio */}
        <div className="rounded-2xl border border-line bg-surface-1/80 p-4 shadow-card backdrop-blur animate-float">
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
            <Clapperboard className="h-4 w-4" /> Seu vídeo
          </div>
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-surface-2 p-1.5">
                <div className="h-6 w-9 rounded-md bg-gradient-to-br from-violet-700 to-fuchsia-800" />
                <div className="h-1.5 flex-1 rounded bg-white/10" />
              </div>
            ))}
          </div>
          <div className="relative mt-3 h-1 overflow-hidden rounded bg-surface-3">
            <span className="absolute h-1 w-1/3 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 animate-flow-dot" />
          </div>
        </div>
        {/* Timeline */}
        <div className="rounded-2xl border border-line bg-surface-1/80 p-4 shadow-card backdrop-blur animate-float [animation-delay:600ms]">
          <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-300">
            <Scissors className="h-4 w-4" /> Timeline
          </div>
          <div className="mt-3 flex h-[68px] items-end gap-[3px]">
            {[6, 12, 9, 18, 26, 20, 32, 24, 14, 30, 22, 10, 16, 8].map((h, i) => (
              <span
                key={i}
                className="w-full rounded-sm bg-gradient-to-t from-violet-600/70 to-fuchsia-400/70 animate-pulse-soft"
                style={{ height: `${h * 2}px`, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] text-zinc-400">
            <span>Legendas + cor + áudio</span>
            <span className="rounded-full bg-emerald-500/15 px-1.5 font-bold text-emerald-300">ok</span>
          </div>
        </div>
        {/* Export */}
        <div className="rounded-2xl border border-line bg-surface-1/80 p-4 shadow-card backdrop-blur animate-float [animation-delay:1200ms]">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
            <Download className="h-4 w-4" /> Export 4K
          </div>
          <div className="mx-auto mt-3 h-[72px] w-11 rounded-lg border border-line bg-gradient-to-b from-violet-900/60 to-fuchsia-900/40 p-1">
            <div className="h-2 w-full rounded-sm bg-white/15" />
            <div className="mt-1 h-1.5 w-3/4 rounded-sm bg-white/10" />
            <div className="mt-6 h-1.5 w-full rounded-sm bg-fuchsia-400/50" />
          </div>
          <div className="relative mt-3 h-1.5 overflow-hidden rounded bg-surface-3">
            <span className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-emerald-500 to-emerald-300 animate-bar-grow" />
          </div>
          <p className="mt-1.5 text-center text-[10px] text-zinc-500">2160×3840 · 60fps · H.265</p>
        </div>
      </div>
      {/* connectors */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden justify-around px-[16%] sm:flex">
        <ArrowRight className="h-5 w-5 text-violet-500/70" />
        <ArrowRight className="h-5 w-5 text-fuchsia-500/70" />
      </div>
    </div>
  );
}

function BeforeAfter() {
  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface-1 p-6">
        <Badge variant="danger">Antes</Badge>
        <h3 className="mt-3 text-lg font-bold text-white">Editor pesado, instalação e renderizações lentas</h3>
        <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4" aria-hidden>
          <div className="aspect-video rounded-lg bg-gradient-to-br from-zinc-800 to-zinc-900" />
          <div className="mt-3 h-2 w-2/3 rounded bg-white/10" />
          <div className="mt-2 h-2 w-1/3 rounded bg-white/5" />
          <p className="mt-3 text-xs text-zinc-500">Instalação de 4 GB · projeto preso em um só computador</p>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-zinc-500">
          <li>• Programa pago e pesado para tarefas simples</li>
          <li>• Legendas feitas na mão, uma a uma, sem estilo</li>
          <li>• Capa e fotos editadas em outro aplicativo</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-violet-500/40 bg-gradient-to-b from-violet-950/40 to-surface-1 p-6 shadow-glow">
        <Badge variant="success">Depois, com o CortaAí</Badge>
        <h3 className="mt-3 text-lg font-bold text-white">Tudo no navegador, do upload à exportação</h3>
        <div className="mt-4 grid grid-cols-3 gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-line bg-surface-2 p-1.5">
              <div className="aspect-[9/16] rounded-md bg-gradient-to-b from-violet-800/70 to-fuchsia-900/50" />
              <div className="mt-1.5 h-1.5 w-2/3 rounded bg-white/10" />
            </div>
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
          <li>• Timeline multi-trilha com atalhos de teclado</li>
          <li>• Legendas em 8 estilos aplicadas em 1 clique</li>
          <li>• Editor de fotos e estúdio de capa integrados</li>
        </ul>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 md:flex" aria-label="Navegação principal">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <a href="#faq" className="hover:text-white">Dúvidas</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/entrar"
              className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pb-24 pt-20 text-center">
          <div className="mx-auto max-w-3xl">
            <Badge variant="accent" className="mb-6">
              <Sparkles className="h-3 w-3" /> Editor de vídeo profissional no navegador
            </Badge>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl">
              Edite. Legende.{" "}
              <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                Exporte em 4K.
              </span>{" "}
              Sem instalar nada.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              O CortaAí é um editor de vídeo completo que roda 100% no navegador: timeline
              multi-trilha, legendas com estilo, correção de cor, editor de fotos e estúdio de
              capa — prontos para TikTok, Reels e Shorts.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/cadastro"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 text-base font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Editar meu primeiro vídeo grátis <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#recursos"
                className="inline-flex h-12 items-center rounded-xl border border-line px-7 text-base font-medium text-zinc-300 transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Ver recursos
              </a>
            </div>
            <p className="mt-4 text-xs text-zinc-600">Grátis e sem limites · sem cartão de crédito</p>
          </div>
          <FlowDemo />
        </section>

        {/* Social proof */}
        <section className="border-y border-line bg-surface-1/50 py-8" aria-label="Criadores que usam o CortaAí">
          <p className="mb-5 text-center text-xs font-medium uppercase tracking-widest text-zinc-600">
            Usado por mais de 12 mil criadores e estúdios
          </p>
          <div className="relative overflow-hidden">
            <div className="flex w-max animate-marquee gap-14 px-7">
              {[...SOCIAL_PROOF, ...SOCIAL_PROOF].map((name, i) => (
                <span key={i} className="whitespace-nowrap text-lg font-bold text-zinc-600">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Editor highlight */}
        <section className="px-4 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="accent" className="mb-4"><Scissors className="h-3 w-3" /> Editor completo</Badge>
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
                Poder de estúdio, leveza de navegador
              </h2>
              <p className="mt-4 text-zinc-400">
                Corte, divida e reorganize clipes na timeline multi-trilha, ajuste cor e áudio,
                aplique legendas com estilo e veja tudo em tempo real — no desktop e no celular.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: <SlidersHorizontal className="h-5 w-5" />,
                  title: "Timeline multi-trilha",
                  desc: "Corte no playhead, marque entrada/saída, desfaça e refaça com atalhos de teclado profissionais.",
                },
                {
                  icon: <Captions className="h-5 w-5" />,
                  title: "Legendas com estilo",
                  desc: "8 estilos prontos (Hormozi, karaokê, neon...) com safe zones de cada rede e exportação .srt.",
                },
                {
                  icon: <Palette className="h-5 w-5" />,
                  title: "Cor e áudio finos",
                  desc: "Curvas, filtros, chroma key, velocidade, transições e normalização de áudio em -14 LUFS.",
                },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-line bg-surface-1 p-6 shadow-card">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    {f.icon}
                  </span>
                  <h3 className="mt-4 font-bold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Before / After */}
        <section className="border-t border-line bg-surface-1/40 px-4 py-24">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
              Do arquivo bruto ao vídeo pronto, em uma aba
            </h2>
          </div>
          <BeforeAfter />
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="px-4 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Como funciona</h2>
              <p className="mt-3 text-zinc-400">Três passos entre o arquivo bruto e o vídeo publicado.</p>
            </div>
            <ol className="grid gap-6 md:grid-cols-3">
              {[
                {
                  n: "1",
                  icon: <Clapperboard className="h-6 w-6" />,
                  title: "Envie seu vídeo",
                  desc: "Upload de até 10 GB (MP4, MOV, MKV, WEBM). Vários arquivos? Junte tudo em um vídeo só, no navegador.",
                },
                {
                  n: "2",
                  icon: <Scissors className="h-6 w-6" />,
                  title: "Edite na timeline",
                  desc: "Corte e divida clipes, ajuste cor e áudio, aplique legendas, textos, stickers e transições.",
                },
                {
                  n: "3",
                  icon: <Download className="h-6 w-6" />,
                  title: "Exporte em até 4K",
                  desc: "Formato de cada rede com safe zones — e exportação com legenda .srt, capa e descrição .txt.",
                },
              ].map((s) => (
                <li key={s.n} className="relative rounded-2xl border border-line bg-surface-1 p-7 shadow-card">
                  <span className="absolute -top-4 left-7 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <span className="mt-2 inline-flex text-fuchsia-300">{s.icon}</span>
                  <h3 className="mt-3 text-lg font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.desc}</p>
                </li>
              ))}
            </ol>
            <div className="mt-14 text-center">
              <Link
                href="/cadastro"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 text-base font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Quero testar agora <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="border-t border-line bg-surface-1/40 px-4 py-24">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <Badge variant="accent" className="mb-4"><Sparkles className="h-3 w-3" /> Tudo incluído</Badge>
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Tudo o que você precisa, de graça</h2>
              <p className="mt-3 text-zinc-400">
                Sem planos, sem cota de minutos, sem marca d&apos;água. Todos os recursos liberados para todos os criadores.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: <Scissors className="h-5 w-5" />,
                  title: "Timeline multi-trilha",
                  desc: "Corte, divida e reorganize clipes com atalhos de teclado e histórico de versões automático.",
                },
                {
                  icon: <Captions className="h-5 w-5" />,
                  title: "Legendas em 8 estilos",
                  desc: "Hormozi, karaokê, neon e mais — aplicadas em 1 clique, com safe zones e exportação .srt.",
                },
                {
                  icon: <Palette className="h-5 w-5" />,
                  title: "Cor, efeitos e áudio",
                  desc: "Curvas, filtros, chroma key, transições, velocidade e normalização de áudio em -14 LUFS.",
                },
                {
                  icon: <ImagePlus className="h-5 w-5" />,
                  title: "Editor de fotos",
                  desc: "Ajustes, filtros, retoque, geometria e elementos — para tratar imagens sem sair do CortaAí.",
                },
                {
                  icon: <ImageIcon className="h-5 w-5" />,
                  title: "Estúdio de capa",
                  desc: "Desenhe capas e thumbnails com texto, formas e o seu kit de marca (logo, fontes, cores).",
                },
                {
                  icon: <Download className="h-5 w-5" />,
                  title: "Exportação até 4K",
                  desc: "Vertical 2160×3840 a 60fps em H.264/H.265, com .srt, capa e descrição — sem marca d'água.",
                },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-line bg-surface-1 p-6 shadow-card">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                    {f.icon}
                  </span>
                  <h3 className="mt-4 font-bold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-14 text-center">
              <Link
                href="/cadastro"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 text-base font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Criar conta grátis <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <p className="mt-4 text-xs text-zinc-600">Sem cartão de crédito · sem limites</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-4 py-24">
          <div className="mx-auto max-w-3xl">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Perguntas frequentes</h2>
            </div>
            <Accordion items={FAQ_ITEMS} />
            <div className="mt-14 rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-950/60 to-fuchsia-950/40 p-10 text-center shadow-glow">
              <h2 className="text-2xl font-extrabold text-white">Seu próximo vídeo já está gravado.</h2>
              <p className="mt-2 text-zinc-400">Ele só precisa ser editado, legendado e exportado.</p>
              <Link
                href="/cadastro"
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 text-base font-semibold text-white shadow-glow transition-all hover:from-violet-500 hover:to-fuchsia-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                Começar grátis agora <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface-1/60 px-4 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <Logo />
            <p className="mt-2 max-w-xs text-xs text-zinc-600">
              Editor de vídeo profissional 100% no navegador. Feito no Brasil para criadores do mundo todo.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-6 text-sm text-zinc-500" aria-label="Links do rodapé">
            <a href="#como-funciona" className="hover:text-white">Como funciona</a>
            <a href="#recursos" className="hover:text-white">Recursos</a>
            <Link href="/entrar" className="hover:text-white">Entrar</Link>
            <Link href="/cadastro" className="hover:text-white">Criar conta</Link>
          </nav>
        </div>
        <p className="mt-8 text-center text-xs text-zinc-700">
          © 2026 CortaAí Tecnologia Ltda. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
