// Static product configuration from SPEC.md: platform presets, caption presets, niches.

import type { CaptionPresetId, Niche, PlatformPreset } from "./types";

export const NICHES: Niche[] = [
  "finanças",
  "fitness",
  "podcast",
  "humor",
  "educação",
  "tecnologia",
  "beleza",
  "games",
];

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "tiktok",
    name: "TikTok",
    resolution: "1080×1920 (até 2160×3840)",
    maxDuration: "10 min",
    safeZone: { top: 108, bottom: 320, left: 120, right: 120 },
  },
  {
    id: "reels",
    name: "Reels",
    resolution: "1080×1920",
    maxDuration: "90 s",
    safeZone: { top: 220, bottom: 420, left: 0, right: 0 },
  },
  {
    id: "shorts",
    name: "Shorts",
    resolution: "1080×1920",
    maxDuration: "60 s",
    safeZone: { top: 120, bottom: 240, left: 0, right: 0 },
  },
];

export interface CaptionPresetDef {
  id: CaptionPresetId;
  name: string;
  description: string;
  /** Inline style for the live preview chip in the editor. */
  previewClass: string;
  sample: string;
}

export const CAPTION_PRESETS: CaptionPresetDef[] = [
  {
    id: "hormozi",
    name: "Hormozi",
    description: "Palavras grandes, amarelo + branco, alto impacto",
    previewClass:
      "font-black uppercase text-yellow-300 [text-shadow:2px_2px_0_#000,-2px_2px_0_#000,2px_-2px_0_#000,-2px_-2px_0_#000] tracking-tight",
    sample: "ISSO MUDA TUDO",
  },
  {
    id: "karaoke",
    name: "Karaokê",
    description: "Palavra ativa destacada conforme o áudio",
    previewClass: "font-bold text-white [&>b]:text-accent-hot [&>b]:underline",
    sample: "cada palavra ACENDE no tempo",
  },
  {
    id: "neon",
    name: "Neon",
    description: "Brilho neon vibrante, ótimo para games e música",
    previewClass:
      "font-bold text-fuchsia-300 [text-shadow:0_0_8px_#d946ef,0_0_20px_#d946ef]",
    sample: "brilho que segura o olhar",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Discreto, elegante, fundo sutil",
    previewClass: "font-medium text-zinc-100 bg-black/50 px-2 py-0.5 rounded",
    sample: "menos é mais",
  },
  {
    id: "boldEmoji",
    name: "Bold + Emoji",
    description: "Negrito com emojis automáticos por palavra-chave",
    previewClass: "font-extrabold text-white",
    sample: "dinheiro 💰 no bolso 🔥",
  },
  {
    id: "highlightBox",
    name: "Highlight Box",
    description: "Caixa colorida atrás da palavra-chave",
    previewClass:
      "font-bold text-white [&>b]:bg-accent [&>b]:px-1.5 [&>b]:rounded [&>b]:text-white",
    sample: "a palavra em destaque",
  },
  {
    id: "typewriter",
    name: "Typewriter",
    description: "Efeito máquina de escrever, letra por letra",
    previewClass:
      "font-mono text-emerald-300 border-r-2 border-emerald-300 pr-1 overflow-hidden whitespace-nowrap",
    sample: "digitando ao vivo_",
  },
  {
    id: "gradientAnimated",
    name: "Gradient Animated",
    description: "Gradiente animado violeta → fúcsia",
    previewClass:
      "font-extrabold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent",
    sample: "gradiente em movimento",
  },
];

export const CUT_MODES: { id: string; name: string; description: string }[] = [
  { id: "viral", name: "Momentos virais", description: "IA busca picos de emoção e ganchos fortes" },
  { id: "qa", name: "Perguntas e respostas", description: "Detecta pares de pergunta → resposta" },
  { id: "tutorial", name: "Tutorial em passos", description: "Divide instruções em passos numerados" },
  { id: "quotes", name: "Melhores frases", description: "Frases de efeito e citações marcantes" },
  { id: "manual", name: "Corte manual", description: "Você define os pontos de entrada e saída" },
];
