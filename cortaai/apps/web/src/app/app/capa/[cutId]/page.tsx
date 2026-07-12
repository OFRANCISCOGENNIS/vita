// Server wrapper: generateStaticParams for the static export (GitHub Pages).
// The interactive canvas studio lives in client.tsx.

import { mockCuts } from "@/lib/mock-data";
import CapaPage from "./client";

// Pre-generate the known cover routes (cuts) at build time.
export function generateStaticParams() {
  return mockCuts.map((c) => ({ cutId: c.id }));
}

// Static export only emits the params above (demo).
export const dynamicParams = false;

export default function Page() {
  return <CapaPage />;
}
