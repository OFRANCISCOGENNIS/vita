"use client";

// "Assistente de cortes" — multi-step questionnaire shown before generating
// cuts. Answers steer the smart generation (segments, titles, hashtags, CTA)
// and are persisted per project so re-generating reuses them.

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import {
  DEFAULT_ANSWERS,
  WIZARD_STEPS,
  type WizardAnswers,
} from "@/lib/cut-wizard";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

interface CutWizardModalProps {
  open: boolean;
  onClose: () => void;
  /** Previously saved answers (pre-fills the steps) or null for first run. */
  initial: WizardAnswers | null;
  /** Called with the final answers when the user hits "Gerar cortes". */
  onSubmit: (answers: WizardAnswers) => void;
}

export function CutWizardModal({ open, onClose, initial, onSubmit }: CutWizardModalProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(initial ?? DEFAULT_ANSWERS);

  // Reset position (and re-seed answers) every time the wizard opens.
  useEffect(() => {
    if (open) {
      setStep(0);
      setAnswers(initial ?? DEFAULT_ANSWERS);
    }
  }, [open, initial]);

  const current = WIZARD_STEPS[step];
  const isLast = step === WIZARD_STEPS.length - 1;
  const selected = answers[current.key];
  const pedidoLen = answers.pedido.trim().length;

  function choose(optionId: string) {
    setAnswers((a) => ({ ...a, [current.key]: optionId }) as WizardAnswers);
    // Auto-advance keeps the flow quick; the last step waits for the CTA.
    if (!isLast) setTimeout(() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1)), 140);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assistente de cortes"
      description={`Pergunta ${step + 1} de ${WIZARD_STEPS.length} — suas respostas guiam a análise e os títulos.`}
      className="max-w-xl"
    >
      {/* Step dots */}
      <div className="mb-5 flex items-center gap-1.5" aria-hidden>
        {WIZARD_STEPS.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < step ? "bg-violet-500" : i === step ? "bg-gradient-to-r from-violet-500 to-fuchsia-500" : "bg-surface-3",
            )}
          />
        ))}
      </div>

      <h3 className="text-base font-semibold text-white">{current.title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{current.subtitle}</p>

      {/* Free-text step: describe in your own words what you want in the cuts */}
      {current.input && (
        <div className="mt-4">
          <textarea
            rows={4}
            value={answers.pedido}
            onChange={(e) => setAnswers((a) => ({ ...a, pedido: e.target.value }))}
            maxLength={400}
            aria-label={current.title}
            placeholder={
              "Ex.: foca nos momentos em que falamos de preço; corta a introdução; quero os momentos engraçados com o convidado…"
            }
            className="w-full resize-none rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          />
          <p className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-600">
            <span>Pode deixar em branco — os cortes seguem só o briefing acima.</span>
            <span>{pedidoLen}/400</span>
          </p>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label={current.title}
        className={cn(
          "mt-4 grid gap-2",
          current.input && "hidden",
          current.options.length > 4 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
        )}
      >
        {current.options.map((opt) => {
          const active = selected === opt.id;
          return (
            <button
              key={opt.id}
              role="radio"
              aria-checked={active}
              onClick={() => choose(opt.id)}
              className={cn(
                "flex items-start justify-between gap-2 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                active
                  ? "border-violet-500/70 bg-violet-500/10"
                  : "border-line bg-surface-1 hover:border-violet-500/40",
              )}
            >
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", active ? "text-white" : "text-zinc-200")}>
                  {opt.label}
                </span>
                {opt.hint && <span className="mt-0.5 block text-[11px] text-zinc-500">{opt.hint}</span>}
              </span>
              {active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
        </Button>
        {isLast ? (
          <Button size="sm" onClick={() => onSubmit(answers)}>
            <Sparkles className="h-4 w-4" aria-hidden /> Gerar cortes
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
          >
            Avançar <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </Modal>
  );
}
