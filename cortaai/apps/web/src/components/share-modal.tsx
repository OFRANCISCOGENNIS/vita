"use client";

// "Compartilhar corte" modal. Preview card + copy-link (clipboard w/ fallback)
// + WhatsApp / Telegram / X share intents. Reuses the Modal primitive.

import { useEffect, useState } from "react";
import { Check, Clapperboard, Copy, Send } from "lucide-react";
import type { Cut } from "@/lib/types";
import { buildShareText, cutShareUrl } from "@/lib/share";
import { formatDuration } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  cut: Cut;
}

export function ShareModal({ open, onClose, cut }: ShareModalProps) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // URL depends on window.origin → resolve on the client when opened.
  useEffect(() => {
    if (open) {
      setUrl(cutShareUrl(cut.id));
      setCopied(false);
    }
  }, [open, cut.id]);

  const text = buildShareText(cut);

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for insecure contexts / older browsers.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast("Link copiado!", { description: "Cole onde quiser para compartilhar o clipe." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Não foi possível copiar", { description: "Copie o link manualmente.", variant: "error" });
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const targets = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      className: "bg-emerald-600/90 hover:bg-emerald-500 text-white",
    },
    {
      label: "Telegram",
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      className: "bg-sky-600/90 hover:bg-sky-500 text-white",
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
      className: "bg-zinc-800 hover:bg-zinc-700 text-white",
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Compartilhar clipe" description="Envie um link direto para o editor deste clipe.">
      <div className="space-y-4">
        {/* Preview card */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface-1">
          <div className="flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
              <Clapperboard className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{cut.title}</p>
              <p className="text-xs text-zinc-500">
                Clipe · {formatDuration(cut.endSeconds - cut.startSeconds)}
              </p>
            </div>
          </div>
          {cut.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line px-3.5 py-2.5">
              {cut.hashtags.map((h) => (
                <span key={h} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-violet-300">
                  {h}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Copy link */}
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            aria-label="Link do clipe"
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
          <Button variant="secondary" onClick={copyLink} aria-label="Copiar link">
            {copied ? <Check className="h-4 w-4 text-emerald-400" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copiado" : "Copiar link"}
          </Button>
        </div>

        {/* Quick share */}
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Send className="h-3.5 w-3.5" aria-hidden /> Compartilhar em
          </p>
          <div className="grid grid-cols-3 gap-2">
            {targets.map((t) => (
              <a
                key={t.label}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Compartilhar no ${t.label}`}
                className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${t.className}`}
              >
                {t.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
