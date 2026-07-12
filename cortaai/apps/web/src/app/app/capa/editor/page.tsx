"use client";

// Export-safe cover studio entry for USER-created cuts. Static export can't
// pre-render unknown cut ids under /app/capa/[cutId] (dynamicParams=false), so
// user content opens here via ?cut=<id> — a single statically-generated page
// that reads the id on the client. The [cutId] route stays for the demo seed.

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const CapaLoading = () => (
  <div className="mx-auto max-w-6xl space-y-4 px-4 py-6" role="status" aria-label="Carregando estúdio de capa">
    <Skeleton className="h-10 w-64" />
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Skeleton className="h-[440px] w-full" />
      <Skeleton className="h-[440px] w-full" />
    </div>
  </div>
);

const CapaStudio = dynamic(() => import("@/components/capa/capa-studio").then((m) => m.CapaStudio), {
  ssr: false,
  loading: CapaLoading,
});

function CapaFromQuery() {
  const params = useSearchParams();
  const cutId = params.get("cut") ?? "";
  return <CapaStudio cutId={cutId} />;
}

export default function CapaQueryPage() {
  return (
    <Suspense fallback={<CapaLoading />}>
      <CapaFromQuery />
    </Suspense>
  );
}
