"use client";

// Export-safe editor entry for USER-created cuts. Static export can't
// pre-render unknown cut ids under /app/editor/[cutId] (dynamicParams=false),
// so user content opens here via ?cut=<id> — a single statically-generated page
// that reads the id on the client. The [cutId] route stays for the demo seed.

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const EditorLoading = () => (
  <div className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3" role="status" aria-label="Carregando editor">
    <Skeleton className="h-12 w-full shrink-0" />
    <div className="flex min-h-0 flex-1 gap-3">
      <Skeleton className="h-full min-w-0 flex-1" />
      <Skeleton className="hidden h-full w-[340px] shrink-0 lg:block" />
    </div>
    <Skeleton className="h-44 w-full shrink-0" />
  </div>
);

const Editor = dynamic(() => import("@/components/editor/editor"), {
  ssr: false,
  loading: EditorLoading,
});

function EditorFromQuery() {
  const params = useSearchParams();
  const cutId = params.get("cut") ?? "";
  return <Editor cutId={cutId} />;
}

export default function EditorQueryPage() {
  return (
    <Suspense fallback={<EditorLoading />}>
      <EditorFromQuery />
    </Suspense>
  );
}
