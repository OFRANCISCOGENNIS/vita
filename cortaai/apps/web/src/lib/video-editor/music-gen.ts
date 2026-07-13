// Gerador de trilhas ORIGINAIS no navegador (Web Audio) — música 100% livre de
// direitos autorais, sintetizada no aparelho e renderizada para WAV. Sem
// arquivos externos, sem chave, sem servidor. Cada preset é uma progressão de
// acordes + bateria simples, em loop por alguns compassos.

export interface MusicPreset {
  id: string;
  name: string;
  emoji: string;
  bpm: number;
  bars: number;
  chords: number[][]; // frequências (Hz) por acorde
  wave: OscillatorType;
  drums: boolean;
  bass: boolean;
}

// Notas base (Hz) para montar acordes.
const N = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, E5: 659.25, G5: 783.99,
};

export const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: "lofi",
    name: "Lo-fi",
    emoji: "🎧",
    bpm: 74,
    bars: 4,
    wave: "triangle",
    drums: true,
    bass: true,
    // Cmaj7 · Amin7 · Fmaj7 · G7
    chords: [
      [N.C4, N.E4, N.G4, N.B4],
      [N.A3, N.C4, N.E4, N.G4],
      [N.F3, N.A3, N.C4, N.E4],
      [N.G3, N.B3, N.D4, N.F4],
    ],
  },
  {
    id: "animada",
    name: "Animada",
    emoji: "⚡",
    bpm: 120,
    bars: 4,
    wave: "sawtooth",
    drums: true,
    bass: true,
    // progressão pop I–V–vi–IV em C
    chords: [
      [N.C4, N.E4, N.G4],
      [N.G3, N.B3, N.D4],
      [N.A3, N.C4, N.E4],
      [N.F3, N.A3, N.C4],
    ],
  },
  {
    id: "ambiente",
    name: "Ambiente",
    emoji: "🌌",
    bpm: 60,
    bars: 4,
    wave: "sine",
    drums: false,
    bass: false,
    chords: [
      [N.C4, N.G4, N.C5],
      [N.E4, N.B4, N.E5],
      [N.A3, N.E4, N.A4],
      [N.F3, N.C4, N.F4],
    ],
  },
  {
    id: "cinematica",
    name: "Cinemática",
    emoji: "🎬",
    bpm: 80,
    bars: 4,
    wave: "sine",
    drums: true,
    bass: true,
    // menor, tensão: Amin · Fmaj · Cmaj · Gmaj
    chords: [
      [N.A3, N.C4, N.E4, N.A4],
      [N.F3, N.A3, N.C4, N.F4],
      [N.C4, N.E4, N.G4, N.C5],
      [N.G3, N.B3, N.D4, N.G4],
    ],
  },
];

export interface GeneratedTrack {
  blob: Blob;
  durationMs: number;
  name: string;
}

/** Sintetiza o preset num AudioBuffer offline e devolve um WAV pronto. */
export async function generateTrack(presetId: string): Promise<GeneratedTrack | null> {
  const preset = MUSIC_PRESETS.find((p) => p.id === presetId);
  if (!preset || typeof window === "undefined") return null;
  const OfflineCtor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtor) return null;

  const sampleRate = 44100;
  const beat = 60 / preset.bpm; // segundos por batida
  const barDur = beat * 4;
  const total = barDur * preset.bars;
  const ctx = new OfflineCtor(2, Math.ceil(total * sampleRate), sampleRate);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // leve reverb por convolução (cauda de ruído decrescente) para dar "cola"
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 1.6, 2.2);
  const wet = ctx.createGain();
  wet.gain.value = preset.id === "ambiente" ? 0.5 : 0.22;
  conv.connect(wet).connect(master);

  for (let bar = 0; bar < preset.bars; bar++) {
    const t0 = bar * barDur;
    const chord = preset.chords[bar % preset.chords.length];

    // acordes (pad) — envelope suave, sustenta o compasso
    chord.forEach((freq, i) => {
      playTone(ctx, master, conv, {
        freq,
        wave: preset.wave,
        start: t0,
        dur: barDur * 0.98,
        gain: 0.14 - i * 0.015,
        attack: 0.08,
        release: 0.5,
      });
    });

    // baixo na fundamental, uma nota por batida
    if (preset.bass) {
      for (let b = 0; b < 4; b++) {
        playTone(ctx, master, null, {
          freq: chord[0] / 2,
          wave: "sine",
          start: t0 + b * beat,
          dur: beat * 0.9,
          gain: 0.22,
          attack: 0.01,
          release: 0.12,
        });
      }
    }

    // bateria: kick nas batidas, hat nas subdivisões
    if (preset.drums) {
      for (let b = 0; b < 4; b++) {
        if (b === 0 || b === 2 || preset.bpm >= 110) kick(ctx, master, t0 + b * beat);
        hat(ctx, master, t0 + b * beat + beat / 2, 0.05);
        if (preset.bpm >= 110) hat(ctx, master, t0 + b * beat, 0.03);
      }
    }
  }

  const rendered = await ctx.startRendering();
  return { blob: encodeWav(rendered), durationMs: Math.round(total * 1000), name: `${preset.name} (gerada)` };
}

// ---------------------------------------------------------------- síntese

interface ToneOpts {
  freq: number;
  wave: OscillatorType;
  start: number;
  dur: number;
  gain: number;
  attack: number;
  release: number;
}

function playTone(ctx: BaseAudioContext, out: AudioNode, send: AudioNode | null, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.wave;
  osc.frequency.value = o.freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, o.start);
  g.gain.linearRampToValueAtTime(o.gain, o.start + o.attack);
  g.gain.setValueAtTime(o.gain, o.start + Math.max(o.attack, o.dur - o.release));
  g.gain.linearRampToValueAtTime(0.0001, o.start + o.dur);
  osc.connect(g);
  g.connect(out);
  if (send) g.connect(send);
  osc.start(o.start);
  osc.stop(o.start + o.dur + 0.05);
}

function kick(ctx: BaseAudioContext, out: AudioNode, start: number): void {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, start);
  osc.frequency.exponentialRampToValueAtTime(48, start + 0.14);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  osc.connect(g).connect(out);
  osc.start(start);
  osc.stop(start + 0.2);
}

function hat(ctx: BaseAudioContext, out: AudioNode, start: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
  src.connect(hp).connect(g).connect(out);
  src.start(start);
  src.stop(start + 0.06);
}

function noiseBuffer(ctx: BaseAudioContext, dur: number): AudioBuffer {
  const len = Math.ceil(dur * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: BaseAudioContext, dur: number, decay: number): AudioBuffer {
  const len = Math.ceil(dur * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

// ---------------------------------------------------------------- WAV

function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const blockAlign = numCh * 2;
  const dataLen = len * blockAlign;
  const arr = new ArrayBuffer(44 + dataLen);
  const view = new DataView(arr);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(buffer.getChannelData(ch));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = channels[ch][i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}
