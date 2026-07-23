/** @type {import('next').NextConfig} */

// Deploy estático (GitHub Pages) é ativado por PAGES_EXPORT=1 (setado no workflow).
// Sem a env, mantém "standalone" para Docker/dev — nada muda no fluxo normal.
const isPagesExport = process.env.PAGES_EXPORT === "1";

// Em Pages de projeto, o site é servido sob /<repo>. Configurável via env para
// funcionar em qualquer fork sem editar código.
const basePath = isPagesExport ? process.env.PAGES_BASE_PATH ?? "/vita" : "";

const nextConfig = {
  output: isPagesExport ? "export" : "standalone",
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
  ...(isPagesExport ? { trailingSlash: true } : {}),
  // Thumbnails are locally generated SVG data URIs — no remote image hosts.
  images: { unoptimized: true },
  // Lint is run separately (`npm run lint`); build focuses on type safety.
  eslint: { ignoreDuringBuilds: true },
  // Exposto ao cliente para montar caminhos quando necessário.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
