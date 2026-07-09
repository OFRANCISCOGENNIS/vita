"""FastAPI dependencies: DB session, JWT auth, admin gate."""
from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.errors import ApiError
from app.models import User
from app.services.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise ApiError(401, "unauthorized", "Autenticação necessária. Faça login para continuar.")
    payload = decode_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise ApiError(401, "unauthorized", "Sessão inválida ou expirada. Faça login novamente.")
    user = db.get(User, payload["sub"])
    if user is None:
        raise ApiError(401, "unauthorized", "Usuário não encontrado. Faça login novamente.")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() not in settings.admin_emails_list:
        raise ApiError(403, "forbidden", "Acesso restrito a administradores.")
    return user
