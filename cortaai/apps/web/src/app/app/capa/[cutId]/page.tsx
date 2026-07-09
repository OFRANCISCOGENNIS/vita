// Server wrapper: generateStaticParams for the static export (GitHub Pages).
// The interactive canvas studio lives in client.tsx.

import { mockCuts, mockGenerations } from "@/lib/mock-data";
import CapaPage from "./client";

// Pre-generate the known cover routes (cuts + studio generations) at build time.
export function generateStaticParams() {
  const ids = new Set<string>();
  mockCuts.forEach((c) => ids.add(c.id));
  mockGenerations.forEach((g) => ids.add(g.id));
  return Array.from(ids).map((cutId) => ({ cutId }));
}

// Static export only emits the params above (demo).
export const dynamicParams = false;

export default function Page() {
  return <CapaPage />;
}
