"""yt-dlp wrapper: URL preview + download.

Real subprocess calls to the yt-dlp binary; every call degrades to a
deterministic mock when the binary or the network is unavailable so the app
keeps working offline.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse

_STANDARD_HEIGHTS = [2160, 1440, 1080, 720, 480, 360]


def _ytdlp_bin() -> str | None:
    return shutil.which("yt-dlp")


def detect_source_type(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    if "youtu" in host:
        return "youtube"
    if "twitch" in host:
        return "twitch"
    if "vimeo" in host:
        return "vimeo"
    return "youtube"


def _mock_preview(url: str) -> dict:
    """Deterministic preview derived from the URL hash (offline fallback)."""
    h = int(hashlib.sha256(url.encode()).hexdigest(), 16)
    duration = 600 + (h % 3000)  # 10–60 min
    channels = ["Canal Exemplo", "Podcast Brasil", "TechTalks BR", "Estúdio Criativo"]
    return {
        "title": f"Vídeo importado ({detect_source_type(url)})",
        "channel": channels[h % len(channels)],
        "duration_seconds": float(duration),
        "thumbnail_url": f"https://picsum.photos/seed/{h % 10000}/1280/720",
        "available_resolutions": ["2160p", "1440p", "1080p", "720p"],
        "mock": True,
    }


def url_preview(url: str, timeout: int = 20) -> dict:
    """`yt-dlp -J <url>` — metadata without downloading."""
    binary = _ytdlp_bin()
    if binary:
        try:
            proc = subprocess.run(
                [binary, "-J", "--no-warnings", "--no-playlist", url],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if proc.returncode == 0 and proc.stdout:
                info = json.loads(proc.stdout)
                heights = sorted(
                    {f.get("height") for f in info.get("formats", []) if f.get("height")}, reverse=True
                )
                resolutions = [f"{h}p" for h in heights if h in _STANDARD_HEIGHTS] or ["1080p", "720p"]
                return {
                    "title": info.get("title") or "Vídeo sem título",
                    "channel": info.get("channel") or info.get("uploader"),
                    "duration_seconds": float(info.get("duration") or 0),
                    "thumbnail_url": info.get("thumbnail"),
                    "available_resolutions": resolutions,
                    "mock": False,
                }
        except Exception:
            pass
    return _mock_preview(url)


def build_download_command(url: str, quality: str, output_path: str) -> list[str]:
    """Real yt-dlp download command (documented for the import worker):

        yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
               --merge-output-format mp4 -o out.mp4 <url>
    """
    height = quality.rstrip("p") or "1080"
    fmt = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
    return [
        _ytdlp_bin() or "yt-dlp",
        "-f", fmt,
        "--merge-output-format", "mp4",
        "--no-playlist",
        "--no-warnings",
        "-o", output_path,
        url,
    ]


def download(url: str, quality: str, output_path: str, timeout: int = 1800) -> dict:
    """Downloads the video; on failure writes a small placeholder file so the
    rest of the pipeline (transcribe/analyze/render) can proceed in mock mode."""
    cmd = build_download_command(url, quality, output_path)
    if _ytdlp_bin():
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
            if proc.returncode == 0 and Path(output_path).exists():
                return {"ok": True, "mock": False, "command": " ".join(cmd)}
        except Exception:
            pass
    # Mock fallback: placeholder file keeps the pipeline flowing offline.
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_bytes(b"CORTAAI_MOCK_VIDEO\x00" + url.encode())
    return {"ok": True, "mock": True, "command": " ".join(cmd)}
