// Types mirroring SPEC.md entities (contract between apps/web and apps/api).

export type CaptionPresetId =
  | "hormozi"
  | "karaoke"
  | "neon"
  | "minimal"
  | "boldEmoji"
  | "highlightBox"
  | "typewriter"
  | "gradientAnimated";

export type Niche =
  | "finanças"
  | "fitness"
  | "podcast"
  | "humor"
  | "educação"
  | "tecnologia"
  | "beleza"
  | "games";

export type Platform = "youtube" | "tiktok" | "instagram";
export type SourceType = "upload" | "youtube" | "twitch" | "vimeo";
export type Resolution = "720p" | "1080p" | "1440p" | "2160p";
export type Language = "pt-BR" | "en" | "es" | "auto";
export type ProjectStatus = "importing" | "transcribing" | "analyzing" | "ready" | "error";
export type CutMode = "viral" | "qa" | "tutorial" | "quotes" | "manual";
export type CutStatus = "suggested" | "edited" | "rendering" | "rendered";
export type JobType = "import" | "transcribe" | "analyze" | "render" | "radar_scan";
export type JobStatus = "queued" | "running" | "done" | "error";
export type TrendPeriod = "24h" | "7d" | "30d";

export interface BrandingKit {
  logoUrl: string | null;
  font: string;
  colors: string[];
  captionPreset: CaptionPresetId;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  googleId: string | null;
  brandingKit: BrandingKit;
  isAdmin?: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  originalFilename: string | null;
  durationSeconds: number;
  resolution: Resolution;
  fps: number;
  language: Language;
  status: ProjectStatus;
  thumbnailUrl: string;
  storageKey: string;
  createdAt: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  speaker: string;
}

export interface ScoreBreakdown {
  hook: number;
  retention: number;
  emotion: number;
  nicheFit: number;
}

export interface SuggestedSound {
  track: string;
  reason: string;
  trendVideoId: string;
}

export interface Cut {
  id: string;
  projectId: string;
  title: string;
  titleOptions: string[]; // 3 magnetic title options
  description: string;
  hashtags: string[];
  startSeconds: number;
  endSeconds: number;
  viralScore: number; // 0-100
  scoreBreakdown: ScoreBreakdown;
  transcript: TranscriptWord[];
  mode: CutMode;
  suggestedSound: SuggestedSound;
  bestPostTime: string;
  status: CutStatus;
  editState: Record<string, unknown> | null;
  createdAt: string;
}

export interface Job {
  id: string;
  userId: string;
  projectId: string | null;
  cutId: string | null;
  type: JobType;
  status: JobStatus;
  progress: number;
  etaSeconds: number | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  finishedAt: string | null;
}

export interface TrendVideo {
  id: string;
  platform: Platform;
  externalId: string;
  url: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  niche: Niche;
  language: Language;
  durationSeconds: number;
  views: number;
  viewsPerHour: number;
  likes: number;
  comments: number;
  publishedAt: string;
  retentionIndex: number; // 0-100
  fetchedAt: string;
}

// --- Raio-X jsonb shapes (exact contract from SPEC.md) ---

export interface XraySound {
  track: string;
  trackTrending: boolean;
  bpm: number;
  energy: number;
  soundEffects: string[];
  voice: { wordsPerMinute: number; pauses: string; tone: string };
  strategicSilences: { atSecond: number; durationMs: number }[];
}

export interface XrayImage {
  cutsPerMinute: number;
  zoomPunches: number;
  dominantPalette: string[];
  captions: { present: boolean; style: CaptionPresetId | string; position: string };
  onScreenText: boolean;
  lighting: string;
  framing: string;
}

export interface XrayStructure {
  hookType: string;
  hookText: string;
  narrativeArc: string;
  idealDuration: number;
  cta: string;
  perfectLoop: boolean;
}

export interface RetentionPoint {
  second: number;
  retentionPct: number;
  marker: string | null;
}

export interface TrendAnalysis {
  id: string;
  trendVideoId: string;
  sound: XraySound;
  image: XrayImage;
  structure: XrayStructure;
  retentionTimeline: RetentionPoint[];
  generatedAt: string;
}

export interface NichePattern {
  id: string;
  niche: Niche;
  period: TrendPeriod;
  avgDuration: number;
  topCaptionStyles: { style: CaptionPresetId | string; sharePct: number }[];
  trendingSounds: { track: string; usedBy: number; growthPct: number }[];
  topHooks: { hook: string; occurrences: number }[];
  bestPostTimes: { day: string; hour: number; score: number }[];
  computedAt: string;
}

export interface NicheAlert {
  id: string;
  userId: string;
  niche: Niche;
  enabled: boolean;
  lastNotifiedAt: string | null;
}

export interface UsagePoint {
  date: string;
  minutes: number;
  cuts: number;
}

export interface DashboardStats {
  minutesProcessed: number;
  cutsGenerated: number;
  recentProjects: Project[];
  usageSeries: UsagePoint[];
  nicheHighlights: TrendVideo[];
}

export interface UrlPreview {
  title: string;
  channel: string;
  durationSeconds: number;
  thumbnailUrl: string;
  availableResolutions: Resolution[];
}

export interface RenderResult {
  downloadUrl: string;
  srtUrl: string;
  thumbUrl: string;
  metaTxtUrl: string;
}

export interface PlatformPreset {
  id: "tiktok" | "reels" | "shorts";
  name: string;
  resolution: string;
  maxDuration: string;
  safeZone: { top: number; bottom: number; left: number; right: number };
}

export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  minutesProcessedToday: number;
  rendersQueued: number;
  errorRatePct: number;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  projectsCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ESTÚDIO IA — geração de vídeo por IA. Contrato do APÊNDICE de SPEC.md.
// A geração roda no nosso próprio motor de vídeo (FFmpeg), sem chave e sem
// custo. O frontend entrega a UI + o ponto de integração com fallback local.
// ---------------------------------------------------------------------------

export type StudioFunction =
  | "text_to_video"
  | "image_to_video"
  | "extend"
  | "frames"
  | "motion_brush"
  | "lip_sync"
  | "camera"
  | "effect_template";

export type StudioAspectRatio = "9:16" | "1:1" | "16:9" | "4:5";
export type StudioStyle = "cinematográfico" | "anime" | "realista" | "3D";
/** Movimento de câmera simples (usado em texto→vídeo e imagem→vídeo). */
export type CameraMovement = "none" | "zoom_in" | "orbit" | "pan_left";
export type MotionIntensity = "sutil" | "moderado" | "intenso";
export type ExtendDirection = "forward" | "loop";
export type LipSyncSource = "ttsText" | "audioUrl";
/** Tipos de movimento na timeline de câmera (mais completos). */
export type CameraMoveType = "zoom_in" | "pan_left" | "orbit" | "tilt_up" | "dolly";
export type EffectTemplateId =
  | "explodir"
  | "abraco"
  | "envelhecer"
  | "transformar"
  | "derreter"
  | "inflar";

// --- params jsonb por função (contrato exato de SPEC.md) ---

export interface TextToVideoParams {
  aspectRatio: StudioAspectRatio;
  duration: number;
  style: StudioStyle;
  cameraMovement: CameraMovement;
  negativePrompt: string;
}

export interface ImageToVideoParams {
  motion: MotionIntensity;
  duration: number;
  cameraMovement: CameraMovement;
}

export interface ExtendParams {
  seconds: number;
  direction: ExtendDirection;
}

export interface FramesParams {
  duration: number;
}

export interface MotionBrushStroke {
  path: [number, number][]; // pontos normalizados 0-1 sobre a imagem
  direction: [number, number]; // vetor de direção do movimento
  intensity: number; // 0-1
}

export interface MotionBrushParams {
  strokes: MotionBrushStroke[];
  duration: number;
}

export interface LipSyncParams {
  source: LipSyncSource;
  ttsText: string;
  voice: string;
  language: string;
}

export interface CameraMove {
  type: CameraMoveType;
  startSecond: number;
  endSecond: number;
}

export interface CameraParams {
  moves: CameraMove[];
}

export interface EffectTemplateParams {
  template: EffectTemplateId;
}

export type GenerationParams =
  | TextToVideoParams
  | ImageToVideoParams
  | ExtendParams
  | FramesParams
  | MotionBrushParams
  | LipSyncParams
  | CameraParams
  | EffectTemplateParams;

export interface Generation {
  id: string;
  userId: string;
  projectId: string | null;
  cutId: string | null;
  function: StudioFunction;
  prompt: string | null;
  params: GenerationParams;
  inputAssetUrl: string | null;
  inputAssetUrl2: string | null; // frames início/fim
  status: JobStatus; // queued | running | done | error
  progress: number; // 0-100
  errorMessage: string | null;
  resultUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
  resolution: string;
  fps: number;
  model: "kling-v1" | "mock";
  createdAt: string;
  finishedAt: string | null;
}

export interface EffectTemplate {
  id: EffectTemplateId;
  label: string;
  thumbnailUrl: string;
  previewUrl: string;
}
