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
  <div className="space-y-4 p-6" role="status" aria-label="Carregando editor">
    <Skeleton className="h-12 w-full" />
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Skeleton className="h-[420px] w-full" />
      <Skeleton className="h-[420px] w-full" />
    </div>
    <Skeleton className="h-48 w-full" />
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
