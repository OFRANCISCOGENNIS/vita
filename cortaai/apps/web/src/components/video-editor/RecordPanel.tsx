"use client";

// GRAVAÇÃO no Estúdio — tela (getDisplayMedia), webcam e voz (getUserMedia),
// tudo via MediaRecorder do próprio navegador. O resultado entra na biblioteca
// de mídia e na timeline como qualquer outro arquivo. Sem servidor.

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MonitorUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { registerFile } from "@/lib/video-editor/media-registry";
import { useVideoEditor } from "@/store/video-editor";
import { toast } from "@/store/toast";

type RecordKind = "screen" | "camera" | "voice";

const LABEL: Record<RecordKind, string> = {
  screen: "Gravação de tela",
  camera: "Gravação da câmera",
  voice: "Narração de voz",
};

export function RecordPanel() {
  const addClipFromSource = useVideoEditor((s) => s.addClipFromSource);
  const [recording, setRecording] = useState<RecordKind | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Math.round((performance.now() - startedAtRef.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording]);

  // para tudo ao desmontar
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start(kind: RecordKind) {
    if (recording) return;
    let stream: MediaStream;
    try {
      if (kind === "screen") {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } else if (kind === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {
      toast("Permissão negada ou recurso indisponível", {
        description: kind === "screen" ? "A captura de tela precisa de permissão (e não funciona em iPhone)." : "Verifique as permissões de câmera/microfone.",
        variant: "error",
      });
      return;
    }

    const isAudioOnly = kind === "voice";
    const mime = isAudioOnly
      ? MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      toast("Este navegador não suporta gravação (MediaRecorder)", { variant: "error" });
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(null);
      const durationMs = Math.max(200, Math.round(performance.now() - startedAtRef.current));
      const blob = new Blob(chunks, { type: isAudioOnly ? "audio/webm" : "video/webm" });
      if (blob.size < 1000) {
        toast("Gravação vazia", { variant: "error" });
        return;
      }
      const file = new File([blob], `${LABEL[kind]}.webm`, { type: blob.type });
      const source = await registerFile(file);
      if (!source) {
        toast("Falha ao registrar a gravação", { variant: "error" });
        return;
      }
      // gravações do MediaRecorder às vezes não trazem duração no cabeçalho
      if (!source.durationMs || !Number.isFinite(source.durationMs)) source.durationMs = durationMs;
      addClipFromSource(source);
      toast("Gravação adicionada à timeline", { description: LABEL[kind] });
    };

    // parar quando o usuário encerra o compartilhamento pelo navegador
    stream.getVideoTracks().forEach((t) => (t.onended = () => recorder.state !== "inactive" && recorder.stop()));

    recorderRef.current = recorder;
    streamRef.current = stream;
    startedAtRef.current = performance.now();
    setElapsed(0);
    setRecording(kind);
    recorder.start(1000);
  }

  function stop() {
    recorderRef.current?.stop();
  }

  if (recording) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-rose-200">
          {LABEL[recording]} — {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        <button
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <Square className="h-3 w-3" aria-hidden /> Parar
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <RecordButton icon={MonitorUp} label="Tela" onClick={() => start("screen")} />
      <RecordButton icon={Camera} label="Câmera" onClick={() => start("camera")} />
      <RecordButton icon={Mic} label="Voz" onClick={() => start("voice")} />
    </div>
  );
}

function RecordButton({ icon: Icon, label, onClick }: { icon: typeof Mic; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-line bg-surface-1 px-2 py-2.5 text-[11px] font-medium text-zinc-300",
        "transition-colors hover:border-violet-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
