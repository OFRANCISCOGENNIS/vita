"""Viral score engine.

Heuristic (documented):

    viral_score = 0.35*hook + 0.30*retention + 0.20*emotion + 0.15*nicheFit

- hook      — strength of the first ~3 seconds of transcript: interrogatives,
              curiosity triggers ("ninguém te conta", "segredo"), numbers,
              direct address ("você"). Hooks are the #1 retention lever in
              short-form video.
- retention — estimated watch-through: audio energy peaks density (peaks keep
              attention) + penalty for flat stretches longer than 8s.
- emotion   — emotional vocabulary density across the whole transcript
              (surprise, money, fear, humor markers in pt-BR).
- nicheFit  — how close the cut duration is to the niche's average viral
              duration (gaussian falloff, sigma = 40% of the target).

All components are 0–100. The breakdown is persisted in cuts.score_breakdown
as {hook, retention, emotion, nicheFit} (SPEC contract).
"""
from __future__ import annotations

import math
import re

# pt-BR curiosity/hook triggers weighted by strength
HOOK_TRIGGERS: dict[str, float] = {
    "você sabia": 22,
    "ninguém te conta": 25,
    "ninguém fala": 22,
    "segredo": 18,
    "o erro": 18,
    "erro": 12,
    "pare de": 16,
    "nunca faça": 18,
    "como eu": 14,
    "como fazer": 12,
    "por que": 12,
    "quanto": 10,
    "olha isso": 14,
    "atenção": 10,
    "cuidado": 10,
    "você": 6,
    "grátis": 10,
    "dinheiro": 8,
}

EMOTION_WORDS = [
    "incrível", "absurdo", "chocante", "inacreditável", "nunca", "sempre",
    "medo", "raiva", "amor", "ódio", "rico", "pobre", "milhão", "milionário",
    "falência", "sonho", "pesadelo", "viral", "explodiu", "surreal", "louco",
    "perigoso", "proibido", "urgente", "agora", "último", "primeiro", "melhor",
    "pior", "gratuito", "de graça", "segredo", "verdade", "mentira",
]

# Average viral duration per niche (seconds) — refreshed by niche_patterns.
DEFAULT_NICHE_DURATION: dict[str, float] = {
    "finanças": 42,
    "fitness": 35,
    "podcast": 55,
    "humor": 22,
    "educação": 48,
    "tecnologia": 40,
    "beleza": 30,
    "games": 28,
}
FALLBACK_NICHE_DURATION = 38.0


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def transcript_to_text(transcript: list[dict] | None, start: float | None = None, end: float | None = None) -> str:
    if not transcript:
        return ""
    words = [
        w.get("word", "")
        for w in transcript
        if (start is None or w.get("start", 0) >= start) and (end is None or w.get("end", 0) <= end)
    ]
    return " ".join(words)


def hook_score(transcript: list[dict] | None) -> float:
    """First ~3s of speech scanned for hook triggers; questions get a bonus."""
    if not transcript:
        return 35.0
    first = transcript[0].get("start", 0.0) if transcript else 0.0
    head = transcript_to_text(transcript, start=None, end=first + 3.5).lower()
    full_head = transcript_to_text(transcript)[:200].lower()
    score = 30.0
    for trigger, weight in HOOK_TRIGGERS.items():
        if trigger in head:
            score += weight
        elif trigger in full_head:
            score += weight * 0.4
    if "?" in head or re.search(r"\b(o que|por que|quanto|como|qual)\b", head):
        score += 12
    if re.search(r"\d", head):
        score += 8  # numbers are concrete, concrete hooks retain
    return _clamp(score)


def retention_score(audio_energy_peaks: list[float] | None, duration_seconds: float) -> float:
    """Density of audio energy peaks vs duration. Target: >= 1 peak / 6s.
    A stretch longer than 8s without a peak is penalized (attention dip)."""
    duration = max(duration_seconds, 1.0)
    if not audio_energy_peaks:
        return 55.0
    peaks = sorted(p for p in audio_energy_peaks if 0 <= p <= duration)
    density = len(peaks) / (duration / 6.0)
    score = _clamp(45 + 40 * min(density, 1.6))
    gaps = [b - a for a, b in zip([0.0, *peaks], [*peaks, duration])]
    flat_penalty = sum(4 for g in gaps if g > 8.0)
    return _clamp(score - flat_penalty)


def emotion_score(transcript: list[dict] | None) -> float:
    text = transcript_to_text(transcript).lower()
    if not text:
        return 40.0
    n_words = max(len(text.split()), 1)
    hits = sum(text.count(w) for w in EMOTION_WORDS)
    density = hits / n_words  # emotional words per word
    return _clamp(35 + density * 900)


def niche_fit_score(duration_seconds: float, niche: str | None, niche_avg_duration: float | None = None) -> float:
    """Gaussian falloff around the niche average duration (sigma = 40%)."""
    target = niche_avg_duration or DEFAULT_NICHE_DURATION.get(niche or "", FALLBACK_NICHE_DURATION)
    sigma = max(target * 0.4, 5.0)
    return _clamp(100.0 * math.exp(-((duration_seconds - target) ** 2) / (2 * sigma**2)))


def compute_viral_score(
    transcript: list[dict] | None,
    duration_seconds: float,
    audio_energy_peaks: list[float] | None = None,
    niche: str | None = None,
    niche_avg_duration: float | None = None,
) -> tuple[float, dict]:
    """Returns (viral_score 0–100, score_breakdown per SPEC)."""
    hook = hook_score(transcript)
    retention = retention_score(audio_energy_peaks, duration_seconds)
    emotion = emotion_score(transcript)
    fit = niche_fit_score(duration_seconds, niche, niche_avg_duration)
    total = 0.35 * hook + 0.30 * retention + 0.20 * emotion + 0.15 * fit
    breakdown = {
        "hook": round(hook, 1),
        "retention": round(retention, 1),
        "emotion": round(emotion, 1),
        "nicheFit": round(fit, 1),
    }
    return round(_clamp(total), 1), breakdown
