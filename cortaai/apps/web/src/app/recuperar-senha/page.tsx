"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import * as api from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/store/toast";

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await api.passwordReset(email);
      setSent(true);
    } catch {
      toast("Não foi possível enviar o e-mail", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Enviaremos um link de redefinição para o seu e-mail."
    >
      {sent ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <MailCheck className="mx-auto h-8 w-8 text-emerald-400" aria-hidden />
          <p className="mt-3 text-sm font-medium text-emerald-200">
            Se existir uma conta para <strong>{email}</strong>, o link de redefinição chega em instantes.
          </p>
          <p className="mt-1 text-xs text-zinc-500">Confira também a caixa de spam.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="E-mail da conta"
            type="email"
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" className="w-full" loading={loading}>
            Enviar link de redefinição
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-zinc-500">
        Lembrou a senha?{" "}
        <Link href="/entrar" className="font-medium text-violet-400 hover:text-violet-300">
          Voltar para o login
        </Link>
      </p>
    </AuthCard>
  );
}
