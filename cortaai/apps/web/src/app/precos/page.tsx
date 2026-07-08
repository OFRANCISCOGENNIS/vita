import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { PricingSection } from "@/components/pricing-section";

export const metadata: Metadata = {
  title: "Preços",
  description:
    "Planos do CortaAí: Free com 60 minutos por mês, Pro com 4K e Radar completo, Studio ilimitado com alertas e API.",
  alternates: { canonical: "/precos" },
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg px-2 py-1"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para a página inicial
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Preços simples,{" "}
            <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              retorno rápido
            </span>
          </h1>
          <p className="mt-4 text-zinc-400">
            Um único corte viral paga meses de assinatura. Escolha o plano do tamanho do seu canal.
          </p>
        </div>
        <PricingSection />
        <div className="mt-16 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
          Garantia de 7 dias: não gostou, devolvemos 100% do valor.
        </div>
      </main>
    </div>
  );
}
