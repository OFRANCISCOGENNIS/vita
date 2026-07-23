"use client";

// Capa route — the canvas studio is lazy-loaded (client-only) so it stays out
// of the shared bundle and never runs on the server.

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

const CapaStudio = dynamic(() => import("@/components/capa/capa-studio").then((m) => m.CapaStudio), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-[440px] w-full" />
        <Skeleton className="h-[440px] w-full" />
      </div>
    </div>
  ),
});

export default function CapaPage() {
  const params = useParams<{ cutId: string }>();
  return <CapaStudio cutId={params.cutId} />;
}
