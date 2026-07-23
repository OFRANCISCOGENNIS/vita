"use client";

// Chroma key (fundo verde): pick a key color + tolerance/softness. The preview
// approximates the keyed result over a synthetic green-screen plate, with a
// before/after toggle.

import { useEditorStore } from "@/store/editor";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const KEY_SWATCHES = ["#00d000", "#00b140", "#009fe3", "#0047ab"];

export function ChromaPanel() {
  const { doc, setChroma } = useEditorStore();
  const c = doc.chroma;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-4">
        <Switch
          checked={c.enabled}
          onChange={(v) => setChroma({ enabled: v })}
          label="Ativar chroma key"
          description="Remove o fundo da cor-chave e revela um novo cenário"
        />
        {c.enabled && (
          <Switch
            checked={c.showBefore}
            onChange={(v) => setChroma({ showBefore: v })}
            label="Mostrar antes (fundo original)"
            description="Alterna entre o fundo verde e o resultado com chave"
          />
        )}
      </section>

      {c.enabled && (
        <>
          <section className="space-y-2">
            <label htmlFor="chroma-color" className="block text-sm font-medium text-zinc-300">Cor-chave</label>
            <div className="flex items-center gap-2">
              <input
                id="chroma-color"
                type="color"
                value={c.keyColor}
                onChange={(e) => setChroma({ keyColor: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
                aria-label="Cor-chave do chroma"
              />
              <span className="font-mono text-xs text-zinc-500">{c.keyColor}</span>
              <div className="ml-auto flex gap-1.5" role="group" aria-label="Cores-chave comuns">
                {KEY_SWATCHES.map((sw) => (
                  <button
                    key={sw}
                    onClick={() => setChroma({ keyColor: sw })}
                    aria-label={`Usar cor ${sw}`}
                    aria-pressed={c.keyColor.toLowerCase() === sw}
                    className={cn(
                      "h-7 w-7 rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                      c.keyColor.toLowerCase() === sw ? "border-white" : "border-transparent",
                    )}
                    style={{ backgroundColor: sw }}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <Slider label="Tolerância" min={0} max={100} value={c.tolerance} onChange={(v) => setChroma({ tolerance: v })} />
            <Slider label="Suavidade da borda" min={0} max={100} value={c.softness} onChange={(v) => setChroma({ softness: v })} />
          </section>

          <p className="text-xs leading-relaxed text-zinc-500">
            Sem vídeo real para decodificar, o preview usa uma cena sintética com fundo
            na cor-chave para demonstrar a chave de cor. Os parâmetros são salvos no
            estado de edição e aplicados na renderização.
          </p>
        </>
      )}
    </div>
  );
}
