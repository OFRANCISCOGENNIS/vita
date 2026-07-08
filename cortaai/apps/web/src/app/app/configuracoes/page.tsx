"use client";

// Settings: profile, plan usage, password change and account deletion.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CreditCard, KeyRound, Save, UserRound } from "lucide-react";
import { PLANS } from "@/lib/presets";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pwSaving, setPwSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const plan = PLANS.find((p) => p.id === (user?.plan ?? "free")) ?? PLANS[0];
  const used = user?.minutesUsedMonth ?? 0;
  const quotaPct = plan.minutesPerMonth ? Math.min(100, (used / plan.minutesPerMonth) * 100) : 0;

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      toast("Verifique os campos do perfil", { variant: "error" });
      return;
    }
    setProfileSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    updateUser({ name: name.trim(), email });
    setProfileSaving(false);
    toast("Perfil atualizado");
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    const errs: typeof pwErrors = {};
    if (currentPw.length < 6) errs.current = "Informe a senha atual.";
    if (newPw.length < 8) errs.next = "A nova senha precisa de 8+ caracteres.";
    if (newPw !== confirmPw) errs.confirm = "As senhas não coincidem.";
    setPwErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setPwSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setPwSaving(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    toast("Senha alterada com sucesso");
  }

  async function deleteAccount() {
    setDeleting(true);
    await new Promise((r) => setTimeout(r, 700));
    toast("Conta excluída", { description: "Sentiremos sua falta. Seus dados foram removidos.", variant: "info" });
    logout();
    router.push("/");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-500">Perfil, plano e segurança da conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <UserRound className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden /> Perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4">
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <div className="flex justify-end">
              <Button type="submit" loading={profileSaving}>
                <Save className="h-4 w-4" aria-hidden /> Salvar perfil
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <CreditCard className="mr-2 inline h-4 w-4 text-emerald-400" aria-hidden /> Plano e uso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-white">
                Plano {plan.name}{" "}
                {plan.id !== "free" && <Badge variant="success">ativo</Badge>}
              </p>
              <p className="text-xs text-zinc-500">
                {plan.minutesPerMonth ? `${plan.minutesPerMonth} minutos/mês` : "minutos ilimitados"} · exporta até{" "}
                {plan.maxResolution === "2160p" ? "4K" : plan.maxResolution} ·{" "}
                {plan.watermark ? "com marca d'água" : "sem marca d'água"}
              </p>
            </div>
            <Link
              href="/precos"
              className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-zinc-200 hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              Mudar de plano
            </Link>
          </div>
          {plan.minutesPerMonth && (
            <div>
              <Progress value={quotaPct} label="Uso da cota mensal" />
              <p className="mt-1.5 text-xs text-zinc-500">
                {used} de {plan.minutesPerMonth} minutos usados neste ciclo ({Math.round(quotaPct)}%)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <KeyRound className="mr-2 inline h-4 w-4 text-amber-400" aria-hidden /> Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4">
            <Input
              label="Senha atual"
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              error={pwErrors.current}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                error={pwErrors.next}
              />
              <Input
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                error={pwErrors.confirm}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={pwSaving}>Alterar senha</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-rose-500/30">
        <CardHeader>
          <CardTitle className="text-rose-300">
            <AlertTriangle className="mr-2 inline h-4 w-4" aria-hidden /> Zona de perigo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">
            Excluir a conta remove todos os projetos, cortes e exportações. Ação irreversível.
          </p>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>Excluir conta</Button>
        </CardContent>
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Excluir conta definitivamente?"
        description="Todos os seus dados serão apagados. Digite EXCLUIR para confirmar."
      >
        <div className="space-y-4">
          <Input
            label='Digite "EXCLUIR" para confirmar'
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="EXCLUIR"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={deleteConfirmText !== "EXCLUIR"}
              loading={deleting}
              onClick={deleteAccount}
            >
              Excluir minha conta
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
