import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // Paleta do painel (dark premium por padrão)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: '#6366f1',
        // Séries de plataforma (slots fixos — nunca reordenar)
        google: 'var(--series-google)',
        meta: 'var(--series-meta)',
        tiktok: 'var(--series-tiktok)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-grotesk)', 'var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
