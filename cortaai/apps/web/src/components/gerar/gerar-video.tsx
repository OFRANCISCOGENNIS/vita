"use client";

// Gerar vídeo (IA) — integração com o Wan2.2 (self-host).
//
// HONESTO por construção: gerar vídeo por IA exige uma GPU de verdade (o
// Wan2.2 TI2V-5B pede ~24 GB de VRAM), então esta tela conversa com um
// servidor que o PRÓPRIO usuário roda (cortaai/server/wan22 no repositório).
// Sem servidor configurado, mostramos as instruções — nenhum botão fake.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clapperboard, Download, Film, ImagePlus, Loader2, Plug, Server, Wand2, X, XCircle } from "lucide-react";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkAiServer, generateAiVideo, getAiServerUrl, setAiServerUrl, type AiHealth } from "@/lib/ai-server";
import { saveMedia } from "@/lib/media-store";
import { newId } from "@/lib/video-editor/model";
import { openInStudio } from "@/lib/open-in-studio";

const SIZES = [
  { id: "1280*704", label: "Paisagem · 1280×704 (720P)" },
  { id: "704*1280", label: "Retrato · 704×1280 (720P)" },
] as const;

export function GerarVideo() {
  const router = useRouter();
  const [serverUrl, setServerUrl] = useState("");
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [checking, setChecking] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<string>(SIZES[0].id);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const [busyMsg, setBusyMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [opening, setOpening] = useState(false);

  const runCheck = useCallback(async (url: string) => {
    setChecking(true);
    const h = await checkAiServer(url);
    setChecking(false);
    setHealth(h);
    return h;
  }, []);

  // Carrega a URL salva e testa a conexão uma vez ao abrir.
  useEffect(() => {
    const saved = getAiServerUrl();
    if (saved) {
      setServerUrl(saved);
      void runCheck(saved);
    }
  }, [runCheck]);

  async function onTest() {
    setAiServerUrl(serverUrl);
    const h = await runCheck(serverUrl);
    if (!h.ok) {
      toast("Servidor não respondeu", {
        description: "Confira a URL, se o servidor está rodando e o ALLOWED_ORIGIN (CORS).",
        variant: "error",
      });
    }
  }

  function onPickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) toast("Escolha um arquivo de imagem", { variant: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function onGenerate() {
    if (busyMsg) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setResult((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setBusyMsg("Enviando o pedido ao servidor…");
    try {
      const blob = await generateAiVideo({
        serverUrl,
        prompt,
        imageDataUrl: imageDataUrl ?? undefined,
        size,
        signal: ctrl.signal,
        onStatus: setBusyMsg,
      });
      setResult({ url: URL.createObjectURL(blob), blob });
      toast("Vídeo gerado!", { description: "Abra no Estúdio PRO para editar ou baixe o MP4.", variant: "success", important: true });
    } catch (err) {
      if (!ctrl.signal.aborted) {
        toast("Falha ao gerar o vídeo", { description: err instanceof Error ? err.message : String(err), variant: "error" });
      }
    } finally {
      setBusyMsg(null);
      abortRef.current = null;
    }
  }

  async function onOpenInStudio() {
    if (!result || opening) return;
    setOpening(true);
    try {
      const mediaId = newId("media");
      const saved = await saveMedia(mediaId, result.blob);
      if (!saved) throw new Error("O navegador negou o armazenamento local do vídeo.");
      const res = await openInStudio({ mediaId, name: prompt.slice(0, 48) || "Vídeo gerado por IA" });
      if (!res.ok) throw new Error(res.reason);
      router.push("/app/estudio");
    } catch (err) {
      toast("Não foi possível abrir no Estúdio", { description: err instanceof Error ? err.message : String(err), variant: "error" });
      setOpening(false);
    }
  }

  function onDownload() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.url;
    a.download = "cortaai-wan22.mp4";
    a.click();
  }

  const connected = health?.ok === true && health.aiEnabled === true;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">
          <Wand2 className="mr-2 inline h-6 w-6 text-fuchsia-400" aria-hidden />
          Gerar vídeo (IA)
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Texto → vídeo e imagem → vídeo com o <span className="text-zinc-300">Wan2.2</span> (modelo aberto da Alibaba),
          rodando no <span className="text-zinc-300">seu próprio servidor com GPU</span> — o resultado abre direto no Estúdio PRO.
        </p>
      </div>

      {/* Conexão com o servidor */}
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-surface-1/60 p-4 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Server className="h-3.5 w-3.5" aria-hidden /> Servidor de IA (self-host)
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:8787"
            aria-label="URL do servidor de IA"
            className="min-w-0 flex-1"
          />
          <Button variant="secondary" onClick={() => void onTest()} disabled={checking || !serverUrl.trim()}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plug className="h-4 w-4" aria-hidden />}
            Testar conexão
          </Button>
        </div>
        {health && (
          <p className={cn("flex items-center gap-1.5 text-xs", connected ? "text-emerald-400" : "text-rose-400")} role="status">
            {connected ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}
            {connected
              ? `Conectado — ${health.model ?? health.service ?? "servidor de IA"} pronto.`
              : health.ok
                ? `Servidor no ar, mas o Wan2.2 não está pronto: ${health.detail ?? "instale o modelo (veja o guia abaixo)."}`
                : "Sem conexão com esse endereço."}
          </p>
        )}
        {!connected && (
          <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-relaxed text-zinc-400">
            <p className="font-semibold text-zinc-300">Por que preciso de um servidor?</p>
            <p>
              Gerar vídeo por IA não cabe no navegador: o Wan2.2 TI2V-5B precisa de uma GPU com ~24&nbsp;GB de VRAM
              (ex.: RTX&nbsp;4090) e leva alguns minutos por vídeo de ~5&nbsp;s. O CortaAí não hospeda GPU — você roda o
              servidor incluído no repositório e cola a URL aqui. Passo a passo:
            </p>
            <ol className="list-decimal space-y-1 pl-4">
              <li><code className="text-zinc-300">git clone https://github.com/Wan-Video/Wan2.2.git</code> e instale as dependências.</li>
              <li>Baixe os pesos: <code className="text-zinc-300">huggingface-cli download Wan-AI/Wan2.2-TI2V-5B --local-dir ./Wan2.2-TI2V-5B</code></li>
              <li>Rode o wrapper do CortaAí: <code className="text-zinc-300">python cortaai/server/wan22/server.py</code></li>
              <li>Cole a URL (ex.: <code className="text-zinc-300">http://localhost:8787</code>) acima e teste.</li>
            </ol>
            <p>Guia completo: <code className="text-zinc-300">cortaai/server/wan22/README.md</code> no repositório.</p>
          </div>
        )}
      </section>

      {/* Formulário de geração */}
      <section className={cn("space-y-3 rounded-2xl border border-white/[0.08] bg-surface-1/60 p-4 backdrop-blur-xl", !connected && "pointer-events-none opacity-50")}>
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Film className="h-3.5 w-3.5" aria-hidden /> O que você quer ver?
        </h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Ex.: um gato de óculos escuros andando de skate numa rua de neon, câmera acompanhando, estilo cinematográfico"
          aria-label="Descrição do vídeo a gerar"
          className="w-full rounded-xl border border-line bg-surface-1 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            aria-label="Formato do vídeo"
            className="h-9 rounded-xl border border-line bg-surface-1 px-2 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {SIZES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          {imageDataUrl ? (
            <span className="flex items-center gap-2 rounded-xl border border-line bg-surface-1 px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="Imagem de partida" className="h-7 w-7 rounded object-cover" />
              <span className="text-xs text-zinc-400">imagem → vídeo</span>
              <button onClick={() => setImageDataUrl(null)} aria-label="Remover imagem de partida" className="rounded p-1 text-zinc-400 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => imgRef.current?.click()}>
              <ImagePlus className="h-4 w-4" aria-hidden /> Partir de uma imagem
            </Button>
          )}
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Imagem de partida para o vídeo"
            onChange={(e) => {
              onPickImage(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {busyMsg ? (
          <div className="flex items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-violet-300" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {busyMsg}
            </p>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>Cancelar</Button>
          </div>
        ) : (
          <Button onClick={() => void onGenerate()} disabled={!connected || !prompt.trim()}>
            <Wand2 className="h-4 w-4" aria-hidden /> Gerar vídeo (~5 s, leva minutos na GPU)
          </Button>
        )}
      </section>

      {/* Resultado */}
      {result && (
        <section className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Vídeo gerado</h2>
          <video src={result.url} controls playsInline className="max-h-[420px] w-full rounded-xl bg-black" aria-label="Vídeo gerado pela IA" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void onOpenInStudio()} disabled={opening}>
              {opening ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Clapperboard className="h-4 w-4" aria-hidden />}
              Abrir no Estúdio PRO
            </Button>
            <Button variant="secondary" onClick={onDownload}>
              <Download className="h-4 w-4" aria-hidden /> Baixar MP4
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
