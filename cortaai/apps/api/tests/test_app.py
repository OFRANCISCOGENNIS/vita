"""Sanity: app imports, routes registered, auth flow, error envelope.

Sem planos/cobrança: todo recurso é ilimitado para qualquer usuário autenticado
(sem 402/upgrade_required, sem rotas de billing)."""
import uuid


def _all_paths(app) -> set:
    """Flattens routes (FastAPI >= 0.130 wraps include_router lazily)."""
    paths = set()
    for r in app.routes:
        if type(r).__name__ == "_IncludedRouter":
            prefix = getattr(r.include_context, "prefix", "") or ""
            for rr in r.original_router.routes:
                paths.add(prefix + getattr(rr, "path", ""))
        else:
            paths.add(getattr(r, "path", None))
    return paths


def test_app_imports_and_routes_registered():
    from app.main import app

    paths = _all_paths(app)
    expected = {
        "/healthz",
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/google",
        "/api/v1/auth/password-reset",
        "/api/v1/auth/me",
        "/api/v1/radar/trends",
        "/api/v1/radar/videos/{video_id}",
        "/api/v1/radar/videos/{video_id}/xray",
        "/api/v1/radar/niches",
        "/api/v1/radar/niches/{niche}/patterns",
        "/api/v1/radar/alerts",
        "/api/v1/radar/videos/{video_id}/use-sound",
        "/api/v1/radar/videos/{video_id}/use-caption-style",
        "/api/v1/radar/videos/{video_id}/inspire-cut",
        "/api/v1/projects/upload-init",
        "/api/v1/projects/upload-complete",
        "/api/v1/projects/import-url",
        "/api/v1/projects/url-preview",
        "/api/v1/projects",
        "/api/v1/projects/{project_id}",
        "/api/v1/projects/{project_id}/generate-cuts",
        "/api/v1/projects/{project_id}/cuts",
        "/api/v1/cuts/{cut_id}",
        "/api/v1/cuts/{cut_id}/regenerate",
        "/api/v1/renders",
        "/api/v1/renders/{job_id}",
        "/api/v1/renders/batch-zip",
        "/api/v1/dashboard/stats",
        "/api/v1/admin/metrics",
        "/api/v1/admin/users",
        "/api/v1/admin/jobs",
        "/api/v1/ws/progress/{job_id}",
    }
    missing = expected - paths
    assert not missing, f"missing routes: {missing}"
    # billing/payments foram removidos por completo
    assert not [p for p in paths if p and "billing" in p]


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_error_envelope_unauthorized(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"] == "unauthorized"
    assert isinstance(body["error"]["message"], str)


def _register(client) -> tuple[str, dict]:
    email = f"user-{uuid.uuid4().hex[:10]}@teste.com"
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "senha12345", "name": "Usuária Teste"},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    # sem planos: o campo plan não existe mais no schema do usuário
    assert "plan" not in data["user"]
    assert "minutesUsedMonth" not in data["user"]
    return data["token"], data["user"]


def test_register_login_me(client):
    token, user = _register(client)
    login = client.post(
        "/api/v1/auth/login", json={"email": user["email"], "password": "senha12345"}
    )
    assert login.status_code == 200
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == user["email"]


def test_xray_no_plan_gate_returns_404_for_missing(client):
    """Raio-X liberado para todos: um vídeo inexistente dá 404 (não 402)."""
    token, _ = _register(client)
    resp = client.get(
        f"/api/v1/radar/videos/{uuid.uuid4()}/xray", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_full_xray_available_to_everyone(client):
    """Com dados seed, qualquer usuário obtém o Raio-X COMPLETO (som/imagem/
    estrutura/curva de retenção) — sem trava de plano."""
    from app.seed import run_seed

    run_seed()
    token, _ = _register(client)
    auth = {"Authorization": f"Bearer {token}"}
    trends = client.get("/api/v1/radar/trends?niche=finanças", headers=auth)
    assert trends.status_code == 200
    items = trends.json()["items"]
    assert items, "seed deve popular tendências"
    xray = client.get(f"/api/v1/radar/videos/{items[0]['id']}/xray", headers=auth)
    assert xray.status_code == 200, xray.text
    body = xray.json()
    assert body["sound"] and body["image"] and body["structure"]
    assert len(body["retentionTimeline"]) > 0


def test_render_any_resolution_allowed(client):
    """Sem cap de resolução: pedir 2160p passa pelo gate e só falha por corte
    inexistente (404), nunca 402."""
    token, _ = _register(client)
    resp = client.post(
        "/api/v1/renders",
        headers={"Authorization": f"Bearer {token}"},
        json={"cutIds": [str(uuid.uuid4())], "resolution": "2160p", "fps": 30, "codec": "h264", "preset": "tiktok"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_radar_niches(client):
    token, _ = _register(client)
    resp = client.get("/api/v1/radar/niches", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert "finanças" in resp.json()["niches"]
    assert len(resp.json()["niches"]) == 8
