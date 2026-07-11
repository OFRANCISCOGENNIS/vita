"use client";

// Editor route — the heavy editor bundle is lazy-loaded (next/dynamic).

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const Editor = dynamic(() => import("@/components/editor/editor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3" role="status" aria-label="Carregando editor">
      <Skeleton className="h-12 w-full shrink-0" />
      <div className="flex min-h-0 flex-1 gap-3">
        <Skeleton className="h-full min-w-0 flex-1" />
        <Skeleton className="hidden h-full w-[340px] shrink-0 lg:block" />
      </div>
      <Skeleton className="h-44 w-full shrink-0" />
    </div>
  ),
});

export default function EditorPage() {
  const params = useParams<{ cutId: string }>();
  return <Editor cutId={params.cutId} />;
}
