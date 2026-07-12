"use client";

// Editor de Fotos — the canvas editor is lazy-loaded client-only (ssr:false),
// same pattern as the Estúdio de Capa, so it stays export-safe and out of the
// shared bundle.

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const FotoEditor = dynamic(() => import("@/components/fotos/foto-editor").then((m) => m.FotoEditor), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)_330px]">
        <Skeleton className="h-[480px] w-full" />
        <Skeleton className="h-[480px] w-full" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    </div>
  ),
});

export default function FotosPage() {
  return <FotoEditor />;
}
