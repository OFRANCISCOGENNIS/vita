// Server wrapper: fornece generateStaticParams para o export estático (GitHub Pages).
// O conteúdo interativo vive em client.tsx (client component com useParams()).

import { mockTrendVideos } from "@/lib/mock-data";
import XrayPage from "./client";

export function generateStaticParams() {
  return mockTrendVideos.map((v) => ({ id: v.id }));
}

export const dynamicParams = false;

export default function Page() {
  return <XrayPage />;
}
