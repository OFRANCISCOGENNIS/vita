import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });

export const metadata: Metadata = {
  title: {
    default: 'TrafegoAI — Gestor de Tráfego Pago com IA',
    template: '%s · TrafegoAI',
  },
  description:
    'Todas as suas campanhas do Google, Meta e TikTok em um só painel — otimizadas por IA. Dashboard unificado, recomendações acionáveis, automações e relatórios white-label.',
  keywords: ['tráfego pago', 'google ads', 'meta ads', 'tiktok ads', 'gestor de tráfego', 'IA', 'ROAS'],
  openGraph: {
    title: 'TrafegoAI — Gestor de Tráfego Pago com IA',
    description: 'Google, Meta e TikTok Ads em um só painel, otimizados por IA.',
    locale: 'pt_BR',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${grotesk.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
