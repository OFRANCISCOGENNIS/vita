// FILTROS / LOOKS por clipe — catálogo de estilos aplicados via ctx.filter
// (CSS filter no canvas 2D). Puros e serializáveis: o clipe só guarda o id.

export interface ClipFilter {
  id: string;
  name: string;
  css: string; // valor de ctx.filter
  /** tint opcional por cima (cor + alpha + blend). */
  overlay?: { color: string; opacity: number; blend: string };
}

export const CLIP_FILTERS: ClipFilter[] = [
  { id: "none", name: "Original", css: "none" },
  { id: "vivid", name: "Vívido", css: "saturate(1.45) contrast(1.12)" },
  { id: "warm", name: "Quente", css: "sepia(0.25) saturate(1.2) brightness(1.05)" },
  { id: "cold", name: "Frio", css: "saturate(0.9) hue-rotate(12deg) brightness(1.02)" },
  { id: "bw", name: "P&B", css: "grayscale(1) contrast(1.15)" },
  { id: "sepia", name: "Sépia", css: "sepia(0.85) contrast(1.05)" },
  {
    id: "vintage",
    name: "Vintage",
    css: "sepia(0.35) saturate(0.85) contrast(0.95) brightness(1.04)",
    overlay: { color: "#e8b06a", opacity: 0.12, blend: "overlay" },
  },
  {
    id: "cinema",
    name: "Cinema",
    css: "contrast(1.18) saturate(1.08) brightness(0.96)",
    overlay: { color: "#0b2a3d", opacity: 0.16, blend: "overlay" },
  },
  {
    id: "teal-orange",
    name: "Teal & Orange",
    css: "contrast(1.12) saturate(1.25) hue-rotate(-8deg)",
    overlay: { color: "#0d5c63", opacity: 0.14, blend: "overlay" },
  },
  {
    id: "neon",
    name: "Neon",
    css: "saturate(1.7) contrast(1.25) brightness(1.05) hue-rotate(8deg)",
    overlay: { color: "#7c3aed", opacity: 0.12, blend: "screen" },
  },
  { id: "soft", name: "Suave", css: "brightness(1.06) saturate(0.92) contrast(0.94)" },
  { id: "dramatic", name: "Dramático", css: "contrast(1.3) brightness(0.92) saturate(1.05)" },
  { id: "bw1", name: "P&B 1", css: "grayscale(1) contrast(1.25) brightness(1.05)" },
  { id: "bw-elegante", name: "P&B elegante", css: "grayscale(1) contrast(0.92) brightness(1.08) sepia(0.05)" },
  {
    id: "escuro",
    name: "Escuro",
    css: "brightness(0.82) contrast(1.2) saturate(0.95)",
    overlay: { color: "#0a0a14", opacity: 0.18, blend: "overlay" },
  },
  { id: "nitido", name: "Nítido", css: "contrast(1.15) saturate(1.1) brightness(1.02)" },
];

const byId = new Map<string, ClipFilter>();
CLIP_FILTERS.forEach((f) => byId.set(f.id, f));

export function filterById(id: string | undefined): ClipFilter | null {
  if (!id || id === "none") return null;
  return byId.get(id) ?? null;
}

// ------------------------------------------------- efeitos de sobreposição

/** Efeitos desenhados POR CIMA do clipe — ids usados em Clip.effects. */
export const OVERLAY_EFFECTS: { id: string; name: string }[] = [
  { id: "vignette", name: "Vinheta" },
  { id: "grain", name: "Grão de filme" },
  { id: "vhs", name: "VHS" },
  { id: "glitch", name: "Glitch" },
  { id: "light-leak", name: "Vazamento de luz" },
  { id: "snow", name: "Neve" },
  { id: "rain", name: "Chuva" },
];
