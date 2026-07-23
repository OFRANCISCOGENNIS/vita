"""LLM service: titles, descriptions, hashtags and the Raio-X textual report.

# INTEGRAÇÃO PAGA: OpenAI (OPENAI_API_KEY) ou Anthropic (ANTHROPIC_API_KEY).
When no key is configured — or any call fails — a deterministic mock keyed by
a hash of the input takes over, so the product works offline and tests are
stable. All prompt templates are documented module constants.
"""
from __future__ import annotations

import hashlib
import json

import httpx

from app.config import settings

# ---------------------------------------------------------------------------
# Prompt templates (module constants — the documented LLM contract)
# ---------------------------------------------------------------------------

TITLE_PROMPT = """Você é um copywriter especialista em vídeos curtos virais no Brasil.
Com base na transcrição abaixo (nicho: {niche}), gere exatamente 3 títulos em
português do Brasil com no máximo 60 caracteres cada, otimizados para CTR em
TikTok/Reels/Shorts. Use gatilhos de curiosidade sem clickbait mentiroso.
Responda APENAS um JSON: {{"titles": ["...", "...", "..."]}}

Transcrição:
{transcript}
"""

DESCRIPTION_PROMPT = """Você é um social media brasileiro. Escreva uma descrição curta
(máx. 300 caracteres) em português do Brasil para um vídeo curto do nicho {niche},
terminando com uma chamada para ação. Baseie-se na transcrição:
{transcript}

Responda APENAS um JSON: {{"description": "..."}}
"""

HASHTAGS_PROMPT = """Gere de 5 a 8 hashtags em português do Brasil para um vídeo curto
do nicho {niche} com esta transcrição:
{transcript}

Misture hashtags amplas (#fy, #viral) e específicas do nicho.
Responda APENAS um JSON: {{"hashtags": ["#...", "#..."]}}
"""

XRAY_REPORT_PROMPT = """Você é um analista de conteúdo viral. Dado o vídeo em alta
abaixo (título: {title}, nicho: {niche}, duração: {duration}s), produza o
relatório Raio-X em JSON EXATAMENTE neste shape (contrato do produto):

{{
  "sound": {{"track": str, "trackTrending": bool, "bpm": int, "energy": float,
            "soundEffects": [str], "voice": {{"wordsPerMinute": int, "pauses": str, "tone": str}},
            "strategicSilences": [{{"atSecond": int, "durationMs": int}}]}},
  "image": {{"cutsPerMinute": int, "zoomPunches": int, "dominantPalette": [str],
            "captions": {{"present": bool, "style": str, "position": str}},
            "onScreenText": bool, "lighting": str, "framing": str}},
  "structure": {{"hookType": str, "hookText": str, "narrativeArc": str,
                "idealDuration": int, "cta": str, "perfectLoop": bool}}
}}

Todos os textos em português do Brasil. Responda APENAS o JSON.
"""

# ---------------------------------------------------------------------------
# Deterministic mock content (pt-BR)
# ---------------------------------------------------------------------------

_MOCK_TITLE_TEMPLATES = [
    "O segredo que ninguém te conta sobre {topic}",
    "Pare de errar em {topic} (faça isso)",
    "{topic}: o erro que custa caro",
    "Como dominar {topic} em 30 segundos",
    "A verdade sobre {topic} que mudou tudo",
    "3 passos para {topic} sem sofrimento",
    "Você está fazendo {topic} errado",
    "Isso vai mudar como você vê {topic}",
    "{topic} explicado como ninguém explicou",
]

_MOCK_TOPICS = {
    "finanças": "investimentos",
    "fitness": "treino",
    "podcast": "essa conversa",
    "humor": "essa história",
    "educação": "esse conteúdo",
    "tecnologia": "essa tecnologia",
    "beleza": "skincare",
    "games": "esse jogo",
}

_MOCK_HASHTAGS = {
    "finanças": ["#finanças", "#investimentos", "#dinheiro", "#rendaextra", "#educacaofinanceira"],
    "fitness": ["#fitness", "#treino", "#academia", "#hipertrofia", "#vidasaudavel"],
    "podcast": ["#podcast", "#cortespodcast", "#entrevista", "#papodevisao"],
    "humor": ["#humor", "#comedia", "#risada", "#zueira"],
    "educação": ["#educacao", "#aprenda", "#estudos", "#conhecimento"],
    "tecnologia": ["#tecnologia", "#tech", "#inteligenciaartificial", "#inovacao"],
    "beleza": ["#beleza", "#skincare", "#makeup", "#autocuidado"],
    "games": ["#games", "#gamer", "#gameplay", "#twitchbrasil"],
}
_BROAD_HASHTAGS = ["#fy", "#foryou", "#viral", "#brasil"]

_MOCK_CTAS = [
    "Comenta EU QUERO que eu te mando o material!",
    "Segue o canal para a parte 2!",
    "Salva esse vídeo para não esquecer!",
    "Compartilha com alguém que precisa ver isso!",
]


def _seed(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest(), 16)


def _pick(items: list, seed: int, offset: int = 0):
    return items[(seed + offset) % len(items)]


def _has_llm_key() -> bool:
    return bool(settings.openai_api_key or settings.anthropic_api_key)


def _call_llm(prompt: str, max_tokens: int = 800) -> str | None:
    """Real LLM call. # INTEGRAÇÃO PAGA: OpenAI / Anthropic."""
    try:
        if settings.anthropic_api_key:
            # INTEGRAÇÃO PAGA: Anthropic Messages API
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-3-5-haiku-latest",
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]
        if settings.openai_api_key:
            # INTEGRAÇÃO PAGA: OpenAI Chat Completions
            resp = httpx.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception:
        return None
    return None


def _parse_json(text: str | None) -> dict | None:
    if not text:
        return None
    try:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_titles(transcript_text: str, niche: str | None = None) -> list[str]:
    """3 title options (SPEC: cuts.title_options = string[3])."""
    if _has_llm_key():
        parsed = _parse_json(_call_llm(TITLE_PROMPT.format(niche=niche or "geral", transcript=transcript_text[:2000])))
        if parsed and isinstance(parsed.get("titles"), list) and len(parsed["titles"]) >= 3:
            return [str(t)[:80] for t in parsed["titles"][:3]]
    seed = _seed("titles", transcript_text[:120], niche or "")
    topic = _MOCK_TOPICS.get(niche or "", "esse assunto")
    return [
        _pick(_MOCK_TITLE_TEMPLATES, seed, i * 3).format(topic=topic) for i in range(3)
    ]


def generate_description(transcript_text: str, niche: str | None = None) -> str:
    if _has_llm_key():
        parsed = _parse_json(
            _call_llm(DESCRIPTION_PROMPT.format(niche=niche or "geral", transcript=transcript_text[:2000]))
        )
        if parsed and parsed.get("description"):
            return str(parsed["description"])[:400]
    seed = _seed("desc", transcript_text[:120], niche or "")
    topic = _MOCK_TOPICS.get(niche or "", "esse assunto")
    cta = _pick(_MOCK_CTAS, seed)
    return (
        f"Nesse corte você descobre o essencial sobre {topic} — direto ao ponto, "
        f"sem enrolação. {cta}"
    )


def generate_hashtags(transcript_text: str, niche: str | None = None) -> list[str]:
    if _has_llm_key():
        parsed = _parse_json(
            _call_llm(HASHTAGS_PROMPT.format(niche=niche or "geral", transcript=transcript_text[:2000]))
        )
        if parsed and isinstance(parsed.get("hashtags"), list) and parsed["hashtags"]:
            return [str(h) for h in parsed["hashtags"][:8]]
    seed = _seed("tags", transcript_text[:120], niche or "")
    niche_tags = _MOCK_HASHTAGS.get(niche or "", ["#conteudo", "#dicas"])
    broad = [_pick(_BROAD_HASHTAGS, seed), _pick(_BROAD_HASHTAGS, seed, 1)]
    return list(dict.fromkeys(niche_tags + broad))[:8]


def generate_xray(title: str, niche: str, duration_seconds: int, seed_key: str | None = None) -> dict:
    """Raio-X blocks {sound, image, structure} in the exact SPEC jsonb shapes."""
    if _has_llm_key():
        parsed = _parse_json(
            _call_llm(
                XRAY_REPORT_PROMPT.format(title=title, niche=niche, duration=duration_seconds),
                max_tokens=1200,
            )
        )
        if parsed and all(k in parsed for k in ("sound", "image", "structure")):
            return parsed

    seed = _seed("xray", seed_key or title, niche)
    tracks = [
        "Funk Instrumental Acelerado", "Phonk Brasileiro 2026", "Lo-fi Tenso",
        "Beat Motivacional Épico", "Trap Melódico BR", "Eletrônica Minimalista",
    ]
    hooks = [
        ("pergunta", "Você sabia que 90% das pessoas erram isso?"),
        ("afirmação polêmica", "Tudo o que te ensinaram sobre isso está errado."),
        ("promessa", "Em 30 segundos você nunca mais vai errar isso."),
        ("história", "Isso aconteceu comigo e mudou tudo."),
        ("número", "3 erros que estão te custando caro agora."),
    ]
    hook_type, hook_text = hooks[seed % len(hooks)]
    palettes = [
        ["#111827", "#F59E0B", "#FFFFFF"],
        ["#0F172A", "#22D3EE", "#F8FAFC"],
        ["#1C1917", "#EF4444", "#FAFAF9"],
        ["#052E16", "#84CC16", "#FFFFFF"],
    ]
    styles = ["hormozi", "karaoke", "neon", "minimal", "boldEmoji", "highlightBox", "typewriter", "gradientAnimated"]
    return {
        "sound": {
            "track": _pick(tracks, seed),
            "trackTrending": seed % 3 != 0,
            "bpm": 100 + seed % 60,
            "energy": round(0.55 + (seed % 40) / 100.0, 2),
            "soundEffects": _pick([["whoosh", "ding"], ["riser", "impact"], ["vinyl stop", "pop"]], seed),
            "voice": {
                "wordsPerMinute": 150 + seed % 40,
                "pauses": _pick(["estratégicas", "raras", "frequentes e curtas"], seed),
                "tone": _pick(["enérgico", "confiante", "próximo e casual", "urgente"], seed),
            },
            "strategicSilences": [{"atSecond": 3 + seed % 10, "durationMs": 600 + (seed % 5) * 100}],
        },
        "image": {
            "cutsPerMinute": 14 + seed % 18,
            "zoomPunches": 3 + seed % 7,
            "dominantPalette": _pick(palettes, seed),
            "captions": {
                "present": True,
                "style": _pick(styles, seed),
                "position": _pick(["centro", "terço inferior", "abaixo do rosto"], seed),
            },
            "onScreenText": seed % 4 != 0,
            "lighting": _pick(["alta, fundo escuro", "natural, luz de janela", "ring light frontal"], seed),
            "framing": _pick(["close", "meio corpo", "close com b-roll"], seed),
        },
        "structure": {
            "hookType": hook_type,
            "hookText": hook_text,
            "narrativeArc": _pick(
                ["promessa → prova → virada → CTA", "problema → agitação → solução → CTA", "história → lição → CTA"],
                seed,
            ),
            "idealDuration": max(15, min(int(duration_seconds), 90)),
            "cta": _pick(["comenta EU QUERO", "segue para a parte 2", "salva esse vídeo", "manda pra quem precisa"], seed),
            "perfectLoop": seed % 2 == 0,
        },
    }
