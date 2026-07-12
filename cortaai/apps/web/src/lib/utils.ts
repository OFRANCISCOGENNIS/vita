// Small shared helpers (formatting, class merging, deterministic pseudo-random,
// local SVG data-URI thumbnail generation — no external image hosts).

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Deterministic PRNG (mulberry32) so mock data is stable across renders (no hydration drift). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const frames = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(".", ",")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}mil`;
  return String(n);
}

export function formatBRL(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** UTC-based date formatting so server and client render identically. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const mo = Math.floor(d / 30);
  return `há ${mo} ${mo === 1 ? "mês" : "meses"}`;
}

let uidCounter = 0;
/** uuid-v4-shaped id generator (mock — real ids come from the API). */
export function uid(): string {
  uidCounter += 1;
  const rnd = seededRandom(Date.now() % 100000 + uidCounter);
  const hex = (len: number) =>
    Array.from({ length: len }, () => Math.floor(rnd() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * Friendly project title from an uploaded filename. Gallery uploads often come
 * with machine names (iOS uses a raw UUID like "D6982D14-….mov") — those become
 * "Vídeo de DD/MM às HH:mm" instead of leaking the code into the UI.
 */
export function friendlyMediaTitle(filename: string, now = new Date()): string {
  const base = filename.replace(/\.[a-z0-9]+$/i, "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base);
  const isMachine = /^[0-9a-f_-]{16,}$/i.test(base) && !/[g-z]/i.test(base.replace(/[_-]/g, ""));
  if (!base || isUuid || isMachine) {
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const mi = String(now.getMinutes()).padStart(2, "0");
    return `Vídeo de ${dd}/${mm} às ${hh}:${mi}`;
  }
  const pretty = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

const NICHE_HUES: Record<string, [number, number]> = {
  "finanças": [152, 190],
  fitness: [14, 40],
  podcast: [262, 300],
  humor: [45, 20],
  "educação": [205, 240],
  tecnologia: [222, 262],
  beleza: [320, 350],
  games: [280, 200],
};

/**
 * Generates a local SVG thumbnail as a data URI (gradient + label).
 * Keeps the app 100% self-contained — no external image hosts.
 */
export function svgThumb(label: string, niche = "tecnologia", w = 640, h = 360): string {
  const [h1, h2] = NICHE_HUES[niche] ?? [262, 300];
  const safe = label.replace(/[<>&"']/g, "").slice(0, 34);
  const fontSize = Math.round(w / 22);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h1},70%,16%)"/>` +
    `<stop offset="1" stop-color="hsl(${h2},80%,28%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    `<circle cx="${w * 0.82}" cy="${h * 0.2}" r="${h * 0.35}" fill="hsl(${h2},85%,55%)" opacity="0.14"/>` +
    `<circle cx="${w * 0.12}" cy="${h * 0.85}" r="${h * 0.28}" fill="hsl(${h1},85%,60%)" opacity="0.12"/>` +
    `<g transform="translate(${w / 2},${h / 2})"><circle r="${h * 0.11}" fill="rgba(255,255,255,0.14)"/>` +
    `<path d="M ${-h * 0.03} ${-h * 0.05} L ${h * 0.055} 0 L ${-h * 0.03} ${h * 0.05} Z" fill="rgba(255,255,255,0.85)"/></g>` +
    `<text x="${w * 0.05}" y="${h * 0.92}" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="rgba(255,255,255,0.92)">${safe}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Color scale for 0-100 scores (retention index, viral score). */
export function scoreColor(score: number): { text: string; bg: string; ring: string } {
  if (score >= 85) return { text: "text-emerald-300", bg: "bg-emerald-500/15", ring: "ring-emerald-400/40" };
  if (score >= 70) return { text: "text-lime-300", bg: "bg-lime-500/15", ring: "ring-lime-400/40" };
  if (score >= 50) return { text: "text-amber-300", bg: "bg-amber-500/15", ring: "ring-amber-400/40" };
  return { text: "text-rose-300", bg: "bg-rose-500/15", ring: "ring-rose-400/40" };
}

export function scoreHex(score: number): string {
  if (score >= 85) return "#34d399";
  if (score >= 70) return "#a3e635";
  if (score >= 50) return "#fbbf24";
  return "#fb7185";
}
