// Server wrapper: fornece generateStaticParams para o export estático (GitHub Pages).
// O conteúdo interativo vive em client.tsx (client component com useParams()).

import { mockProjects } from "@/lib/mock-data";
import ProjectDetailPage from "./client";

export function generateStaticParams() {
  return mockProjects.map((p) => ({ id: p.id }));
}

export const dynamicParams = false;

export default function Page() {
  return <ProjectDetailPage />;
}
