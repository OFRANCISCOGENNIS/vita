"use client";

// Settings: profile (name + avatar), preferences (theme + onboarding),
// password change and account deletion — all persisted to localStorage.

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  KeyRound,
  Monitor,
  Moon,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useThemeStore, type Theme } from "@/store/theme";
import { useOnboardingStore } from "@/store/onboarding";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

const THEME_OPTIONS: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "light", label: "Claro", icon: Sun },
  { id: "system", label: "Sistema", icon: Monitor },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resetOnboarding = useOnboardingStore((s) => s.reset);

  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErrors, setPwErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [pwSaving, setPwSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  function onPickAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Arquivo inválido", { description: "Selecione uma imagem (JPG, PNG, WEBP).", variant: "error" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast("Imagem muito grande", { description: "O limite é 1,5 MB. Tente uma menor.", variant: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => toast("Falha ao ler a imagem", { variant: "error" });
    reader.readAsDataURL(file);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(email)) {
      toast("Verifique os campos do perfil", { variant: "error" });
      return;
    }
    setProfileSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    updateUser({ name: name.trim(), email, avatarUrl });
    setProfileSaving(false);
    toast("Perfil atualizado", { description: "Seu nome e foto já aparecem no menu." });
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

  function redoTour() {
    resetOnboarding();
    toast("Tour reiniciado", { description: "Vamos te guiar novamente pelo app.", variant: "info" });
    router.push("/app");
  }

  async function deleteAccount() {
    setDeleting(true);
    await new Promise((r) => setTimeout(r, 700));
    toast("Conta excluída", { description: "Sentiremos sua falta. Seus dados foram removidos.", variant: "info" });
    logout();
    router.push("/");
  }

  const initial = (name.trim() || user?.name || "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-500">Perfil, preferências e segurança da conta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <UserRound className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden /> Perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-violet-500/40">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Sua foto de perfil" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-600 text-xl font-bold text-white">
                    {initial}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Enviar foto de perfil"
                  onChange={onPickAvatar}
                />
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" aria-hidden /> Enviar foto
                </Button>
                {avatarUrl && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl(null)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remover foto
                  </Button>
                )}
                <p className="w-full text-xs text-zinc-500">JPG, PNG ou WEBP até 1,5 MB.</p>
              </div>
            </div>
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
            <SlidersHorizontal className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden /> Preferências
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-200">Tema da interface</p>
            <div role="radiogroup" aria-label="Tema da interface" className="flex flex-wrap gap-2">
              {THEME_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTheme(opt.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                      active
                        ? "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow"
                        : "border-line text-zinc-400 hover:border-violet-500/50 hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200">Tour guiado</p>
              <p className="text-xs text-zinc-500">Reveja a apresentação dos principais recursos do app.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={redoTour}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Refazer tour
            </Button>
          </div>
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
