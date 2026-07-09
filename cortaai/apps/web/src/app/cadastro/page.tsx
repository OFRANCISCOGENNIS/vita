"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, AuthDivider, GoogleButton } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";

export default function RegisterPage() {
  const router = useRouter();
  const { register, loginGoogle } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Digite seu nome completo.";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Informe um e-mail válido.";
    if (password.length < 8) next.password = "Use pelo menos 8 caracteres.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      await register(name.trim(), email, password);
      toast("Conta criada!", { description: "Tudo liberado, sem limites. Bora criar seus cortes!" });
      router.push("/app");
    } catch {
      toast("Não foi possível criar a conta", {
        description: "Tente novamente em instantes.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await loginGoogle();
      toast("Conta Google conectada");
      router.push("/app");
    } catch {
      toast("Falha no cadastro com Google", { variant: "error" });
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <AuthCard title="Criar conta grátis" subtitle="Tudo liberado, sem limites e sem cartão de crédito.">
      <GoogleButton onClick={handleGoogle} loading={googleLoading} />
      <AuthDivider />
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Input
          label="Nome"
          autoComplete="name"
          placeholder="Como devemos te chamar?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder="Mínimo de 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="Use letras, números e um símbolo para uma senha forte."
        />
        <Button type="submit" className="w-full" loading={loading}>
          Criar conta e começar
        </Button>
      </form>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-600">
        Ao criar a conta você concorda com os Termos de Uso e a Política de Privacidade do CortaAí.
      </p>
      <p className="mt-4 text-center text-sm text-zinc-500">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-violet-400 hover:text-violet-300">
          Entrar
        </Link>
      </p>
    </AuthCard>
  );
}
