"use client";

// Source selector used by Extensão / Lip Sync / Movimentos de câmera: pick an
// existing rendered generation (from the studio queue) OR an existing cut
// (via the shared PickerModal). Emits a normalized source object.

import { useState } from "react";
import { Check, Film, Scissors } from "lucide-react";
import { PickerModal } from "@/components/picker-modal";
import { Select } from "@/components/ui/input";
import { useStudioStore, STUDIO_FUNCTION_LABELS } from "@/store/studio";
import { cn } from "@/lib/utils";

export interface StudioSource {
  cutId?: string;
  generationId?: string;
  inputAssetUrl?: string;
  label: string;
}

interface SourcePickerProps {
  value: StudioSource | null;
  onChange: (source: StudioSource | null) => void;
  label?: string;
}

export function SourcePicker({ value, onChange, label = "Fonte" }: SourcePickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const items = useStudioStore((s) => s.items);
  const doneGenerations = items.filter((i) => i.status === "done");

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Select
          aria-label="Escolher uma geração concluída como fonte"
          value={value?.generationId ?? ""}
          onChange={(e) => {
            const gen = doneGenerations.find((g) => g.id === e.target.value);
            if (!gen) return onChange(null);
            onChange({
              generationId: gen.id,
              inputAssetUrl: gen.thumbnailUrl ?? undefined,
              label: `${STUDIO_FUNCTION_LABELS[gen.function]} · geração recente`,
            });
          }}
        >
          <option value="">Selecione uma geração concluída…</option>
          {doneGenerations.map((g) => (
            <option key={g.id} value={g.id}>
              {STUDIO_FUNCTION_LABELS[g.function]} · {g.durationSeconds}s
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-sm text-zinc-200 hover:border-violet-500/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <Scissors className="h-4 w-4" aria-hidden /> Escolher um corte
        </button>
      </div>

      {value && (
        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-100",
          )}
        >
          {value.cutId ? <Scissors className="h-3.5 w-3.5" aria-hidden /> : <Film className="h-3.5 w-3.5" aria-hidden />}
          <span className="flex-1 truncate">Fonte: {value.label}</span>
          <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
        </div>
      )}

      <PickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Escolher um corte"
        description="Selecione um corte existente como base da geração."
        mode="cut"
        onPick={(target) => {
          onChange({ cutId: target.cutId, label: target.label });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
