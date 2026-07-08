"use client";

// Editor route — the heavy editor bundle is lazy-loaded (next/dynamic).

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const Editor = dynamic(() => import("@/components/editor/editor"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 p-6" role="status" aria-label="Carregando editor">
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-[420px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  ),
});

export default function EditorPage() {
  const params = useParams<{ cutId: string }>();
  return <Editor cutId={params.cutId} />;
}
