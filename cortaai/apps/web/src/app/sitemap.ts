import type { MetadataRoute } from "next";

const SITE_URL = "https://cortaai.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/entrar`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/cadastro`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${SITE_URL}/recuperar-senha`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
