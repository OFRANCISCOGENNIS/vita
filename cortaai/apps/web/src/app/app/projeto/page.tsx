"use client";

// Export-safe project detail for USER-created projects. New project ids have no
// pre-rendered page under /app/projetos/[id] (dynamicParams=false), so user
// projects open here via ?id=<id>. The [id] route stays for the demo seed.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProjectDetailPage from "../projetos/[id]/client";

function ProjectFromQuery() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  return <ProjectDetailPage id={id} />;
}

export default function ProjectQueryPage() {
  return (
    <Suspense fallback={null}>
      <ProjectFromQuery />
    </Suspense>
  );
}
