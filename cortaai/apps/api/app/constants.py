"""Product constants from the SPEC (niches, caption presets, platform presets)."""

# SPEC: seed niches of the Radar Viral
NICHES: list[str] = ["finanças", "fitness", "podcast", "humor", "educação", "tecnologia", "beleza", "games"]

PERIODS: list[str] = ["24h", "7d", "30d"]

# Mapa resolução -> altura em pixels (usado no pipeline de render; nunca faz upscale).
RESOLUTION_HEIGHT: dict[str, int] = {"720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160}

# SPEC: 8 caption presets
CAPTION_PRESETS: list[str] = [
    "hormozi",
    "karaoke",
    "neon",
    "minimal",
    "boldEmoji",
    "highlightBox",
    "typewriter",
    "gradientAnimated",
]

# SPEC: platform presets (safe zones live in the editor/frontend)
PLATFORM_PRESETS: dict[str, dict] = {
    "tiktok": {"width": 1080, "height": 1920, "max_duration": 600},
    "reels": {"width": 1080, "height": 1920, "max_duration": 90},
    "shorts": {"width": 1080, "height": 1920, "max_duration": 60},
}
