/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Thumbnails are locally generated SVG data URIs — no remote image hosts.
  images: { unoptimized: true },
  // Lint is run separately (`npm run lint`); build focuses on type safety.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
