"use client";

// Pricing section shared by the landing page and /precos.
// "Assinar" calls the billing checkout endpoint (INTEGRAÇÃO PAGA: Stripe).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { PLANS } from "@/lib/presets";
import type { PlanId, PlanInterval } from "@/lib/types";
import { formatBRL, cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "./ui/button";

export function PricingSection({ compact = false }: { compact?: boolean }) {
  const [interval, setInterval] = useState<PlanInterval>("month");
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  async function subscribe(plan: PlanId) {
    if (plan === "free") {
      router.push(user ? "/app" : "/cadastro");
      return;
    }
    setLoadingPlan(plan);
    try {
      // INTEGRAÇÃO PAGA: Stripe — em produção redirecionamos para checkoutUrl.
      const { checkoutUrl } = await api.billingCheckout(plan, interval);
      toast("Checkout iniciado", {
        description: `Redirecionando para o pagamento seguro (Stripe): ${checkoutUrl}`,
        variant: "info",
      });
    } catch {
      toast("Não foi possível iniciar o checkout", {
        description: "Tente novamente em instantes.",
        variant: "error",
      });
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div>
      <div className="mb-10 flex items-center justify-center gap-3" role="group" aria-label="Alternar cobrança mensal ou anual">
        <button
          onClick={() => setInterval("month")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            interval === "month" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          Mensal
        </button>
        <button
          onClick={() => setInterval("year")}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
            interval === "year" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          Anual
          <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            até -20%
          </span>
        </button>
      </div>

      <div className={cn("grid gap-6", compact ? "md:grid-cols-3" : "lg:grid-cols-3")}>
        {PLANS.map((plan) => {
          const price = interval === "year" ? plan.priceYearlyPerMonth : plan.priceMonthly;
          const isCurrent = user?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border p-7",
                plan.highlight
                  ? "border-violet-500/50 bg-gradient-to-b from-violet-950/40 to-surface-1 shadow-glow"
                  : "border-line bg-surface-1",
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  <Sparkles className="mr-1 inline h-3 w-3" aria-hidden /> Mais popular
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{plan.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight text-white">
                  {price === 0 ? "R$ 0" : formatBRL(price)}
                </span>
                <span className="text-sm text-zinc-500">/mês</span>
              </div>
              {interval === "year" && plan.priceMonthly > 0 && (
                <p className="mt-1 text-xs text-emerald-400">
                  Economize {formatBRL((plan.priceMonthly - plan.priceYearlyPerMonth) * 12)} por ano
                </p>
              )}
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-7 w-full"
                variant={plan.highlight ? "primary" : "secondary"}
                loading={loadingPlan === plan.id}
                disabled={isCurrent}
                onClick={() => subscribe(plan.id)}
                aria-label={`Assinar plano ${plan.name}`}
              >
                {isCurrent ? "Plano atual" : plan.id === "free" ? "Começar grátis" : "Assinar"}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-zinc-600">
        Pagamento processado com segurança pela Stripe. Cancele quando quiser, sem multa.
      </p>
    </div>
  );
}
