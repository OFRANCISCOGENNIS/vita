"use client";

// Settings: profile, password change and account deletion.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, Save, UserRound } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

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
        <p className="mt-1 text-sm text-zinc-500">Perfil e segurança da conta.</p>
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
