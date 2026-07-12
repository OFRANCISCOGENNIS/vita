// Server wrapper: fornece generateStaticParams para o export estático (GitHub Pages).
// O conteúdo interativo vive em client.tsx (client component com useParams()).

import { mockCuts } from "@/lib/mock-data";
import EditorPage from "./client";

// Pré-gera as rotas de editor conhecidas (clipes) no build.
export function generateStaticParams() {
  return mockCuts.map((c) => ({ cutId: c.id }));
}

// No export estático, só os params acima são gerados (demonstração).
export const dynamicParams = false;

export default function Page() {
  return <EditorPage />;
}
