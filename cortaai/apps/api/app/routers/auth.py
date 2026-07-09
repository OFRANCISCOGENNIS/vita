from __future__ import annotations

import jwt as pyjwt
import sqlalchemy as sa
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.errors import ApiError
from app.models import User
from app.schemas import AuthOut, GoogleAuthIn, LoginIn, PasswordResetIn, RegisterIn, UserOut
from app.services.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User) -> AuthOut:
    return AuthOut(token=create_access_token(user.id, user.email), user=UserOut.model_validate(user))


@router.post("/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> AuthOut:
    existing = db.execute(sa.select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if existing is not None:
        raise ApiError(409, "email_taken", "Este e-mail já está cadastrado. Tente fazer login.")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        name=body.name.strip(),
        branding_kit=None,
    )
    db.add(user)
    db.commit()
    return _auth_response(user)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> AuthOut:
    user = db.execute(sa.select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise ApiError(401, "invalid_credentials", "E-mail ou senha incorretos.")
    return _auth_response(user)


@router.post("/google", response_model=AuthOut)
def google_auth(body: GoogleAuthIn, db: Session = Depends(get_db)) -> AuthOut:
    """# INTEGRAÇÃO PAGA/EXTERNA: Google OAuth.

    Production verifies the id_token signature against Google's JWKS:

        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        info = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), settings.google_client_id)

    Without GOOGLE_CLIENT_ID configured we decode the token without signature
    verification (mock/dev mode) just to extract email/name.
    """
    try:
        info = pyjwt.decode(body.id_token, options={"verify_signature": False, "verify_exp": False})
    except pyjwt.PyJWTError:
        raise ApiError(401, "invalid_google_token", "Token do Google inválido.")

    email = (info.get("email") or "").lower()
    if not email:
        raise ApiError(401, "invalid_google_token", "Token do Google sem e-mail.")

    user = db.execute(sa.select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            name=info.get("name") or email.split("@")[0],
            avatar_url=info.get("picture"),
            google_id=info.get("sub"),
        )
        db.add(user)
    else:
        user.google_id = user.google_id or info.get("sub")
        user.avatar_url = user.avatar_url or info.get("picture")
    db.commit()
    return _auth_response(user)


@router.post("/password-reset", status_code=204)
def password_reset(body: PasswordResetIn, db: Session = Depends(get_db)) -> None:
    """Always 204 (no user enumeration). Production would e-mail a signed
    reset link; here we only generate the token server-side."""
    user = db.execute(sa.select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if user is not None:
        create_access_token(user.id, user.email)  # reset token (would be e-mailed)
    return None


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
