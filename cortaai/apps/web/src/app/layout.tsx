import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

// Runs before first paint to avoid a theme flash (FOUC). Reads the persisted
// zustand shape {state:{theme}} from localStorage, resolves "system" via
// matchMedia, and stamps <html> with data-theme/.dark/color-scheme.
const THEME_SCRIPT = `(function(){try{var t="dark";var raw=localStorage.getItem("cortaai-theme");if(raw){var p=JSON.parse(raw);if(p&&p.state&&p.state.theme)t=p.state.theme;}if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var r=document.documentElement;r.dataset.theme=t;r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;}catch(e){}})();`;

const SITE_URL = "https://cortaai.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CortaAí — Editor de vídeo profissional 100% no navegador",
    template: "%s | CortaAí",
  },
  description:
    "Editor de vídeo completo no navegador: timeline multi-trilha, legendas com estilo, correção de cor, editor de fotos e estúdio de capa — com exportação em até 4K, .srt e descrição. Sem instalar nada.",
  keywords: [
    "editor de vídeo",
    "editor de vídeo online",
    "shorts",
    "reels",
    "tiktok",
    "legendas de vídeo",
    "editor no navegador",
  ],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: SITE_URL,
    siteName: "CortaAí",
    title: "CortaAí — Editor de vídeo profissional 100% no navegador",
    description:
      "Timeline multi-trilha, legendas, cores e exportação 4K — tudo no navegador, em português.",
  },
  twitter: {
    card: "summary_large_image",
    title: "CortaAí — editor de vídeo no navegador",
    description: "Edite. Legende. Exporte em 4K. Sem instalar nada.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
  // "cover" habilita env(safe-area-inset-*) no iOS (barra inferior do editor).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
