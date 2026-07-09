import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const SITE_URL = "https://cortaai.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CortaAí — Descubra o que viraliza. Corte. Exporte em 4K.",
    template: "%s | CortaAí",
  },
  description:
    "A máquina de cortes com Radar Viral: pesquise tendências, transforme vídeos longos em cortes com score viral e exporte em até 4K com legendas, capa e descrição. Tudo em um só lugar.",
  keywords: [
    "cortes de vídeo",
    "vídeos virais",
    "shorts",
    "reels",
    "tiktok",
    "editor de vídeo com IA",
    "radar viral",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "CortaAí",
    title: "CortaAí — Descubra o que viraliza. Corte. Exporte em 4K.",
    description:
      "Radar Viral + cortes com IA + editor no navegador + exportação 4K. A máquina de cortes completa, em português.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CortaAí — a máquina de cortes com Radar Viral",
    description: "Descubra o que viraliza. Corte. Exporte em 4K. Tudo em um só lugar.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
