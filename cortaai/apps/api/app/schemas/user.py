from __future__ import annotations

from datetime import datetime

from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class BrandingKit(CamelModel):
    logo_url: str | None = None
    font: str | None = None
    colors: list[str] = []
    caption_preset: str | None = None


class UserOut(CamelModel):
    id: str
    email: EmailStr
    name: str
    avatar_url: str | None = None
    branding_kit: BrandingKit | None = None
    created_at: datetime | None = None


class RegisterIn(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=200)


class LoginIn(CamelModel):
    email: EmailStr
    password: str


class GoogleAuthIn(CamelModel):
    id_token: str


class PasswordResetIn(CamelModel):
    email: EmailStr


class AuthOut(CamelModel):
    token: str
    user: UserOut
