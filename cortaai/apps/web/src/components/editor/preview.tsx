"use client";

// Central preview: instant aspect switch, platform safe-zone overlays, live
// caption/layer rendering over an animated placeholder "video" — plus the
// advanced effects (color grade, reframe, chroma key, masks, layer keyframes,
// speed) applied VISUALLY so the user sees every edit on the placeholder media.

import { Pause, Play } from "lucide-react";
import { PLATFORM_PRESETS, CAPTION_PRESETS } from "@/lib/presets";
import { cn, formatTimecode } from "@/lib/utils";
import {
  colorGradeToFilter,
  layerAnimAt,
  reframeAt,
  reframeTransform,
  reframeWindow,
  speedAt,
  temperatureWash,
  vignetteBackground,
  type LayerSample,
} from "@/lib/edit-visuals";
import { useEditorStore, type AspectRatio, type PlatformPresetId } from "@/store/editor";
import { ChromaCanvas } from "./chroma-canvas";
import { RegionOverlay, type Rect } from "./region-overlay";

const ASPECTS: { id: AspectRatio; label: string; ratio: number }[] = [
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
    togglePlay,
    apply,
    setReframe,
    updateMask,
    setSelectedMaskId,
  } = useEditorStore();
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

  const previewHeight = 420;
  const previewWidth = Math.round(previewHeight * aspect.ratio);

  // --- advanced effect derivations ---
  const grade = doc.colorGrade;
  const filter = colorGradeToFilter(grade);
  const wash = temperatureWash(grade);
  const vignette = vignetteBackground(grade);

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
    <div className="flex flex-col items-center gap-3">
      {/* Aspect + platform preset switchers */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div role="group" aria-label="Proporção do vídeo" className="flex gap-1 rounded-xl border border-line bg-surface-1 p-1">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => apply({ aspect: a.id })}
              aria-pressed={doc.aspect === a.id}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.aspect === a.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Preset de plataforma (safe zones)" className="flex gap-1 rounded-xl border border-line bg-surface-1 p-1">
          {PLATFORM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => apply({ platformPreset: doc.platformPreset === p.id ? null : (p.id as PlatformPresetId), aspect: "9:16" })}
              aria-pressed={doc.platformPreset === p.id}
              title={`${p.resolution} · máx ${p.maxDuration}`}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                doc.platformPreset === p.id ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white" : "text-zinc-400 hover:text-white",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Preview canvas */}
      <div
        className="relative overflow-hidden rounded-2xl border border-line bg-black shadow-2xl transition-all duration-300"
        style={{ width: previewWidth, height: previewHeight, maxWidth: "100%" }}
      >
        {/* Graded + reframed MEDIA layer */}
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
        </div>

        {/* Temperature/tint wash */}
        {wash && (
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ backgroundColor: wash.color, opacity: wash.opacity }}
            aria-hidden
          />
        )}
        {/* Vignette */}
        {vignette && <div className="pointer-events-none absolute inset-0" style={{ background: vignette }} aria-hidden />}

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
          className={cn(
            "absolute inset-x-3 text-center leading-tight transition-all",
            captionDef.previewClass,
            doc.captionPreset === "typewriter" && "caption-typewriter mx-auto w-fit max-w-full",
            doc.captionPreset === "gradientAnimated" && "caption-gradient-animated",
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
          {doc.captionStyle.censorProfanity ? captionText.replace(/\b(merda|porra|caralho)\b/gi, "****") : captionText}
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
      </div>

      <p className="font-mono text-xs text-zinc-500" aria-hidden>
        {formatTimecode(currentTime)} / {formatTimecode(duration)}
        {Math.abs(currentRate - 1) > 0.001 && <span className="ml-3 text-amber-400">{currentRate.toFixed(2)}x</span>}
        {preset && <span className="ml-3 text-zinc-600">{preset.resolution} · máx {preset.maxDuration}</span>}
      </p>
    </div>
  );
}

function maskLabel(kind: string): string {
  return kind === "blur" ? "Desfoque" : kind === "pixelate" ? "Pixel" : kind === "spotlight" ? "Holofote" : "Forma";
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
