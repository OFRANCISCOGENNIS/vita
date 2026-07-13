"use client";

// Retoque (Facetune-style) + Pincéis tabs.
//
// Retoque: suavizar pele (pincel de máscara + blur seletivo que preserva
// bordas — nomeado honestamente), remover manchas (inpainting por difusão),
// clarear dentes/olhos (presets de dodge), olhos vermelhos e liquify básico.
// Pincéis: desfocar, nitidez, dodge/burn, carimbo (clone) e borracha de fundo.

import { Eraser, Eye, Sparkle, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { applySkinSmooth, portraitRetouch, type LiquifyMode } from "@/lib/photo-engine";
import { getMaskCanvas, usePhotoEditorStore, type ToolId } from "@/store/photo-editor";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

interface ToolDef { id: ToolId; label: string; hint: string }

const RETOQUE_TOOLS: ToolDef[] = [
  { id: "suavizar", label: "Suavizar pele", hint: "Pinte a máscara sobre a pele e aplique o blur seletivo" },
  { id: "manchas", label: "Remover manchas", hint: "Clique sobre a mancha/espinha para preencher" },
  { id: "dentes", label: "Clarear dentes", hint: "Pincel: clareia e remove o amarelado" },
  { id: "olhos", label: "Clarear olhos", hint: "Pincel: ilumina e realça a íris" },
  { id: "olhos-vermelhos", label: "Olhos vermelhos", hint: "Clique sobre a pupila vermelha" },
  { id: "liquify", label: "Remodelar", hint: "Arraste para remodelar; expandir/encolher/restaurar" },
];

const PINCEL_TOOLS: ToolDef[] = [
  { id: "blur", label: "Desfocar", hint: "Desfoque local por pincel" },
  { id: "sharpen", label: "Nitidez", hint: "Realce local de detalhes" },
  { id: "dodge", label: "Dodge (clarear)", hint: "Clareia onde você pinta" },
  { id: "burn", label: "Burn (escurecer)", hint: "Escurece onde você pinta" },
  { id: "clone", label: "Carimbo (clone)", hint: "1º clique define a origem, depois pinte o destino" },
  { id: "borracha", label: "Borracha de fundo", hint: "Apaga pixels da cor clicada (vira transparência)" },
];

const LIQUIFY_MODES: { id: LiquifyMode; label: string }[] = [
  { id: "empurrar", label: "Remodelar" },
  { id: "expandir", label: "Expandir" },
  { id: "encolher", label: "Encolher / afinar" },
  { id: "restaurar", label: "Restaurar" },
];

function ToolGrid({ tools }: { tools: ToolDef[] }) {
  const tool = usePhotoEditorStore((s) => s.tool);
  const setTool = usePhotoEditorStore((s) => s.setTool);
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Ferramenta">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => setTool(t.id)}
          aria-pressed={tool === t.id}
          title={t.hint}
          className={cn(
            "rounded-xl border px-2 py-2 text-left text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            tool === t.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function BrushSliders({ strengthLabel = "Força" }: { strengthLabel?: string }) {
  const brushSize = usePhotoEditorStore((s) => s.brushSize);
  const brushStrength = usePhotoEditorStore((s) => s.brushStrength);
  const setBrushSize = usePhotoEditorStore((s) => s.setBrushSize);
  const setBrushStrength = usePhotoEditorStore((s) => s.setBrushStrength);
  return (
    <div className="space-y-3">
      <Slider label="Tamanho do pincel" min={4} max={200} value={brushSize} onChange={setBrushSize} />
      <Slider label={strengthLabel} min={1} max={100} value={brushStrength} onChange={setBrushStrength} />
      <p className="text-[11px] text-zinc-500">Atalhos: [ diminui e ] aumenta o pincel.</p>
    </div>
  );
}

export function RetoquePanel() {
  const tool = usePhotoEditorStore((s) => s.tool);
  const smoothAmount = usePhotoEditorStore((s) => s.smoothAmount);
  const setSmoothAmount = usePhotoEditorStore((s) => s.setSmoothAmount);
  const liquifyMode = usePhotoEditorStore((s) => s.liquifyMode);
  const setLiquifyMode = usePhotoEditorStore((s) => s.setLiquifyMode);
  const clearMask = usePhotoEditorStore((s) => s.clearMask);
  const applyPixelOp = usePhotoEditorStore((s) => s.applyPixelOp);
  const setBusy = usePhotoEditorStore((s) => s.setBusy);

  const activeDef = RETOQUE_TOOLS.find((t) => t.id === tool);

  function applySmooth() {
    const mask = getMaskCanvas();
    if (!mask) return;
    // Quick emptiness check on a downsample of the mask.
    const probe = document.createElement("canvas");
    probe.width = 32;
    probe.height = 32;
    const pctx = probe.getContext("2d")!;
    pctx.drawImage(mask, 0, 0, 32, 32);
    const d = pctx.getImageData(0, 0, 32, 32).data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 4) { any = true; break; }
    }
    if (!any) {
      toast("Pinte a máscara primeiro", { description: "Passe o pincel sobre a pele antes de aplicar.", variant: "error" });
      return;
    }
    const amount = smoothAmount;
    setBusy("Suavizando pele em resolução total…");
    setTimeout(() => {
      applyPixelOp((base) => applySkinSmooth(base, mask, amount));
      clearMask();
      setBusy(null);
      toast("Suavização aplicada", { description: "Blur seletivo com preservação de bordas.", variant: "success" });
    }, 30);
  }

  function autoRetouch() {
    setBusy("Retocando a pele…");
    setTimeout(() => {
      try {
        applyPixelOp((base) => portraitRetouch(base, 70));
        toast("Retoque automático aplicado", { description: "Pele suavizada preservando olhos e contornos.", variant: "success" });
      } finally {
        setBusy(null);
      }
    }, 30);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Retoque (beleza)</h3>
      <Button size="sm" variant="secondary" className="w-full" onClick={autoRetouch}>
        <Wand2 className="h-3.5 w-3.5" aria-hidden /> Auto — retocar em 1 clique
      </Button>
      <ToolGrid tools={RETOQUE_TOOLS} />
      {activeDef && (
        <p className="rounded-lg bg-surface-2/80 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
          <Sparkle className="mr-1 inline h-3 w-3 text-fuchsia-400" aria-hidden />
          {activeDef.hint}
        </p>
      )}

      <BrushSliders strengthLabel={tool === "liquify" ? "Intensidade da deformação" : "Força"} />

      {tool === "suavizar" && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-3">
          <Slider label="Intensidade da suavização" min={5} max={100} value={smoothAmount} onChange={setSmoothAmount} />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="ghost" onClick={clearMask}>
              <Eraser className="h-3.5 w-3.5" aria-hidden /> Limpar máscara
            </Button>
            <Button size="sm" onClick={applySmooth}>
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> Aplicar
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            A área pintada aparece em vermelho. A suavização é um desfoque seletivo que preserva bordas (olhos, lábios, cabelo) — não usa IA.
          </p>
        </div>
      )}

      {tool === "liquify" && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
          <p className="text-[11px] font-semibold text-zinc-400">Modo do Remodelar</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Modo do Remodelar">
            {LIQUIFY_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setLiquifyMode(m.id)}
                aria-pressed={liquifyMode === m.id}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                  liquifyMode === m.id ? "border-violet-500/60 bg-violet-500/10 text-white" : "border-line text-zinc-400 hover:text-white",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PinceisPanel() {
  const tool = usePhotoEditorStore((s) => s.tool);
  const cloneSource = usePhotoEditorStore((s) => s.cloneSource);
  const setCloneSource = usePhotoEditorStore((s) => s.setCloneSource);
  const eraseTolerance = usePhotoEditorStore((s) => s.eraseTolerance);
  const setEraseTolerance = usePhotoEditorStore((s) => s.setEraseTolerance);

  const activeDef = PINCEL_TOOLS.find((t) => t.id === tool);

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pincéis</h3>
      <ToolGrid tools={PINCEL_TOOLS} />
      {activeDef && (
        <p className="rounded-lg bg-surface-2/80 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
          <Eye className="mr-1 inline h-3 w-3 text-cyan-400" aria-hidden />
          {activeDef.hint}
        </p>
      )}

      <BrushSliders />

      {tool === "clone" && (
        <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
          <p className="text-[11px] text-zinc-400">
            {cloneSource
              ? `Origem definida em (${Math.round(cloneSource.x)}, ${Math.round(cloneSource.y)}). Pinte para clonar.`
              : "Clique na imagem para definir a origem do carimbo."}
          </p>
          {cloneSource && (
            <Button size="sm" variant="ghost" onClick={() => setCloneSource(null)}>
              Redefinir origem
            </Button>
          )}
        </div>
      )}

      {tool === "borracha" && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-3">
          <Slider label="Tolerância de cor" min={0} max={100} value={eraseTolerance} onChange={setEraseTolerance} />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            O primeiro toque de cada pincelada captura a cor de referência; só pixels parecidos são apagados (chroma → transparência). Exporte em PNG para manter o fundo transparente.
          </p>
        </div>
      )}
    </div>
  );
}
