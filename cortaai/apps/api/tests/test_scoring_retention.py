"""Unit tests: viral score engine + retention index formula."""
from datetime import datetime, timedelta, timezone

from app.services.retention import build_retention_timeline, compute_retention_index
from app.services.scoring import compute_viral_score, hook_score, niche_fit_score
from app.workers.tasks_transcribe import words_from_text


def test_viral_score_bounds_and_breakdown():
    transcript = words_from_text(
        "Você sabia que 90% das pessoas erram isso? O segredo que ninguém te conta é surreal."
    )
    score, breakdown = compute_viral_score(transcript, 35.0, [3.0, 8.0, 15.0, 22.0, 30.0], "finanças")
    assert 0 <= score <= 100
    assert set(breakdown) == {"hook", "retention", "emotion", "nicheFit"}
    assert all(0 <= v <= 100 for v in breakdown.values())


def test_hook_score_rewards_hooks():
    hooked = words_from_text("Você sabia que ninguém te conta esse segredo?")
    flat = words_from_text("hoje vamos falar sobre alguns temas gerais do dia")
    assert hook_score(hooked) > hook_score(flat)


def test_niche_fit_peaks_at_average():
    at_avg = niche_fit_score(42, "finanças")
    far = niche_fit_score(300, "finanças")
    assert at_avg > 95
    assert far < at_avg


def test_retention_index_monotonic_in_engagement():
    now = datetime.now(timezone.utc)
    published = now - timedelta(hours=24)
    low = compute_retention_index(100_000, 100, 1_000, 50, published, now=now)
    high = compute_retention_index(100_000, 50_000, 8_000, 900, published, now=now)
    assert 0 <= low <= 100 and 0 <= high <= 100
    assert high > low


def test_retention_timeline_shape():
    timeline = build_retention_timeline(40, 80.0, "seed-video")
    assert len(timeline) == 40
    assert timeline[0]["second"] == 0
    assert timeline[0]["retentionPct"] == 100.0
    assert timeline[0]["marker"]  # pt-BR hook marker on second 0
    assert all(set(p) == {"second", "retentionPct", "marker"} for p in timeline)
    assert all(0 <= p["retentionPct"] <= 100 for p in timeline)
    # deterministic per seed
    assert timeline == build_retention_timeline(40, 80.0, "seed-video")
