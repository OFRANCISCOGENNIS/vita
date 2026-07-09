"""Idempotent seed: demo/admin users, projects, cuts, Radar trend videos with
full Raio-X analyses and niche patterns. All user-facing content in pt-BR.

Run: `python -m app.seed` (or automatically on startup with SEED_ON_STARTUP=1).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa

from app.constants import NICHES, PERIODS
from app.database import SessionLocal, create_all_tables
from app.models import Cut, Generation, NicheAlert, Project, TrendVideo, User
from app.services import generative
from app.services.scoring import compute_viral_score
from app.services.security import hash_password
from app.workers.tasks_radar import compute_niche_patterns, ensure_analysis, upsert_trend_video
from app.workers.tasks_transcribe import words_from_text

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@cortaai.com"
ADMIN_EMAIL = "admin@cortaai.com"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def _seed_users(db) -> tuple[User, User]:
    demo = db.execute(sa.select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
    if demo is None:
        demo = User(
            email=DEMO_EMAIL,
            password_hash=hash_password("demo1234"),
            name="Ana Criadora",
            avatar_url="https://i.pravatar.cc/150?u=demo@cortaai.com",
            branding_kit={
                "logo_url": None,
                "font": "Montserrat",
                "colors": ["#7C3AED", "#F59E0B", "#0F172A"],
                "caption_preset": "hormozi",
            },
        )
        db.add(demo)

    admin = db.execute(sa.select(User).where(User.email == ADMIN_EMAIL)).scalar_one_or_none()
    if admin is None:
        admin = User(
            email=ADMIN_EMAIL,
            password_hash=hash_password("admin1234"),
            name="Equipe CortaAí",
        )
        db.add(admin)
    db.flush()

    if db.execute(sa.select(NicheAlert).where(NicheAlert.user_id == admin.id)).scalar_one_or_none() is None:
        db.add(NicheAlert(user_id=admin.id, niche="finanças", enabled=True))
    return demo, admin


# ---------------------------------------------------------------------------
# Projects + cuts
# ---------------------------------------------------------------------------

_PROJECTS = [
    {
        "title": "Podcast Visão de Dono #142 — Do zero ao primeiro milhão",
        "source_type": "youtube",
        "source_url": "https://www.youtube.com/watch?v=demo142",
        "duration_seconds": 5460.0,
        "resolution": "2160p",
        "fps": 30.0,
        "language": "pt-BR",
        "thumbnail_url": "https://picsum.photos/seed/podcast142/1280/720",
    },
    {
        "title": "Aula completa: investimentos em renda fixa para iniciantes",
        "source_type": "upload",
        "original_filename": "aula_renda_fixa_final.mp4",
        "duration_seconds": 3120.0,
        "resolution": "1080p",
        "fps": 30.0,
        "language": "pt-BR",
        "thumbnail_url": "https://picsum.photos/seed/rendafixa/1280/720",
    },
    {
        "title": "Live de games: speedrun comentado com convidados",
        "source_type": "twitch",
        "source_url": "https://www.twitch.tv/videos/demo9911",
        "duration_seconds": 7800.0,
        "resolution": "1080p",
        "fps": 60.0,
        "language": "pt-BR",
        "thumbnail_url": "https://picsum.photos/seed/speedrun/1280/720",
    },
]

# (project_index, start, mode, sentences pt-BR, best_post_time)
_CUTS = [
    (0, 312.0, "viral", "Você sabia que 90% dos negócios quebram por causa disso? Não é falta de cliente, não é falta de produto. É fluxo de caixa. Eu quebrei duas empresas antes de entender essa verdade simples. Quando eu finalmente organizei o caixa, o jogo virou completamente. Comenta EU QUERO que eu mando a planilha que eu uso até hoje.", "19:45"),
    (0, 1245.0, "viral", "O segredo que ninguém te conta sobre o primeiro milhão é que ele não vem de renda. Ele vem de equity, de participação, de ser dono. Salário nenhum te deixa rico, salário paga as contas. O que muda a sua vida é possuir um pedaço de algo que cresce enquanto você dorme.", "12:15"),
    (0, 2890.0, "qa", "Qual foi o maior erro da sua carreira? Sem dúvida foi não ter demitido rápido. Eu segurei uma pessoa tóxica por oito meses e quase perdi o time inteiro. A lição que fica é: contrate devagar, demita rápido. Parece frio, mas é o mais humano para todo mundo.", "18:30"),
    (0, 4100.0, "quotes", "Disciplina é escolher entre o que você quer agora e o que você quer mais. Todo dia você faz essa escolha, mesmo sem perceber.", "21:00"),
    (1, 180.0, "tutorial", "Pare de deixar dinheiro parado na poupança agora mesmo. Nesse vídeo eu te mostro o passo a passo para investir em renda fixa pagando o dobro. Primeiro passo: abra conta em uma corretora sem taxa. Segundo passo: procure CDBs com liquidez diária pagando pelo menos cem por cento do CDI. Terceiro passo: nunca invista sem olhar a garantia do FGC.", "07:30"),
    (1, 960.0, "viral", "Quanto rende um mil reais no CDB hoje? Mais do que você imagina. Com a taxa atual, em doze meses você teria cerca de cento e treze reais de rendimento bruto. Parece pouco? Agora multiplica isso por dez anos com aportes mensais. O resultado é surreal e eu vou te mostrar na tela.", "12:15"),
    (1, 2200.0, "tutorial", "O erro número um do iniciante é olhar só a rentabilidade e esquecer a liquidez. De que adianta seu dinheiro render bem se você não pode sacar quando precisa? Antes de investir, separe sua reserva de emergência em algo com liquidez diária. Só depois disso vá para prazos mais longos.", "18:30"),
    (2, 420.0, "viral", "Olha isso: a jogada mais insana que você vai ver hoje. Ele pulou o boss inteiro usando um glitch que estava no jogo desde 2019 e ninguém tinha percebido. O chat simplesmente explodiu nesse momento.", "21:00"),
    (2, 3300.0, "qa", "Como você treina para um speedrun? Todo mundo acha que é talento, mas é repetição. São seis horas por dia no mesmo trecho até a mão decorar o movimento. O segredo é dividir o jogo em pedaços pequenos e dominar um de cada vez.", "19:45"),
    (2, 6100.0, "quotes", "Perder o recorde por meio segundo dói, mas é exatamente essa dor que faz você voltar amanhã. Quem nunca perdeu nada nunca disputou nada.", "22:15"),
]

_CUT_NICHE = {0: "podcast", 1: "finanças", 2: "games"}


def _seed_projects_and_cuts(db, demo: User) -> None:
    existing = db.execute(sa.select(sa.func.count(Project.id)).where(Project.user_id == demo.id)).scalar_one()
    if existing:
        return  # idempotent: demo projects already present

    projects: list[Project] = []
    for i, p in enumerate(_PROJECTS):
        project = Project(
            user_id=demo.id,
            title=p["title"],
            source_type=p["source_type"],
            source_url=p.get("source_url"),
            original_filename=p.get("original_filename"),
            duration_seconds=p["duration_seconds"],
            resolution=p["resolution"],
            fps=p["fps"],
            language=p["language"],
            status="ready",
            thumbnail_url=p["thumbnail_url"],
            storage_key=f"projects/demo/{i}/source.mp4",
            created_at=_now() - timedelta(days=6 - i * 2),
        )
        db.add(project)
        projects.append(project)
    db.flush()

    for proj_idx, start, mode, text, post_time in _CUTS:
        transcript = words_from_text(text, start=start)
        end = transcript[-1]["end"] + 0.8
        niche = _CUT_NICHE[proj_idx]
        score, breakdown = compute_viral_score(transcript, end - start, niche=niche)
        from app.services import llm

        titles = llm.generate_titles(text, niche)
        cut = Cut(
            project_id=projects[proj_idx].id,
            title=titles[0],
            title_options=titles,
            description=llm.generate_description(text, niche),
            hashtags=llm.generate_hashtags(text, niche),
            start_seconds=start,
            end_seconds=round(end, 2),
            viral_score=score,
            score_breakdown=breakdown,
            transcript=transcript,
            mode=mode,
            best_post_time=post_time,
            status="suggested",
        )
        db.add(cut)


# ---------------------------------------------------------------------------
# Estúdio IA: gerações de exemplo (galeria populada em /app/estudio)
# ---------------------------------------------------------------------------

# (function, prompt pt-BR, params, input_asset_url)
_GENERATIONS = [
    (
        "text_to_video",
        "Um café fumegante numa mesa de madeira ao amanhecer, câmera aproximando lentamente, estilo cinematográfico",
        {"aspectRatio": "9:16", "duration": 5, "style": "cinematográfico", "cameraMovement": "zoom_in", "negativePrompt": "texto, marca d'água"},
        None,
    ),
    (
        "image_to_video",
        "Dar vida ao retrato: cabelos ao vento e olhar seguindo a câmera",
        {"motion": "moderado", "duration": 5, "cameraMovement": "orbit"},
        "https://picsum.photos/seed/estudio-retrato/720/1280",
    ),
    (
        "effect_template",
        None,
        {"template": "explodir"},
        "https://picsum.photos/seed/estudio-efeito/720/1280",
    ),
    (
        "lip_sync",
        None,
        {"source": "ttsText", "ttsText": "E aí, pessoal! Bem-vindos ao meu canal.", "voice": "pt-BR-Francisca", "language": "pt-BR"},
        "https://picsum.photos/seed/estudio-lipsync/720/1280",
    ),
    (
        "camera",
        "Passagem cinematográfica sobre a cidade ao entardecer",
        {"moves": [{"type": "dolly", "startSecond": 0, "endSecond": 2}, {"type": "orbit", "startSecond": 2, "endSecond": 5}]},
        "https://picsum.photos/seed/estudio-camera/1280/720",
    ),
    (
        "frames",
        "Transição suave do botão fechado para a flor totalmente aberta",
        {"duration": 5},
        "https://picsum.photos/seed/estudio-frame-a/720/1280",
    ),
]


def _seed_generations(db, demo: User) -> None:
    existing = db.execute(
        sa.select(sa.func.count(Generation.id)).where(Generation.user_id == demo.id)
    ).scalar_one()
    if existing:
        return  # idempotente: gerações demo já presentes

    for i, (function, prompt, params, asset) in enumerate(_GENERATIONS):
        second_asset = "https://picsum.photos/seed/estudio-frame-b/720/1280" if function == "frames" else None
        # Galeria de demonstração: clipes curtos (render rápido) — o shape dos
        # params originais é preservado no registro.
        render_params = {**params, "duration": 2, "seconds": 2}
        result = generative.run_generation(
            function, prompt, render_params, input_asset_url=asset, input_asset_url_2=second_asset
        )
        db.add(
            Generation(
                user_id=demo.id,
                function=function,
                prompt=prompt,
                params=params,
                input_asset_url=asset,
                input_asset_url_2=second_asset,
                status="done",
                progress=100,
                result_url=result["result_url"],
                thumbnail_url=result["thumbnail_url"],
                duration_seconds=result["duration_seconds"],
                resolution=result["resolution"],
                fps=result["fps"],
                model=result["model"],
                created_at=_now() - timedelta(hours=i * 5 + 1),
                finished_at=_now() - timedelta(hours=i * 5),
            )
        )


# ---------------------------------------------------------------------------
# Radar Viral: trend videos (2 per SPEC niche = 16) + Raio-X + patterns
# ---------------------------------------------------------------------------

_TRENDS = [
    # (niche, platform, title, channel, duration, views, like%, comment%, hours_ago)
    ("finanças", "youtube", "O erro que te mantém pobre (e ninguém te avisa)", "Primo Investidor", 42, 2_800_000, 0.062, 0.0048, 30),
    ("finanças", "tiktok", "Quanto rende 1.000 reais no CDB em 2026?", "Papo de Carteira", 38, 1_450_000, 0.055, 0.0039, 52),
    ("fitness", "youtube", "3 exercícios que valem por 1 hora de academia", "Treino do Zero", 34, 3_900_000, 0.071, 0.0051, 20),
    ("fitness", "instagram", "O que comer antes do treino (nutri responde)", "Nutri na Prática", 29, 980_000, 0.058, 0.0042, 65),
    ("podcast", "youtube", "Ele saiu das dívidas com UMA decisão | Corte", "Cortes Visão de Dono", 58, 2_100_000, 0.049, 0.0061, 26),
    ("podcast", "youtube", "A resposta que calou o estúdio inteiro", "Cortes do Prime", 47, 1_720_000, 0.053, 0.0055, 44),
    ("humor", "tiktok", "POV: sua mãe achou a boca do fogão suja", "Casa da Zueira", 21, 5_600_000, 0.089, 0.0072, 14),
    ("humor", "instagram", "Todo brasileiro no mercado já fez isso", "Rindo à Toa BR", 18, 3_200_000, 0.083, 0.0058, 38),
    ("educação", "youtube", "O truque de memorização que a escola esconde", "Aprova Fácil", 51, 1_100_000, 0.047, 0.0044, 58),
    ("educação", "tiktok", "Aprenda isso ANTES da sua próxima prova", "Professor Direto", 44, 890_000, 0.051, 0.0037, 70),
    ("tecnologia", "youtube", "Essa IA faz seu trabalho em 10 segundos", "Tech em Português", 39, 2_500_000, 0.057, 0.0049, 22),
    ("tecnologia", "youtube", "Pare de usar o ChatGPT do jeito ERRADO", "Futuro Agora", 46, 1_950_000, 0.052, 0.0046, 48),
    ("beleza", "instagram", "Skincare de 3 passos que funciona DE VERDADE", "Pele de Vidro", 27, 1_300_000, 0.076, 0.0053, 33),
    ("beleza", "tiktok", "O erro que envelhece sua pele 10 anos", "Glow Brasil", 31, 2_050_000, 0.069, 0.0047, 55),
    ("games", "youtube", "A jogada mais INSANA que você vai ver hoje", "Clipes do Momento", 24, 4_400_000, 0.081, 0.0066, 16),
    ("games", "tiktok", "Esse segredo estava no jogo desde 2019", "Speedrun BR", 33, 2_700_000, 0.064, 0.0058, 40),
]


def _seed_trends(db) -> None:
    now = _now()
    for i, (niche, platform, title, channel, duration, views, like_pct, comment_pct, hours_ago) in enumerate(_TRENDS):
        item = {
            "platform": platform,
            "external_id": f"seed-{niche}-{i:02d}",
            "url": f"https://www.youtube.com/shorts/seed{i:04d}" if platform == "youtube" else f"https://www.{platform}.com/@{channel.replace(' ', '').lower()}/video/seed{i:04d}",
            "title": title,
            "channel": channel,
            "thumbnail_url": f"https://picsum.photos/seed/trend{i}/720/1280",
            "niche": niche,
            "language": "pt-BR",
            "duration_seconds": float(duration),
            "views": views,
            "likes": int(views * like_pct),
            "comments": int(views * comment_pct),
            "published_at": (now - timedelta(hours=hours_ago)).isoformat(),
        }
        video = upsert_trend_video(db, item)
        ensure_analysis(db, video)  # full Raio-X: sound/image/structure + per-second retention timeline


def run_seed() -> None:
    create_all_tables()
    db = SessionLocal()
    try:
        demo, admin = _seed_users(db)
        _seed_projects_and_cuts(db, demo)
        _seed_generations(db, demo)
        _seed_trends(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    # niche patterns need the committed trend data
    for niche in NICHES:
        for period in PERIODS:
            try:
                compute_niche_patterns(niche, period)
            except Exception:
                logger.exception("Falha ao calcular padrões do nicho %s/%s", niche, period)

    logger.info("Seed concluído: usuários demo/admin, projetos, cortes, radar e padrões de nicho.")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_seed()
    print("Seed concluído com sucesso.")
