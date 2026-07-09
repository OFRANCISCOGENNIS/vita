"""MinIO / S3 storage: presigned multipart uploads + object helpers.

Fully mock-safe: when MinIO is unreachable, presigned URLs are deterministic
mock URLs and objects are written to a local fallback directory so downstream
features (zip, srt, thumbnails) still produce real files.
"""
from __future__ import annotations

import base64
import json
import math
import os
import tempfile
import uuid
from functools import lru_cache
from pathlib import Path

from app.config import settings

LOCAL_FALLBACK_DIR = Path(os.environ.get("CORTAAI_LOCAL_STORAGE", tempfile.gettempdir())) / "cortaai-storage"


@lru_cache
def _get_client():
    """boto3 S3 client pointed at MinIO. Returns None when boto3 fails to build."""
    try:
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", connect_timeout=2, read_timeout=5, retries={"max_attempts": 1}),
        )
    except Exception:
        return None


def _ensure_bucket(client) -> bool:
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
        return True
    except Exception:
        try:
            client.create_bucket(Bucket=settings.s3_bucket)
            return True
        except Exception:
            return False


def _mock_presigned(key: str, extra: str = "") -> str:
    return f"{settings.s3_public_endpoint}/{settings.s3_bucket}/{key}?X-Amz-Mock=1{extra}"


# --- multipart upload --------------------------------------------------------

def encode_upload_token(payload: dict) -> str:
    """Opaque uploadId returned to the client (stateless: carries the S3 key)."""
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_upload_token(upload_id: str) -> dict | None:
    try:
        return json.loads(base64.urlsafe_b64decode(upload_id.encode()).decode())
    except Exception:
        return None


def init_multipart_upload(filename: str, size_bytes: int, content_type: str) -> dict:
    """Creates the multipart upload and presigns one PUT URL per part."""
    chunk_size = settings.upload_chunk_size_bytes
    num_parts = max(1, math.ceil(size_bytes / chunk_size))
    safe_name = os.path.basename(filename).replace(" ", "_") or "video.mp4"
    key = f"uploads/{uuid.uuid4()}/{safe_name}"

    client = _get_client()
    s3_upload_id = None
    urls: list[str] = []
    if client is not None and _ensure_bucket(client):
        try:
            resp = client.create_multipart_upload(Bucket=settings.s3_bucket, Key=key, ContentType=content_type)
            s3_upload_id = resp["UploadId"]
            for part in range(1, num_parts + 1):
                urls.append(
                    client.generate_presigned_url(
                        "upload_part",
                        Params={
                            "Bucket": settings.s3_bucket,
                            "Key": key,
                            "UploadId": s3_upload_id,
                            "PartNumber": part,
                        },
                        ExpiresIn=3600 * 6,
                    )
                )
        except Exception:
            s3_upload_id = None
            urls = []

    if not urls:  # mock fallback (MinIO offline)
        s3_upload_id = f"mock-{uuid.uuid4()}"
        urls = [_mock_presigned(key, f"&uploadId={s3_upload_id}&partNumber={p}") for p in range(1, num_parts + 1)]

    token = encode_upload_token(
        {"key": key, "s3UploadId": s3_upload_id, "filename": safe_name, "sizeBytes": size_bytes, "contentType": content_type}
    )
    return {"upload_id": token, "chunk_size": chunk_size, "presigned_urls": urls, "key": key}


def complete_multipart_upload(upload_token: dict) -> None:
    """Completes the multipart upload; silently no-ops in mock mode."""
    client = _get_client()
    s3_upload_id = upload_token.get("s3UploadId", "")
    if client is None or str(s3_upload_id).startswith("mock-"):
        return
    try:
        parts = client.list_parts(Bucket=settings.s3_bucket, Key=upload_token["key"], UploadId=s3_upload_id)
        part_list = [{"ETag": p["ETag"], "PartNumber": p["PartNumber"]} for p in parts.get("Parts", [])]
        if part_list:
            client.complete_multipart_upload(
                Bucket=settings.s3_bucket,
                Key=upload_token["key"],
                UploadId=s3_upload_id,
                MultipartUpload={"Parts": part_list},
            )
    except Exception:
        pass


# --- simple object helpers ----------------------------------------------------

def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Uploads bytes and returns a presigned GET URL. Falls back to a local file."""
    client = _get_client()
    if client is not None and _ensure_bucket(client):
        try:
            client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type)
            return presigned_get_url(key)
        except Exception:
            pass
    local_path = LOCAL_FALLBACK_DIR / key
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(data)
    return _mock_presigned(key)


def local_path_for(key: str) -> Path | None:
    p = LOCAL_FALLBACK_DIR / key
    return p if p.exists() else None


def get_bytes(key: str) -> bytes | None:
    client = _get_client()
    if client is not None:
        try:
            obj = client.get_object(Bucket=settings.s3_bucket, Key=key)
            return obj["Body"].read()
        except Exception:
            pass
    p = local_path_for(key)
    return p.read_bytes() if p else None


def presigned_get_url(key: str, expires: int = 3600 * 24) -> str:
    client = _get_client()
    if client is not None:
        try:
            return client.generate_presigned_url(
                "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=expires
            )
        except Exception:
            pass
    return _mock_presigned(key)
