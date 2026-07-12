// Server wrapper: fornece generateStaticParams para o export estático (GitHub Pages).
// O conteúdo interativo vive em client.tsx (client component com useParams()).

import { mockCuts, mockGenerations } from "@/lib/mock-data";
import EditorPage from "./client";

// Pré-gera as rotas de editor conhecidas (cortes + gerações do Estúdio) no build.
export function generateStaticParams() {
  const ids = new Set<string>();
  mockCuts.forEach((c) => ids.add(c.id));
  mockGenerations.forEach((g) => ids.add(g.id));
  return Array.from(ids).map((cutId) => ({ cutId }));
}

// No export estático, só os params acima são gerados (demonstração).
export const dynamicParams = false;

export default function Page() {
  return <EditorPage />;
}
