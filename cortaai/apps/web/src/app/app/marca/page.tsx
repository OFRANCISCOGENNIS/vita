"use client";

// Branding kit: logo upload with preview, font pick, brand colors and the
// default caption preset applied to every new cut.

import { useRef, useState } from "react";
import { ImagePlus, Palette, Save, Trash2, Type } from "lucide-react";
import { CAPTION_PRESETS } from "@/lib/presets";
import type { CaptionPresetId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";

const FONTS = ["Inter", "Arial Black", "Georgia", "Impact", "Montserrat", "Poppins", "Verdana"];

export default function BrandingPage() {
  const { user, updateBrandingKit } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const [logo, setLogo] = useState<string | null>(user?.brandingKit.logoUrl ?? null);
  const [font, setFont] = useState(user?.brandingKit.font ?? "Inter");
  const [colors, setColors] = useState<string[]>(user?.brandingKit.colors ?? ["#8b5cf6", "#d946ef", "#0a0a0f"]);
  const [preset, setPreset] = useState<CaptionPresetId>(user?.brandingKit.captionPreset ?? "hormozi");
  const [saving, setSaving] = useState(false);

  function onLogoPick(file: File) {
    if (!file.type.startsWith("image/")) {
      toast("Arquivo inválido", { description: "Envie uma imagem PNG, JPG ou SVG.", variant: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  function setColor(index: number, value: string) {
    setColors((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  async function save() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400)); // simulate API round-trip
    updateBrandingKit({ logoUrl: logo, font, colors, captionPreset: preset });
    setSaving(false);
    toast("Kit de marca salvo!", { description: "Novos cortes usarão seu logo, fonte e cores automaticamente." });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Kit de marca</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Identidade aplicada automaticamente a todos os cortes exportados.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <ImagePlus className="mr-2 inline h-4 w-4 text-violet-400" aria-hidden />
              Logo / marca d&apos;água
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-surface-2">
                {logo ? (
                  <img src={logo} alt="Prévia do logo" className="h-full w-full object-contain p-2" />
                ) : (
                  <span className="px-2 text-center text-[10px] text-zinc-600">sem logo</span>
                )}
              </div>
              <div className="space-y-2">
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  Enviar imagem
                </Button>
                {logo && (
                  <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remover
                  </Button>
                )}
                <p className="text-[11px] text-zinc-600">PNG com fundo transparente fica melhor.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Enviar arquivo de logo"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onLogoPick(f);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Type className="mr-2 inline h-4 w-4 text-fuchsia-400" aria-hidden />
              Tipografia
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select label="Fonte padrão" value={font} onChange={(e) => setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Select>
            <p className="rounded-xl bg-surface-2 p-4 text-lg font-bold text-white" style={{ fontFamily: font }}>
              O seu corte com a sua cara.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Palette className="mr-2 inline h-4 w-4 text-emerald-400" aria-hidden />
              Cores da marca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              {colors.map((c, i) => (
                <div key={i} className="text-center">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => setColor(i, e.target.value)}
                    aria-label={`Cor ${i + 1} da marca`}
                    className="h-14 w-14 cursor-pointer rounded-xl border border-line bg-surface-2"
                  />
                  <p className="mt-1.5 font-mono text-[10px] text-zinc-500">{c}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preset de legenda padrão</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Preset de legenda padrão">
              {CAPTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  aria-pressed={preset === p.id}
                  className={cn(
                    "rounded-xl border p-2.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                    preset === p.id ? "border-violet-500/60 bg-violet-500/10" : "border-line bg-surface-2 hover:border-violet-500/40",
                  )}
                >
                  <span className={cn("block truncate text-xs", p.previewClass)}>{p.sample}</span>
                  <span className="mt-1 block text-[10px] text-zinc-500">{p.name}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" aria-hidden /> Salvar kit de marca
        </Button>
      </div>
    </div>
  );
}
