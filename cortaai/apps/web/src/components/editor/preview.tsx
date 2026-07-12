"use client";

// Central preview: instant aspect switch, platform safe-zone overlays, live
// caption/layer rendering over an animated placeholder "video" — plus the
// advanced effects (color grade, reframe, chroma key, masks, layer keyframes,
// speed) applied VISUALLY so the user sees every edit on the placeholder media.

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { PLATFORM_PRESETS, CAPTION_PRESETS } from "@/lib/presets";
import { cn, formatTimecode } from "@/lib/utils";
import {
  GRAIN_DATA_URI,
  adjustmentFilter,
  colorGradeToFilter,
  filterCss,
  fxFilterString,
  fxMotionVars,
  layerAnimAt,
  overlaySwatch,
  reframeAt,
  reframeTransform,
  reframeWindow,
  speedAt,
  stickerPos,
  temperatureWash,
  vignetteBackground,
  type FxState,
  type LayerSample,
  type OverlayLayer,
} from "@/lib/edit-visuals";
import { useEditorStore, type AspectRatio, type PlatformPresetId } from "@/store/editor";
import { ChromaCanvas } from "./chroma-canvas";
import { RegionOverlay, type Rect } from "./region-overlay";

export const ASPECTS: { id: AspectRatio; label: string; ratio: number }[] = [
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
];

/** CSS transform from a layer-animation sample, sized to the frame. */
function layerStyle(sample: LayerSample | null, w: number, h: number): React.CSSProperties {
  if (!sample) return {};
  return {
    transform: `translate(${(sample.x * w).toFixed(1)}px, ${(sample.y * h).toFixed(1)}px) scale(${sample.scale.toFixed(3)}) rotate(${sample.rotation.toFixed(1)}deg)`,
    opacity: sample.opacity,
  };
}

export function EditorPreview() {
  const {
    cut,
    doc,
    playing,
    currentTime,
    overlayMode,
    selectedMaskId,
    mediaUrl,
    mediaMissing,
    togglePlay,
    setPlaying,
    seek,
    apply,
    setReframe,
    updateMask,
    setSelectedMaskId,
  } = useEditorStore();

  // --- responsive stage sizing (CapCut-style big preview) ---------------------
  // The letterbox stage is measured with a ResizeObserver; the frame then takes
  // the largest size that fits the stage while preserving the selected aspect.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setStageSize((prev) =>
        prev && Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // --- real <video> playback (local upload / direct URL) ---------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  // When the browser can't decode the file (e.g. HEVC/H.265 from some phones),
  // surface a clear message instead of a silent black frame.
  const [mediaError, setMediaError] = useState(false);
  useEffect(() => {
    setMediaError(false);
  }, [mediaUrl]);
  const hasVideo = !!mediaUrl && !doc.chroma.enabled;
  const startSeconds = cut?.startSeconds ?? 0;
  const endSeconds = cut?.endSeconds ?? 0;

  // Play/pause the element in lock-step with the editor's transport.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (playing) {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        // Autoplay policy: if unmuted play is blocked, retry muted.
        p.catch(() => {
          v.muted = true;
          setMuted(true);
          void v.play().catch(() => undefined);
        });
      }
    } else {
      v.pause();
    }
  }, [playing, hasVideo]);

  // Follow external seeks (timeline scrub, arrow keys) — but ignore the tiny
  // drift the element itself reports via timeupdate to avoid a feedback loop.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    const target = startSeconds + currentTime;
    if (Math.abs(v.currentTime - target) > 0.3) {
      try {
        v.currentTime = target;
      } catch {
        /* metadata not ready yet */
      }
    }
  }, [currentTime, hasVideo, startSeconds]);

  if (!cut) return null;

  const duration = cut.endSeconds - cut.startSeconds;
  const aspect = ASPECTS.find((a) => a.id === doc.aspect) ?? ASPECTS[0];
  const preset = PLATFORM_PRESETS.find((p) => p.id === doc.platformPreset);
  const captionDef = CAPTION_PRESETS.find((p) => p.id === doc.captionPreset) ?? CAPTION_PRESETS[0];

  const safe = preset
    ? {
        top: (preset.safeZone.top / 1920) * 100,
        bottom: (preset.safeZone.bottom / 1920) * 100,
        left: (preset.safeZone.left / 1080) * 100,
        right: (preset.safeZone.right / 1080) * 100,
      }
    : null;

  const absTime = cut.startSeconds + currentTime;
  const activeWords = cut.transcript.filter((w) => Math.abs(w.start - absTime) < 1.6).slice(0, 5);
  const captionText = activeWords.length > 0 ? activeWords.map((w) => w.word).join(" ") : "Sua legenda aparece aqui";

  // --- caption controls (wired to the preview) ---
  const displayCaption = doc.captionStyle.censorProfanity
    ? captionText.replace(/\b(merda|porra|caralho)\b/gi, "****")
    : captionText;
  const captionAnim = doc.captionStyle.animation;
  const karaoke = captionAnim === "karaokê";
  // Entrance animation class (not for presets that own their own animation).
  const captionEntranceClass =
    ["typewriter", "gradientAnimated"].includes(doc.captionPreset)
      ? ""
      : captionAnim === "pop"
        ? "cap-anim-pop"
        : captionAnim === "slide"
          ? "cap-anim-slide"
          : "";
  const HIGHLIGHT_ACCENT = "#fde047"; // números / CAPS / palavras-chave
  const KEYWORD_SET = new Set([
    "nunca", "sempre", "agora", "segredo", "erro", "grátis", "gratis", "novo",
    "atenção", "atencao", "importante", "hoje", "melhor", "pior",
  ]);
  const isKeyword = (raw: string): boolean => {
    const w = raw.replace(/[^0-9A-Za-zÀ-ÿ]/g, "");
    if (!w) return false;
    if (/\d/.test(w)) return true;
    if (w.length > 1 && w === w.toUpperCase() && /[A-Za-zÀ-ÿ]/.test(w)) return true;
    return KEYWORD_SET.has(w.toLowerCase());
  };
  const captionWords = displayCaption.split(/\s+/).filter(Boolean);
  const captionAsWords = doc.captionStyle.highlightKeywords || karaoke;

  // --- layer transition affordance at segment boundaries ---
  const segTransition = doc.layers.transition;
  const nearBoundary =
    segTransition !== "nenhuma"
      ? doc.splits.find((b) => Math.abs(currentTime - b) < 0.45) ?? null
      : null;
  const transiClass =
    segTransition === "zoom" ? "transi-zoom" : segTransition === "slide" ? "transi-slide" : "transi-whip";

  // Responsive frame: largest size that fits the measured stage (small margin),
  // preserving the aspect. Falls back to the legacy 420px before first measure.
  const STAGE_MARGIN = 12;
  const availW = Math.max(0, (stageSize?.w ?? 0) - STAGE_MARGIN * 2);
  const availH = Math.max(0, (stageSize?.h ?? 0) - STAGE_MARGIN * 2);
  const fitH = Math.floor(Math.min(availH, availW / aspect.ratio));
  const previewHeight = stageSize ? Math.max(180, fitH) : 420;
  const previewWidth = Math.round(previewHeight * aspect.ratio);

  // --- advanced effect derivations ---
  const grade = doc.colorGrade;
  const stylizedFilter = filterCss(doc.filter.id, doc.filter.intensity);
  const fxFilter = fxFilterString(doc.fx);
  const adjFilter = adjustmentFilter(doc.adjustment);
  // Media base filter = correção de cor + filtro estilizado + FX de cor + ajuste global.
  const filter = [colorGradeToFilter(grade), stylizedFilter?.filter, fxFilter, adjFilter]
    .filter(Boolean)
    .join(" ");
  const wash = temperatureWash(grade);
  const vignette = vignetteBackground(grade);
  // Motion FX que animam um wrapper (glitch/tremor/zoom-pulse).
  const motionFx = (["glitch", "shake", "zoomPulse"] as const).filter((id) => doc.fx[id].enabled);
  // Tint da camada de ajuste, quando um filtro global é escolhido.
  const adjWash = doc.adjustment.enabled && doc.adjustment.filter ? filterCss(doc.adjustment.filter, 70)?.overlay : null;

  const editingReframe = overlayMode === "reframe";
  const reframeBase = { zoom: doc.reframe.zoom, panX: doc.reframe.panX, panY: doc.reframe.panY, rotation: doc.reframe.rotation };
  const reframeSample = editingReframe ? reframeBase : reframeAt(doc.reframe, currentTime);
  const mediaTransform = editingReframe ? "none" : reframeTransform(reframeSample, doc.reframe.flipH, doc.reframe.flipV);
  const reframeBox = reframeWindow(reframeBase);

  const currentRate = speedAt(doc.speed, currentTime);

  const headlineSample = layerAnimAt(doc.layersAnim.headline, currentTime);
  const logoSample = layerAnimAt(doc.layersAnim.logo, currentTime);
  const stickerSample = layerAnimAt(doc.layersAnim.sticker, currentTime);

  function reframeBoxToState(rect: Rect) {
    const size = Math.max(0.06, Math.min(rect.w, rect.h));
    const zoom = 1 / size;
    const room = 1 - size;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    setReframe({
      zoom,
      panX: room > 0 ? Math.max(-1, Math.min(1, (cx - 0.5) / (room / 2))) : 0,
      panY: room > 0 ? Math.max(-1, Math.min(1, (cy - 0.5) / (room / 2))) : 0,
    });
  }

  return (
    <div ref={stageRef} className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden bg-[#050508]">
      {/* Aspect + platform preset switchers — floating over the stage top.
          No mobile ficam ocultos (viram o painel "Formato" da barra inferior)
          para o vídeo dominar a tela sem nada sobreposto. */}
      <div className="absolute inset-x-0 top-2 z-30 hidden flex-wrap items-center justify-center gap-2 px-2 lg:flex">
        <div role="group" aria-label="Proporção do vídeo" className="flex gap-1 rounded-xl bg-black/55 p-1 ring-1 ring-[rgba(255,255,255,0.12)] backdrop-blur">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => apply({ aspect: a.id })}
              aria-pressed={doc.aspect === a.id}
              title={`Proporção ${a.label}`}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.aspect === a.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-zinc-50" : "text-zinc-400 hover:text-zinc-50",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Preset de plataforma (safe zones)" className="flex gap-1 rounded-xl bg-black/55 p-1 ring-1 ring-[rgba(255,255,255,0.12)] backdrop-blur">
          {PLATFORM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => apply({ platformPreset: doc.platformPreset === p.id ? null : (p.id as PlatformPresetId), aspect: "9:16" })}
              aria-pressed={doc.platformPreset === p.id}
              title={`${p.resolution} · máx ${p.maxDuration}`}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.platformPreset === p.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-zinc-50" : "text-zinc-400 hover:text-zinc-50",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Preview canvas */}
      <div
        className="relative overflow-hidden rounded-xl border border-[rgba(255,255,255,0.08)] bg-black shadow-2xl shadow-black/60"
        style={{ width: previewWidth, height: previewHeight, maxWidth: "100%", maxHeight: "100%" }}
      >
        {/* Graded + reframed MEDIA layer (wrapped by motion FX, se houver) */}
        <MotionFx fx={doc.fx} active={motionFx}>
          <div
            className="absolute inset-0"
            style={{ filter, transform: mediaTransform, transformOrigin: "center", transition: playing ? "none" : "transform 120ms linear" }}
            aria-hidden
          >
            {doc.chroma.enabled ? (
              <ChromaCanvas
                width={previewWidth}
                height={previewHeight}
                keyColor={doc.chroma.keyColor}
                tolerance={doc.chroma.tolerance}
                softness={doc.chroma.softness}
                showBefore={doc.chroma.showBefore}
              />
            ) : mediaUrl ? (
              <video
                ref={videoRef}
                src={mediaUrl}
                muted={muted}
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full bg-black object-cover"
                onLoadedMetadata={(e) => {
                  // Start the element at the cut's in-point.
                  const v = e.currentTarget;
                  try {
                    v.currentTime = startSeconds + currentTime;
                  } catch {
                    /* ignore */
                  }
                }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  // Respect the cut's out-point: stop at the end of the segment.
                  if (endSeconds > startSeconds && v.currentTime >= endSeconds) {
                    v.pause();
                    setPlaying(false);
                    seek(endSeconds - startSeconds);
                    return;
                  }
                  // The element is the clock while it plays — mirror it to the store.
                  if (playing) seek(v.currentTime - startSeconds);
                }}
                onEnded={() => {
                  setPlaying(false);
                  seek(Math.max(0, endSeconds - startSeconds));
                }}
                onError={() => setMediaError(true)}
                aria-hidden
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/70 via-surface-2 to-fuchsia-900/50">
                <div
                  className={cn(
                    "absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 blur-2xl",
                    playing && "animate-pulse-soft",
                  )}
                />
                <div
                  className={cn(
                    "absolute left-1/2 top-[42%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-white/5 backdrop-blur transition-transform duration-500",
                    playing && doc.layers.autoZoomPunch && "scale-110",
                  )}
                />
              </div>
            )}
            {mediaError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center">
                <div className="text-3xl">🎞️</div>
                <p className="text-sm font-semibold text-white">
                  Não foi possível reproduzir este vídeo
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                  O navegador não conseguiu decodificar o formato/codec deste
                  arquivo (ex.: HEVC/H.265 de alguns celulares). Tente exportar/
                  converter para <span className="text-white">MP4 (H.264)</span> e
                  subir de novo.
                </p>
              </div>
            )}
            {/* O corte referencia uma mídia que ESTE navegador não tem (o
                aparelho negou/limpou o armazenamento, ou é outro dispositivo). */}
            {!mediaUrl && mediaMissing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/85 px-6 text-center">
                <div className="text-3xl">🎞️</div>
                <p className="text-sm font-semibold text-white">
                  O vídeo deste corte não está salvo neste navegador
                </p>
                <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                  Isso acontece quando o aparelho nega o armazenamento local
                  (pouco espaço ou modo privado) ou quando você abre em outro
                  dispositivo. Envie o arquivo de novo em{" "}
                  <span className="text-white">Novo projeto</span> para editar
                  com o vídeo real.
                </p>
              </div>
            )}
          </div>
        </MotionFx>

        {/* Temperature/tint wash */}
        {wash && (
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ backgroundColor: wash.color, opacity: wash.opacity }}
            aria-hidden
          />
        )}
        {/* Filtro estilizado — tint overlay (fade/retrô/frio/quente) */}
        {stylizedFilter?.overlay && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: stylizedFilter.overlay.color, opacity: stylizedFilter.overlay.opacity, mixBlendMode: stylizedFilter.overlay.blend as React.CSSProperties["mixBlendMode"] }}
            aria-hidden
          />
        )}
        {/* Camada de ajuste — tint global do filtro escolhido */}
        {adjWash && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: adjWash.color, opacity: adjWash.opacity, mixBlendMode: adjWash.blend as React.CSSProperties["mixBlendMode"] }}
            aria-hidden
          />
        )}
        {/* Biblioteca de efeitos — overlays (VHS, grain, scanlines, leaks, prisma, RGB split) */}
        <FxOverlays fx={doc.fx} />
        {/* Vignette */}
        {vignette && <div className="pointer-events-none absolute inset-0" style={{ background: vignette }} aria-hidden />}

        {/* Overlays + Picture-in-Picture (blend modes) */}
        {doc.overlays.map((o) => (
          <OverlayVisual key={o.id} overlay={o} w={previewWidth} h={previewHeight} />
        ))}

        {/* Masks (visual effect) */}
        {doc.masks.map((m) => (
          <MaskVisual key={m.id} mask={m} />
        ))}

        {/* Safe-zone overlay */}
        {safe && doc.aspect === "9:16" && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute inset-x-0 top-0 border-b border-dashed border-rose-400/60 bg-rose-500/10" style={{ height: `${safe.top}%` }} />
            <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-rose-400/60 bg-rose-500/10" style={{ height: `${safe.bottom}%` }} />
            {safe.left > 0 && <div className="absolute inset-y-0 left-0 border-r border-dashed border-rose-400/40 bg-rose-500/5" style={{ width: `${safe.left}%` }} />}
            {safe.right > 0 && <div className="absolute inset-y-0 right-0 border-l border-dashed border-rose-400/40 bg-rose-500/5" style={{ width: `${safe.right}%` }} />}
            <span className="absolute left-2 top-1 text-[9px] font-medium uppercase tracking-wide text-rose-300/80">
              zona de UI {preset?.name}
            </span>
          </div>
        )}

        {/* Headline layer (keyframeable) */}
        {doc.layers.headlineEnabled && doc.layers.headlineText && (
          <p
            className="absolute inset-x-3 top-[12%] text-center text-sm font-extrabold leading-tight text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
            style={layerStyle(headlineSample, previewWidth, previewHeight)}
          >
            {doc.layers.headlineText}
          </p>
        )}

        {/* Caption preview */}
        <p
          key={`cap-${captionAnim}-${displayCaption}`}
          className={cn(
            "absolute inset-x-3 text-center leading-tight transition-all",
            captionDef.previewClass,
            doc.captionPreset === "typewriter" && "caption-typewriter mx-auto w-fit max-w-full",
            doc.captionPreset === "gradientAnimated" && "caption-gradient-animated",
            captionEntranceClass,
            doc.captionStyle.position === "topo" && "top-[22%]",
            doc.captionStyle.position === "centro" && "top-1/2 -translate-y-1/2",
            doc.captionStyle.position === "rodapé" && "bottom-[22%]",
          )}
          style={{
            fontSize: Math.max(12, doc.captionStyle.sizePx * (previewHeight / 1920) * 2.4),
            fontFamily: doc.captionStyle.font,
            color: ["hormozi", "minimal", "boldEmoji"].includes(doc.captionPreset) ? doc.captionStyle.color : undefined,
            textShadow: doc.captionStyle.shadow ? "0 3px 10px rgba(0,0,0,0.85)" : undefined,
            WebkitTextStroke: doc.captionStyle.outline ? "1px rgba(0,0,0,0.9)" : undefined,
          }}
        >
          {captionAsWords
            ? captionWords.map((w, i) => (
                <span
                  key={i}
                  className={cn(karaoke && "cap-kara")}
                  style={{
                    animationDelay: karaoke ? `${i * 0.12}s` : undefined,
                    color: doc.captionStyle.highlightKeywords && isKeyword(w) ? HIGHLIGHT_ACCENT : undefined,
                  }}
                >
                  {i > 0 ? " " : ""}
                  {w}
                </span>
              ))
            : displayCaption}
        </p>

        {/* Watermark (keyframeable) */}
        {doc.layers.watermarkEnabled && (
          <span
            className="absolute right-2.5 top-2.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white/80 backdrop-blur"
            style={layerStyle(logoSample, previewWidth, previewHeight)}
            aria-hidden
          >
            SUA MARCA
          </span>
        )}

        {/* Progress bar layer */}
        {doc.layers.progressBarEnabled && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/10" aria-hidden>
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Sticker (keyframeable) */}
        {doc.layers.stickersEnabled && (
          <span
            className={cn("absolute left-3 top-[30%] text-3xl", !stickerSample && "animate-float")}
            style={layerStyle(stickerSample, previewWidth, previewHeight)}
            aria-hidden
          >
            🔥
          </span>
        )}

        {/* Stickers da biblioteca (com tracking / seguir movimento) */}
        {doc.stickers.map((s) => {
          const pos = stickerPos(s, currentTime);
          return (
            <span
              key={s.id}
              className="pointer-events-none absolute select-none text-2xl leading-none"
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                transform: `translate(-50%, -50%) scale(${s.scale.toFixed(2)})`,
                transition: playing ? "none" : "left 120ms linear, top 120ms linear",
              }}
              aria-hidden
            >
              {s.content}
            </span>
          );
        })}

        {/* Texto animado (templates in/out) */}
        {doc.animatedText.enabled && doc.animatedText.text && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-4 flex justify-center text-center",
              doc.animatedText.position === "topo" && "top-[16%]",
              doc.animatedText.position === "centro" && "top-1/2 -translate-y-1/2",
              doc.animatedText.position === "rodapé" && "bottom-[16%]",
            )}
            aria-hidden
          >
            <span
              key={`${doc.animatedText.preset}-${doc.animatedText.text}-${doc.animatedText.loop}`}
              className={cn(
                "font-extrabold uppercase leading-tight [text-shadow:0_2px_10px_rgba(0,0,0,0.85)]",
                `at-${doc.animatedText.preset}`,
                doc.animatedText.loop && doc.animatedText.preset !== "glow" && "at-loop",
              )}
              style={{
                color: doc.animatedText.color,
                fontSize: Math.max(14, doc.animatedText.sizePx * (previewHeight / 1920) * 2.2),
              }}
            >
              {doc.animatedText.text}
            </span>
          </div>
        )}

        {/* Estabilização / Enhance — dica "antes/depois" e selos */}
        {doc.processing.enhance && (
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[15] w-px bg-white/50" aria-hidden>
            <span className="absolute left-1 top-2 rounded bg-black/60 px-1 text-[8px] font-medium text-zinc-300">antes</span>
            <span className="absolute right-1 top-2 -translate-x-full rounded bg-black/60 px-1 text-[8px] font-medium text-emerald-300">depois</span>
          </div>
        )}
        {(doc.processing.stabilize || doc.processing.enhance) && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex flex-col items-end gap-1" aria-hidden>
            {doc.processing.stabilize && (
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-sky-300 backdrop-blur">
                estabilizado {doc.processing.stabilizeStrength}%
              </span>
            )}
            {doc.processing.enhance && (
              <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-fuchsia-300 backdrop-blur">
                enhance → {doc.processing.upscaleTarget}
              </span>
            )}
          </div>
        )}

        {/* Reframe editing box */}
        {editingReframe && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-black/40" aria-hidden />
            <div
              className="pointer-events-none absolute rounded-md ring-2 ring-fuchsia-400"
              style={{
                left: `${reframeBox.x * 100}%`,
                top: `${reframeBox.y * 100}%`,
                width: `${reframeBox.w * 100}%`,
                height: `${reframeBox.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
              }}
              aria-hidden
            />
            <RegionOverlay
              rect={reframeBox}
              onChange={reframeBoxToState}
              label={`Reenquadrar · ${reframeSample.zoom.toFixed(2)}x`}
              color="#f0abfc"
              lockAspect
              minSize={0.2}
              selected
            />
          </>
        )}

        {/* Mask editing overlays */}
        {overlayMode === "masks" &&
          doc.masks.map((m) => (
            <RegionOverlay
              key={m.id}
              rect={{ x: m.x, y: m.y, w: m.w, h: m.h }}
              onChange={(r) => updateMask(m.id, r)}
              onSelect={() => setSelectedMaskId(m.id)}
              selected={selectedMaskId === m.id}
              label={maskLabel(m.kind)}
              color={selectedMaskId === m.id ? "#22d3ee" : "#a78bfa"}
              shape={m.shape}
            />
          ))}

        {/* Transição entre segmentos — afordância breve ao cruzar um corte */}
        {nearBoundary != null && (
          <div key={`transi-${nearBoundary}`} className="pointer-events-none absolute inset-0 z-[16]" aria-hidden>
            <div className={cn("absolute inset-0 bg-black/25", transiClass)} />
            <span className="absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 backdrop-blur">
              transição · {segTransition}
            </span>
          </div>
        )}

        {/* Play/pause overlay */}
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
        >
          <span
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-opacity",
              playing ? "opacity-0 group-hover:opacity-100" : "opacity-100",
            )}
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
          </span>
        </button>

        {/* Speed indicator */}
        {(Math.abs(currentRate - 1) > 0.001 || doc.speed.keyframes.length > 0) && (
          <span
            className="pointer-events-none absolute left-2.5 top-2.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-300 backdrop-blur"
            aria-hidden
          >
            {currentRate.toFixed(2)}x
          </span>
        )}
        {doc.chroma.enabled && (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300 backdrop-blur" aria-hidden>
            chroma {doc.chroma.showBefore ? "· antes" : "· depois"}
          </span>
        )}

        {/* Mute (mobile) — o pill flutuante some no mobile, e o estado `muted`
            é local do preview, então o controle mora aqui, discreto no canto. */}
        {hasVideo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
            }}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            title={muted ? "Ativar som" : "Silenciar"}
            className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-zinc-50/80 backdrop-blur transition-colors hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 lg:hidden"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Floating transport pill (CapCut-style) — desktop; no mobile a linha de
          transporte fica abaixo do preview (editor.tsx), sem sobrepor o vídeo */}
      <div className="absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2.5 rounded-full bg-black/60 py-1.5 pl-1.5 pr-4 ring-1 ring-[rgba(255,255,255,0.12)] backdrop-blur lg:flex">
        <button
          onClick={togglePlay}
          aria-label={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
          title={playing ? "Pausar (Espaço)" : "Reproduzir (Espaço)"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-zinc-50 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <span className="font-mono text-xs tabular-nums text-zinc-50/90" aria-hidden>
          {formatTimecode(currentTime)} <span className="text-zinc-50/40">/ {formatTimecode(duration)}</span>
        </span>
        {Math.abs(currentRate - 1) > 0.001 && (
          <span className="font-mono text-[10px] font-bold text-amber-300" aria-hidden>{currentRate.toFixed(2)}x</span>
        )}
        {preset && (
          <span className="hidden text-[10px] text-zinc-50/45 sm:inline" aria-hidden>
            {preset.resolution} · máx {preset.maxDuration}
          </span>
        )}
        {hasVideo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
            }}
            aria-label={muted ? "Ativar som" : "Silenciar"}
            title={muted ? "Ativar som" : "Silenciar"}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-50/80 transition-colors hover:bg-[rgba(255,255,255,0.12)] hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function maskLabel(kind: string): string {
  return kind === "blur" ? "Desfoque" : kind === "pixelate" ? "Pixel" : kind === "spotlight" ? "Holofote" : "Forma";
}

/** Nests one animated wrapper per active motion effect (glitch/shake/zoom-pulse). */
function MotionFx({
  fx,
  active,
  children,
}: {
  fx: FxState;
  active: readonly ("glitch" | "shake" | "zoomPulse")[];
  children: React.ReactNode;
}) {
  if (active.length === 0) return <>{children}</>;
  return active.reduce<React.ReactNode>((node, id) => {
    const cls = id === "glitch" ? "fx-glitch" : id === "shake" ? "fx-shake" : "fx-zoom-pulse";
    return (
      <div className={cn("absolute inset-0", cls)} style={fxMotionVars(id, fx[id].intensity) as React.CSSProperties} aria-hidden>
        {node}
      </div>
    );
  }, children as React.ReactNode);
}

/** Painted overlay effects from the FX library (blended over the media). */
function FxOverlays({ fx }: { fx: FxState }) {
  const k = (id: keyof FxState) => fx[id].intensity / 100;
  return (
    <>
      {fx.rgbSplit.enabled && (
        <>
          <div
            className="pointer-events-none absolute inset-0 mix-blend-screen"
            style={{ background: "linear-gradient(90deg, rgba(255,0,0,0.5), transparent 40%)", opacity: 0.4 * k("rgbSplit"), transform: `translateX(${(-4 * k("rgbSplit")).toFixed(1)}px)` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 mix-blend-screen"
            style={{ background: "linear-gradient(270deg, rgba(0,255,255,0.5), transparent 40%)", opacity: 0.4 * k("rgbSplit"), transform: `translateX(${(4 * k("rgbSplit")).toFixed(1)}px)` }}
            aria-hidden
          />
        </>
      )}
      {fx.chromatic.enabled && (
        <div
          className="pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background: "radial-gradient(ellipse at center, transparent 55%, rgba(255,40,40,0.4) 80%, rgba(40,120,255,0.4) 100%)",
            opacity: 0.6 * k("chromatic"),
          }}
          aria-hidden
        />
      )}
      {fx.scanlines.enabled && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.35) 0 1px, transparent 1px 3px)", opacity: 0.5 + 0.5 * k("scanlines") }}
          aria-hidden
        />
      )}
      {fx.vhs.enabled && (
        <div
          className="fx-vhs-roll pointer-events-none absolute inset-0 mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(255,0,120,0.06) 0 2px, rgba(0,180,255,0.06) 2px 4px), linear-gradient(to bottom, rgba(255,255,255,0.12), transparent 6%, transparent 94%, rgba(255,255,255,0.12))",
            backgroundSize: "100% 100%, 100% 220%",
            opacity: 0.5 + 0.5 * k("vhs"),
          }}
          aria-hidden
        />
      )}
      {fx.filmGrain.enabled && (
        <div
          className="fx-grain pointer-events-none absolute inset-[-10%] mix-blend-overlay"
          style={{ backgroundImage: `url("${GRAIN_DATA_URI}")`, backgroundSize: "180px 180px", opacity: 0.25 + 0.55 * k("filmGrain") }}
          aria-hidden
        />
      )}
      {fx.lightLeaks.enabled && (
        <div
          className="fx-leak pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background: "radial-gradient(60% 50% at 85% 15%, rgba(255,170,80,0.85), transparent 60%), radial-gradient(50% 40% at 10% 90%, rgba(255,90,140,0.6), transparent 60%)",
            opacity: 0.35 + 0.55 * k("lightLeaks"),
          }}
          aria-hidden
        />
      )}
      {fx.prism.enabled && (
        <div
          className="fx-prism pointer-events-none absolute inset-0 mix-blend-screen"
          style={{
            background: "linear-gradient(115deg, rgba(255,0,0,0.35), rgba(255,255,0,0.35), rgba(0,255,120,0.35), rgba(0,180,255,0.35), rgba(180,0,255,0.35))",
            opacity: 0.3 + 0.5 * k("prism"),
          }}
          aria-hidden
        />
      )}
    </>
  );
}

/** A single overlay / PiP layer rendered with its blend mode over the frame. */
function OverlayVisual({ overlay, w, h }: { overlay: OverlayLayer; w: number; h: number }) {
  const isPip = overlay.kind === "pip";
  const boxW = isPip ? w * 0.42 * overlay.scale : w * overlay.scale;
  const boxH = isPip ? boxW * 1.3 : h * overlay.scale;
  return (
    <div
      className={cn("pointer-events-none absolute overflow-hidden", isPip ? "rounded-lg ring-2 ring-white/70 shadow-lg" : "rounded-none")}
      style={{
        left: `${overlay.x * 100}%`,
        top: `${overlay.y * 100}%`,
        width: boxW,
        height: boxH,
        transform: "translate(-50%, -50%)",
        opacity: overlay.opacity,
        background: overlaySwatch(overlay.hue),
        mixBlendMode: overlay.blend as React.CSSProperties["mixBlendMode"],
      }}
      aria-hidden
    >
      <span className="absolute left-1 top-1 rounded bg-black/50 px-1 text-[8px] font-medium text-white/90">
        {overlay.label}
      </span>
    </div>
  );
}

/** The visual effect of a single mask region (pointer-events none). */
function MaskVisual({ mask }: { mask: { kind: string; shape: string; x: number; y: number; w: number; h: number; intensity: number } }) {
  const base: React.CSSProperties = {
    left: `${mask.x * 100}%`,
    top: `${mask.y * 100}%`,
    width: `${mask.w * 100}%`,
    height: `${mask.h * 100}%`,
  };
  const radius = mask.shape === "ellipse" ? "9999px" : "8px";

  if (mask.kind === "spotlight") {
    // Darken everything outside the region.
    const a = (mask.intensity / 100) * 0.85;
    return (
      <div
        className="pointer-events-none absolute"
        style={{ ...base, borderRadius: radius, boxShadow: `0 0 0 9999px rgba(0,0,0,${a.toFixed(2)})` }}
        aria-hidden
      />
    );
  }
  if (mask.kind === "shape") {
    const a = (mask.intensity / 100) * 0.95;
    return (
      <div
        className="pointer-events-none absolute bg-black"
        style={{ ...base, borderRadius: radius, opacity: a }}
        aria-hidden
      />
    );
  }
  // blur / pixelate → backdrop blur (+ mosaic grid to imply pixelation)
  const blurPx = (mask.intensity / 100) * 14;
  const mosaic =
    mask.kind === "pixelate"
      ? {
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }
      : {};
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        ...base,
        borderRadius: radius,
        backdropFilter: `blur(${blurPx.toFixed(1)}px) contrast(${mask.kind === "pixelate" ? 1.1 : 1})`,
        WebkitBackdropFilter: `blur(${blurPx.toFixed(1)}px)`,
        ...mosaic,
      }}
      aria-hidden
    />
  );
}
