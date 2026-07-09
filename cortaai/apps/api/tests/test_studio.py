"""ESTÚDIO IA — routes registered, generation lifecycle (inline worker),
seeded gallery, effect templates and generation→cut conversion."""
import time
import uuid


def _all_paths(app) -> set:
    paths = set()
    for r in app.routes:
        if type(r).__name__ == "_IncludedRouter":
            prefix = getattr(r.include_context, "prefix", "") or ""
            for rr in r.original_router.routes:
                paths.add(prefix + getattr(rr, "path", ""))
        else:
            paths.add(getattr(r, "path", None))
    return paths


def _register(client) -> str:
    email = f"studio-{uuid.uuid4().hex[:10]}@teste.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "senha12345", "name": "Criador Estúdio"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_studio_routes_registered():
    from app.main import app

    paths = _all_paths(app)
    expected = {
        "/api/v1/studio/text-to-video",
        "/api/v1/studio/image-to-video",
        "/api/v1/studio/extend",
        "/api/v1/studio/frames",
        "/api/v1/studio/motion-brush",
        "/api/v1/studio/lip-sync",
        "/api/v1/studio/camera",
        "/api/v1/studio/effect",
        "/api/v1/studio/generations",
        "/api/v1/studio/generations/{generation_id}",
        "/api/v1/studio/effect-templates",
        "/api/v1/studio/generations/{generation_id}/to-cut",
    }
    missing = expected - paths
    assert not missing, f"missing routes: {missing}"


def _wait_done(client, token, gen_id, timeout=8.0) -> dict:
    deadline = time.time() + timeout
    data = {}
    while time.time() < deadline:
        resp = client.get(f"/api/v1/studio/generations/{gen_id}", headers=_auth(token))
        assert resp.status_code == 200, resp.text
        data = resp.json()
        if data["status"] in ("done", "error"):
            return data
        time.sleep(0.2)
    return data


def test_text_to_video_creates_generation_and_runs_inline():
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        resp = client.post(
            "/api/v1/studio/text-to-video",
            headers=_auth(token),
            json={
                "prompt": "Um gato astronauta flutuando no espaço, estilo cinematográfico",
                "params": {"aspectRatio": "9:16", "duration": 5, "style": "cinematográfico", "cameraMovement": "zoom_in"},
            },
        )
        assert resp.status_code == 202, resp.text
        gen = resp.json()
        assert gen["function"] == "text_to_video"
        assert gen["status"] in ("queued", "running", "done")
        assert gen["params"]["aspectRatio"] == "9:16"

        done = _wait_done(client, token, gen["id"], timeout=30.0)
        assert done["status"] == "done", done
        assert done["progress"] == 100
        assert done["resultUrl"]
        assert done["thumbnailUrl"]
        # geração real com FFmpeg (ou "mock" caso o ffmpeg não exista no ambiente)
        assert done["model"] in ("ffmpeg", "mock")


def test_effect_templates_list():
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        resp = client.get("/api/v1/studio/effect-templates", headers=_auth(token))
        assert resp.status_code == 200
        templates = resp.json()["templates"]
        assert len(templates) == 6
        ids = {t["id"] for t in templates}
        assert "explodir" in ids
        assert all(t["thumbnailUrl"].startswith("data:image/svg+xml") for t in templates)


def test_generations_list_returns_seeded_items():
    from app.main import app
    from app.seed import DEMO_EMAIL, run_seed
    from fastapi.testclient import TestClient

    run_seed()  # idempotent — populates the demo user's studio gallery
    with TestClient(app) as client:
        login = client.post("/api/v1/auth/login", json={"email": DEMO_EMAIL, "password": "demo1234"})
        assert login.status_code == 200, login.text
        token = login.json()["token"]
        resp = client.get("/api/v1/studio/generations", headers=_auth(token))
        assert resp.status_code == 200
        gens = resp.json()
        assert len(gens) >= 4
        functions = {g["function"] for g in gens}
        assert {"text_to_video", "image_to_video", "effect_template"} & functions
        assert all(g["status"] == "done" for g in gens)


def test_generation_to_cut_creates_cut():
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        resp = client.post(
            "/api/v1/studio/text-to-video",
            headers=_auth(token),
            json={"prompt": "Ondas do mar em câmera lenta ao pôr do sol", "params": {"duration": 5}},
        )
        gen = resp.json()
        _wait_done(client, token, gen["id"], timeout=30.0)

        to_cut = client.post(
            f"/api/v1/studio/generations/{gen['id']}/to-cut", headers=_auth(token), json={}
        )
        assert to_cut.status_code == 201, to_cut.text
        cut = to_cut.json()
        assert cut["mode"] == "manual"
        assert cut["editState"]["source"] == "studio"
        assert cut["editState"]["generationId"] == gen["id"]


def test_studio_generation_is_unlimited():
    """Sem planos: não há teto de gerações no Estúdio IA — todas passam (202)."""
    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        for i in range(6):
            r = client.post(
                "/api/v1/studio/text-to-video",
                headers=_auth(token),
                json={"prompt": f"cena de teste {i}", "params": {"duration": 1}},
            )
            assert r.status_code == 202, r.text


def _probe_video(path):
    import subprocess

    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,width,height", "-of", "csv=p=0", path],
        capture_output=True, text=True,
    )
    return out.stdout.strip()


def _storage_path_for(result_url: str) -> str:
    """Resolve a URL/pseudo-URL de storage para o arquivo local (fallback)."""
    import os

    from app.services import storage

    key = result_url.split(f"/{storage.settings.s3_bucket}/", 1)[-1].split("?", 1)[0]
    return os.path.join(str(storage.LOCAL_FALLBACK_DIR), key)


def test_real_ffmpeg_output_text_to_video():
    """Com ffmpeg presente, text_to_video produz um .mp4 h264 NÃO-VAZIO."""
    import os
    import shutil

    import pytest

    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg ausente no ambiente")

    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        resp = client.post(
            "/api/v1/studio/text-to-video",
            headers=_auth(token),
            json={"prompt": "Ondas do mar em câmera lenta ao pôr do sol",
                  "params": {"aspectRatio": "9:16", "duration": 2}},
        )
        assert resp.status_code == 202, resp.text
        done = _wait_done(client, token, resp.json()["id"], timeout=40.0)
        assert done["status"] == "done", done
        assert done["model"] == "ffmpeg"
        path = _storage_path_for(done["resultUrl"])
        assert os.path.exists(path) and os.path.getsize(path) > 1000
        assert _probe_video(path).startswith("h264"), _probe_video(path)


def test_real_ffmpeg_output_image_to_video():
    """image_to_video também produz um .mp4 h264 real (fundo sintetizado quando a
    imagem de entrada não está acessível offline)."""
    import os
    import shutil

    import pytest

    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg ausente no ambiente")

    from app.main import app
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        token = _register(client)
        resp = client.post(
            "/api/v1/studio/image-to-video",
            headers=_auth(token),
            json={"inputAssetUrl": "https://picsum.photos/seed/estudio-x/720/1280",
                  "prompt": "dar vida ao retrato",
                  "params": {"motion": "moderado", "duration": 2, "cameraMovement": "zoom_in"}},
        )
        assert resp.status_code == 202, resp.text
        done = _wait_done(client, token, resp.json()["id"], timeout=40.0)
        assert done["status"] == "done", done
        assert done["model"] == "ffmpeg"
        path = _storage_path_for(done["resultUrl"])
        assert os.path.exists(path) and os.path.getsize(path) > 1000
        assert _probe_video(path).startswith("h264"), _probe_video(path)
