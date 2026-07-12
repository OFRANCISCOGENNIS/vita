# CortaAí API — FastAPI + Celery worker image
FROM python:3.11-slim

# ffmpeg is required by the render/analyze pipeline (and yt-dlp merging)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/api

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# docker-compose overrides the command for worker (celery -A app.workers.celery_app worker)
# and radar (celery -A app.workers.celery_app beat) containers.
# ${PORT} é injetado por PaaS (Render/Railway); localmente cai no 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
