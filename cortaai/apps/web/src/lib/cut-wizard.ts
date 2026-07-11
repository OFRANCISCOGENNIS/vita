// Pre-cut questionnaire ("Assistente de cortes") — answer types, labels and
// per-project persistence. Answers steer the smart-cut generation (segment
// duration, titles, hashtags, CTA) and are stored per user + project in
// localStorage so re-generating reuses them.

import type { Niche } from "./types";
import { NICHES } from "./presets";
import { currentUser } from "./session-scope";

export type WizardObjetivo = "viralizar" | "vender" | "educar" | "entreter";
export type WizardPlataforma = "tiktok" | "reels" | "shorts";
export type WizardTom = "energico" | "calmo" | "polemico" | "inspirador";
export type WizardDuracao = "auto" | "15" | "30" | "60";
export type WizardGancho = "pergunta" | "choque" | "promessa" | "loop";
export type WizardCta = "comentar" | "seguir" | "link" | "nenhum";

export interface WizardAnswers {
  objetivo: WizardObjetivo;
  plataforma: WizardPlataforma;
  nicho: Niche;
  tom: WizardTom;
  duracao: WizardDuracao;
  gancho: WizardGancho;
  cta: WizardCta;
}

export const DEFAULT_ANSWERS: WizardAnswers = {
  objetivo: "viralizar",
  plataforma: "tiktok",
  nicho: "podcast",
  tom: "energico",
  duracao: "auto",
  gancho: "promessa",
  cta: "comentar",
};

export interface WizardOption {
  id: string;
  label: string;
  hint?: string;
}

export interface WizardStep {
  key: keyof WizardAnswers;
  title: string;
  subtitle: string;
  options: WizardOption[];
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    key: "objetivo",
    title: "Qual é o objetivo destes cortes?",
    subtitle: "Isso muda os títulos, o CTA e o ritmo dos trechos escolhidos.",
    options: [
      { id: "viralizar", label: "Viralizar", hint: "alcance máximo, ganchos fortes" },
      { id: "vender", label: "Vender", hint: "argumentos e prova social" },
      { id: "educar", label: "Educar", hint: "clareza e passos práticos" },
      { id: "entreter", label: "Entreter", hint: "momentos leves e divertidos" },
    ],
  },
  {
    key: "plataforma",
    title: "Plataforma alvo",
    subtitle: "Define hashtags e o limite ideal de duração.",
    options: [
      { id: "tiktok", label: "TikTok", hint: "até 10 min, ritmo rápido" },
      { id: "reels", label: "Reels", hint: "até 90s, estética forte" },
      { id: "shorts", label: "Shorts", hint: "até 60s, retenção alta" },
    ],
  },
  {
    key: "nicho",
    title: "Qual é o nicho do conteúdo?",
    subtitle: "Usamos os padrões do Radar Viral deste nicho (duração, ganchos, sons).",
    options: NICHES.map((n) => ({ id: n, label: n.charAt(0).toUpperCase() + n.slice(1) })),
  },
  {
    key: "tom",
    title: "Qual tom você quer nos cortes?",
    subtitle: "Ajusta o vocabulário dos títulos e descrições.",
    options: [
      { id: "energico", label: "Enérgico", hint: "impacto e urgência" },
      { id: "calmo", label: "Calmo", hint: "próximo e acolhedor" },
      { id: "polemico", label: "Polêmico", hint: "opinião forte, debate" },
      { id: "inspirador", label: "Inspirador", hint: "história e superação" },
    ],
  },
  {
    key: "duracao",
    title: "Duração desejada por corte",
    subtitle: "Em \"automático\" usamos a duração média que performa no seu nicho.",
    options: [
      { id: "auto", label: "Automática", hint: "padrão do nicho" },
      { id: "15", label: "~15 segundos", hint: "ultra curto" },
      { id: "30", label: "~30 segundos", hint: "equilíbrio" },
      { id: "60", label: "~60 segundos", hint: "mais contexto" },
    ],
  },
  {
    key: "gancho",
    title: "Tipo de gancho preferido",
    subtitle: "O padrão dos primeiros 3 segundos de cada corte.",
    options: [
      { id: "pergunta", label: "Pergunta", hint: "\"você sabia que…?\"" },
      { id: "choque", label: "Choque", hint: "momento inesperado" },
      { id: "promessa", label: "Promessa", hint: "\"em 30s você aprende…\"" },
      { id: "loop", label: "Loop", hint: "final conecta com o começo" },
    ],
  },
  {
    key: "cta",
    title: "Chamada para ação (CTA)",
    subtitle: "Entra na descrição de cada corte.",
    options: [
      { id: "comentar", label: "Comentar", hint: "gera engajamento" },
      { id: "seguir", label: "Seguir", hint: "cresce a base" },
      { id: "link", label: "Link na bio", hint: "tráfego/venda" },
      { id: "nenhum", label: "Nenhum", hint: "sem CTA explícito" },
    ],
  },
];

/** Short pt-BR labels for the compact summary chips. */
export const ANSWER_LABELS: Record<keyof WizardAnswers, Record<string, string>> = {
  objetivo: { viralizar: "Viralizar", vender: "Vender", educar: "Educar", entreter: "Entreter" },
  plataforma: { tiktok: "TikTok", reels: "Reels", shorts: "Shorts" },
  nicho: Object.fromEntries(NICHES.map((n) => [n, n.charAt(0).toUpperCase() + n.slice(1)])),
  tom: { energico: "Enérgico", calmo: "Calmo", polemico: "Polêmico", inspirador: "Inspirador" },
  duracao: { auto: "Duração auto", "15": "~15s", "30": "~30s", "60": "~60s" },
  gancho: { pergunta: "Gancho: pergunta", choque: "Gancho: choque", promessa: "Gancho: promessa", loop: "Gancho: loop" },
  cta: { comentar: "CTA: comentar", seguir: "CTA: seguir", link: "CTA: link na bio", nenhum: "Sem CTA" },
};

export function summaryChips(a: WizardAnswers): string[] {
  return (Object.keys(ANSWER_LABELS) as Array<keyof WizardAnswers>).map(
    (k) => ANSWER_LABELS[k][a[k]] ?? String(a[k]),
  );
}

// ---------------------------------------------------------------- persistence

function storageKey(projectId: string): string {
  const email = currentUser()?.email?.trim().toLowerCase() ?? "anon";
  return `cortaai-cutwizard:${email}:${projectId}`;
}

export function readWizardAnswers(projectId: string): WizardAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardAnswers>;
    // Merge over defaults so older saves stay forward-compatible.
    return { ...DEFAULT_ANSWERS, ...parsed };
  } catch {
    return null;
  }
}

export function saveWizardAnswers(projectId: string, answers: WizardAnswers): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(answers));
  } catch {
    /* quota/private mode — answers stay in-memory for the session */
  }
}
