"""
In-process job manager for the web dashboard.

Runs generation jobs (src/cron.py) in worker threads, tracks their lifecycle
(queued → running → succeeded/failed) and captures their output to log files
under .mp/jobs/. Single-node by design: the public surface (enqueue / list /
get) is the same contract a distributed queue would offer later.
"""

from __future__ import annotations

import os
import shlex
import threading
import subprocess
from uuid import uuid4
from datetime import datetime, timezone

_LOG_TAIL_BYTES = 4000
_MAX_JOBS_KEPT = 200


class JobManager:
    def __init__(self, log_dir: str, max_workers: int = 2):
        self._log_dir = log_dir
        self._jobs: dict[str, dict] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()
        self._semaphore = threading.Semaphore(max_workers)
        os.makedirs(log_dir, exist_ok=True)

    def enqueue(self, argv: list[str], cwd: str, meta: dict) -> dict:
        """
        Registers a job and starts it as soon as a worker slot is free.

        Args:
            argv: Command to run.
            cwd: Working directory for the subprocess.
            meta: Caller-provided fields echoed back on the job record
                (e.g. provider, account_id, model).

        Returns:
            The public job record (snapshot at enqueue time).
        """
        job_id = str(uuid4())
        job = {
            "id": job_id,
            "command": shlex.join(argv),
            "status": "queued",
            "created_at": self._now(),
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            **meta,
        }
        with self._lock:
            self._jobs[job_id] = job
            self._order.append(job_id)
            self._evict_old()

        thread = threading.Thread(
            target=self._run, args=(job_id, argv, cwd), daemon=True
        )
        thread.start()
        return dict(job)

    def list(self) -> list[dict]:
        """Returns all tracked jobs, newest first."""
        with self._lock:
            return [dict(self._jobs[jid]) for jid in reversed(self._order)]

    def get(self, job_id: str) -> dict | None:
        """Returns one job with the tail of its log, or None if unknown."""
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            job = dict(job)
        job["log_tail"] = self._read_log_tail(job_id)
        return job

    def _run(self, job_id: str, argv: list[str], cwd: str) -> None:
        with self._semaphore:
            log_path = self._log_path(job_id)
            with self._lock:
                job = self._jobs[job_id]
                job["status"] = "running"
                job["started_at"] = self._now()
            try:
                with open(log_path, "wb") as log_file:
                    process = subprocess.run(
                        argv, cwd=cwd, stdout=log_file, stderr=subprocess.STDOUT
                    )
                returncode = process.returncode
            except Exception as e:
                with open(log_path, "ab") as log_file:
                    log_file.write(f"\n[job runner] {e}\n".encode())
                returncode = -1
            with self._lock:
                job = self._jobs[job_id]
                job["status"] = "succeeded" if returncode == 0 else "failed"
                job["returncode"] = returncode
                job["finished_at"] = self._now()

    def _log_path(self, job_id: str) -> str:
        return os.path.join(self._log_dir, f"{job_id}.log")

    def _read_log_tail(self, job_id: str) -> str:
        path = self._log_path(job_id)
        if not os.path.exists(path):
            return ""
        with open(path, "rb") as file:
            file.seek(0, os.SEEK_END)
            size = file.tell()
            file.seek(max(0, size - _LOG_TAIL_BYTES))
            return file.read().decode(errors="replace")

    def _evict_old(self) -> None:
        # Called with the lock held. Finished jobs beyond the cap are dropped
        # from memory; their log files are removed too.
        while len(self._order) > _MAX_JOBS_KEPT:
            oldest = self._order[0]
            if self._jobs[oldest]["status"] in ("queued", "running"):
                break
            self._order.pop(0)
            self._jobs.pop(oldest, None)
            try:
                os.remove(self._log_path(oldest))
            except OSError:
                pass

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds")
