"use client";

// App-level keyboard shortcuts reference ("?"). Reuses the Modal primitive.

import { Modal } from "@/components/ui/modal";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-200">
      {children}
    </kbd>
  );
}

const SHORTCUTS: { keys: React.ReactNode; label: string }[] = [
  { keys: <><Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> <Kbd>K</Kbd></>, label: "Abrir a paleta de comandos" },
  { keys: <><Kbd>g</Kbd> <Kbd>r</Kbd></>, label: "Ir para o Radar Viral" },
  { keys: <><Kbd>g</Kbd> <Kbd>e</Kbd></>, label: "Ir para o Estúdio IA" },
  { keys: <><Kbd>g</Kbd> <Kbd>p</Kbd></>, label: "Ir para os Projetos" },
  { keys: <><Kbd>g</Kbd> <Kbd>n</Kbd></>, label: "Novo projeto" },
  { keys: <Kbd>t</Kbd>, label: "Alternar o tema (claro/escuro/sistema)" },
  { keys: <Kbd>?</Kbd>, label: "Abrir esta ajuda de atalhos" },
];

export function ShortcutsHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Atalhos de teclado" description="Navegue pelo CortaAí sem tirar as mãos do teclado.">
      <ul className="space-y-2.5">
        {SHORTCUTS.map((s, i) => (
          <li key={i} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-1/60 px-3.5 py-2.5">
            <span className="text-sm text-zinc-300">{s.label}</span>
            <span className="flex shrink-0 items-center gap-1 text-zinc-400">{s.keys}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-zinc-500">
        Dentro do editor de vídeo há atalhos próprios (espaço, I/O, S, setas) — abra a ajuda do editor com <Kbd>?</Kbd> lá.
      </p>
    </Modal>
  );
}
