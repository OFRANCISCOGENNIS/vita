"""API error type + handlers producing the SPEC error envelope:

    { "error": { "code": string, "message": string } }

User-facing messages are in Brazilian Portuguese.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def not_found(message: str = "Recurso não encontrado.") -> ApiError:
    return ApiError(404, "not_found", message)


def _envelope(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_envelope(exc.code, exc.message))

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            409: "conflict",
            422: "validation_error",
            429: "rate_limited",
        }
        code = codes.get(exc.status_code, "http_error")
        message = exc.detail if isinstance(exc.detail, str) else "Erro na requisição."
        return JSONResponse(status_code=exc.status_code, content=_envelope(code, message))

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        message = f"Dados inválidos no campo '{loc}'." if loc else "Dados inválidos na requisição."
        return JSONResponse(status_code=422, content=_envelope("validation_error", message))

    @app.exception_handler(Exception)
    async def unhandled_handler(_: Request, exc: Exception) -> JSONResponse:  # pragma: no cover
        return JSONResponse(
            status_code=500,
            content=_envelope("internal_error", "Ocorreu um erro interno. Tente novamente em instantes."),
        )
