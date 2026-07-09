// Metadata for the 8 Estúdio IA tools (left column). Icons from lucide-react.

import {
  Clapperboard,
  Expand,
  Film,
  Image as ImageIcon,
  MoveHorizontal,
  Paintbrush,
  Sparkles,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { StudioFunction } from "@/lib/types";

export interface ToolMeta {
  fn: StudioFunction;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const STUDIO_TOOLS: ToolMeta[] = [
  { fn: "text_to_video", label: "Texto → Vídeo", description: "Descreva a cena e a IA gera o vídeo do zero.", icon: Type },
  { fn: "image_to_video", label: "Imagem → Vídeo", description: "Dê vida a uma imagem com movimento e câmera.", icon: ImageIcon },
  { fn: "extend", label: "Extensão de clipe", description: "Prolongue um corte ou crie um loop perfeito.", icon: Expand },
  { fn: "frames", label: "Quadro inicial e final", description: "Interpole entre duas imagens (início → fim).", icon: Film },
  { fn: "motion_brush", label: "Motion Brush", description: "Pincele regiões e defina a direção do movimento.", icon: Paintbrush },
  { fn: "lip_sync", label: "Lip Sync", description: "Sincronize a fala a partir de texto ou áudio.", icon: MoveHorizontal },
  { fn: "camera", label: "Movimentos de câmera", description: "Monte uma sequência de movimentos de câmera.", icon: Clapperboard },
  { fn: "effect_template", label: "Templates de efeito", description: "Efeitos prontos: explodir, derreter, inflar…", icon: Sparkles },
];

export const CAMERA_MOVEMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Sem movimento" },
  { value: "zoom_in", label: "Zoom in" },
  { value: "orbit", label: "Órbita" },
  { value: "pan_left", label: "Pan para a esquerda" },
];

export const CAMERA_MOVE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "zoom_in", label: "Zoom in" },
  { value: "pan_left", label: "Pan esquerda" },
  { value: "orbit", label: "Órbita" },
  { value: "tilt_up", label: "Tilt para cima" },
  { value: "dolly", label: "Dolly" },
];

/** Vozes pt-BR para a narração (TTS). */
export const TTS_VOICES: { value: string; label: string }[] = [
  { value: "pt-BR-Francisca", label: "Francisca (feminina, calorosa)" },
  { value: "pt-BR-Antonio", label: "Antônio (masculina, firme)" },
  { value: "pt-BR-Brenda", label: "Brenda (feminina, jovem)" },
  { value: "pt-BR-Julio", label: "Júlio (masculina, locução)" },
];
