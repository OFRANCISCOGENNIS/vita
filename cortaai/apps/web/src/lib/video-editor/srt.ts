// LEGENDAS SRT — parser/serializador puros (testáveis) para o Estúdio.
// Cada cue vira um clipe de TEXTO na timeline (e vice-versa na exportação).

export interface SrtCue {
  startMs: number;
  endMs: number;
  text: string;
}

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function parseTime(s: string): number | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  return (
    Number(m[1]) * 3_600_000 +
    Number(m[2]) * 60_000 +
    Number(m[3]) * 1000 +
    Number(m[4].padEnd(3, "0"))
  );
}

/** Parse defensivo de um arquivo .srt (aceita \r\n, índices ausentes, HTML simples). */
export function parseSrt(content: string): SrtCue[] {
  const cues: SrtCue[] = [];
  const blocks = content.replace(/\r/g, "").split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    // pula o índice numérico se existir
    let i = 0;
    if (/^\d+$/.test(lines[0].trim())) i = 1;
    const timeLine = lines[i] ?? "";
    if (!timeLine.includes("-->")) continue;
    const [rawStart, rawEnd] = timeLine.split("-->");
    const startMs = parseTime(rawStart ?? "");
    const endMs = parseTime(rawEnd ?? "");
    if (startMs == null || endMs == null || endMs <= startMs) continue;
    const text = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]+>/g, "") // remove tags HTML simples (<i>, <b>…)
      .trim();
    if (!text) continue;
    cues.push({ startMs, endMs, text });
  }
  return cues.sort((a, b) => a.startMs - b.startMs);
}

function fmtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const mm = t % 1000;
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)},${p(mm, 3)}`;
}

/** Serializa cues para o formato .srt padrão. */
export function toSrt(cues: SrtCue[]): string {
  const sorted = [...cues].sort((a, b) => a.startMs - b.startMs);
  return sorted
    .map((cue, i) => `${i + 1}\n${fmtTime(cue.startMs)} --> ${fmtTime(cue.endMs)}\n${cue.text.trim()}`)
    .join("\n\n") + (sorted.length ? "\n" : "");
}
