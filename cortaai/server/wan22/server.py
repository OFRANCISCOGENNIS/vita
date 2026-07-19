# CortaAí × Wan2.2 — servidor de geração de vídeo por IA (OPCIONAL, self-host).
#
# Este wrapper expõe o Wan2.2 (https://github.com/Wan-Video/Wan2.2) numa API
# HTTP simples que o frontend do CortaAí consome. Ele NÃO é hospedado pela
# equipe: você roda na SUA máquina/servidor com GPU (veja o README.md ao lado).
#
# Como o Wan2.2 leva minutos por vídeo, a API é assíncrona:
#   GET  /api/health            → { ok, aiEnabled, service, features, model }
#   POST /api/generate-video    → { jobId }   (409 se a GPU já está ocupada)
#   GET  /api/jobs/{id}         → { status: queued|running|done|error, ... }
#   GET  /api/jobs/{id}/video   → o MP4 gerado
#
# Config por variáveis de ambiente:
#   WAN22_DIR        pasta do clone do Wan2.2 (padrão ./Wan2.2)
#   WAN22_CKPT_DIR   pasta dos pesos (padrão $WAN22_DIR/Wan2.2-TI2V-5B)
#   WAN22_TASK       ti2v-5B (padrão, roda em RTX 4090 24 GB) | t2v-A14B | i2v-A14B
#   WAN22_SIZE       tamanho padrão quando o cliente não manda (1280*704)
#   WAN22_EXTRA_ARGS flags extras do generate.py
#                    (padrão: --offload_model True --convert_model_dtype --t5_cpu)
#   WAN22_PYTHON     executável python do venv do Wan2.2 (padrão: python)
#   ALLOWED_ORIGIN   origem do frontend (ex.: https://ofranciscogennis.github.io)
#   PORT             porta (padrão 8787)

import base64
import os
import shlex
import subprocess
import threading
import uuid
from collections import deque
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

WAN22_DIR = Path(os.environ.get("WAN22_DIR", "./Wan2.2")).resolve()
CKPT_DIR = Path(os.environ.get("WAN22_CKPT_DIR", str(WAN22_DIR / "Wan2.2-TI2V-5B"))).resolve()
TASK = os.environ.get("WAN22_TASK", "ti2v-5B")
DEFAULT_SIZE = os.environ.get("WAN22_SIZE", "1280*704")
EXTRA_ARGS = os.environ.get("WAN22_EXTRA_ARGS", "--offload_model True --convert_model_dtype --t5_cpu")
PYTHON = os.environ.get("WAN22_PYTHON", "python")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
PORT = int(os.environ.get("PORT", "8787"))

OUT_DIR = Path(os.environ.get("WAN22_OUT_DIR", "./wan22-jobs")).resolve()
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Tamanhos aceitos do cliente (formato WIDTH*HEIGHT do generate.py).
ALLOWED_SIZES = {"1280*704", "704*1280", "1280*720", "720*1280", "832*480", "480*832"}

app = FastAPI(title="cortaai-wan22")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN] if ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: dict = {}
jobs_lock = threading.Lock()


def wan_ready() -> bool:
    return (WAN22_DIR / "generate.py").exists() and CKPT_DIR.exists()


class GenerateBody(BaseModel):
    prompt: str
    # data URL (data:image/...;base64,...) para imagem → vídeo; opcional
    imageDataUrl: str | None = None
    size: str | None = None


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "service": "cortaai-wan22",
        "aiEnabled": wan_ready(),
        "features": ["generate-video", "image-to-video"] if wan_ready() else [],
        "model": f"Wan2.2 {TASK}",
        "detail": None if wan_ready() else (
            f"generate.py não encontrado em {WAN22_DIR} ou pesos ausentes em {CKPT_DIR} — veja o README."
        ),
    }


def run_job(job_id: str, prompt: str, size: str, image_path: Path | None):
    job = jobs[job_id]
    out_file = OUT_DIR / f"{job_id}.mp4"
    cmd = [
        PYTHON, "generate.py",
        "--task", TASK,
        "--size", size,
        "--ckpt_dir", str(CKPT_DIR),
        "--save_file", str(out_file),
        "--prompt", prompt,
        *shlex.split(EXTRA_ARGS),
    ]
    if image_path is not None:
        cmd += ["--image", str(image_path)]
    job["status"] = "running"
    tail: deque = deque(maxlen=30)
    try:
        proc = subprocess.Popen(
            cmd, cwd=str(WAN22_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            tail.append(line.rstrip())
            job["logTail"] = list(tail)
        proc.wait()
        if proc.returncode != 0 or not out_file.exists():
            job["status"] = "error"
            job["error"] = f"generate.py saiu com código {proc.returncode}. Últimas linhas: " + " | ".join(list(tail)[-5:])
        else:
            job["status"] = "done"
            job["file"] = str(out_file)
    except Exception as err:  # noqa: BLE001 — reportamos qualquer falha ao cliente
        job["status"] = "error"
        job["error"] = str(err)
    finally:
        if image_path is not None:
            image_path.unlink(missing_ok=True)


@app.post("/api/generate-video")
def generate(body: GenerateBody):
    if not wan_ready():
        raise HTTPException(501, "Wan2.2 não configurado neste servidor — veja o README (clone + pesos).")
    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "Faltou o prompt.")
    size = body.size or DEFAULT_SIZE
    if size not in ALLOWED_SIZES:
        raise HTTPException(400, f"Tamanho inválido: {size}.")
    with jobs_lock:
        if any(j["status"] in ("queued", "running") for j in jobs.values()):
            raise HTTPException(409, "A GPU já está gerando um vídeo — espere terminar.")
        job_id = uuid.uuid4().hex[:12]
        jobs[job_id] = {"status": "queued", "logTail": [], "error": None, "file": None}
    image_path: Path | None = None
    if body.imageDataUrl:
        try:
            header, b64 = body.imageDataUrl.split(",", 1)
            ext = ".png" if "png" in header else ".jpg"
            image_path = OUT_DIR / f"{job_id}-input{ext}"
            image_path.write_bytes(base64.b64decode(b64))
        except Exception:
            raise HTTPException(400, "imageDataUrl inválida — envie um data URL de imagem.")
    threading.Thread(target=run_job, args=(job_id, prompt, size, image_path), daemon=True).start()
    return {"jobId": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job não encontrado.")
    return {"status": job["status"], "error": job["error"], "logTail": job["logTail"][-5:]}


@app.get("/api/jobs/{job_id}/video")
def job_video(job_id: str):
    job = jobs.get(job_id)
    if not job or job["status"] != "done" or not job["file"]:
        raise HTTPException(404, "Vídeo ainda não disponível.")
    return FileResponse(job["file"], media_type="video/mp4", filename="cortaai-wan22.mp4")


if __name__ == "__main__":
    print(f"CortaAí × Wan2.2 em :{PORT} — pronto: {wan_ready()} (task {TASK}, ckpt {CKPT_DIR})")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
