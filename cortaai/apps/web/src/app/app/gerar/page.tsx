"use client";

// Gerar vídeo (IA) — client-only (ssr:false), mesmo padrão do Editor de Fotos.

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const GerarVideo = dynamic(() => import("@/components/gerar/gerar-video").then((m) => m.GerarVideo), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-3xl space-y-4">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  ),
});

export default function GerarPage() {
  return <GerarVideo />;
}
