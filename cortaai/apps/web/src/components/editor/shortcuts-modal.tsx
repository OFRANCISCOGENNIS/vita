"use client";

import { Modal } from "@/components/ui/modal";

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ["Espaço"], action: "Reproduzir / pausar" },
  { keys: ["I"], action: "Marcar ponto de entrada (in)" },
  { keys: ["O"], action: "Marcar ponto de saída (out)" },
  { keys: ["S"], action: "Dividir clipe no playhead" },
  { keys: ["Ctrl", "Z"], action: "Desfazer" },
  { keys: ["Ctrl", "Y"], action: "Refazer" },
  { keys: ["Ctrl", "Shift", "Z"], action: "Refazer (alternativo)" },
  { keys: ["←", "→"], action: "Mover playhead 0,1s" },
  { keys: ["Shift", "←/→"], action: "Mover playhead 1s" },
  { keys: ["?"], action: "Abrir esta janela de atalhos" },
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" description="Edite sem tirar as mãos do teclado.">
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.action} className="flex items-center justify-between gap-4 py-2.5">
            <span className="text-sm text-zinc-300">{s.action}</span>
            <span className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded-md border border-line bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-zinc-200"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
