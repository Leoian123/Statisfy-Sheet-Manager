"""Produzione: header di sicurezza su ogni risposta e frontend compilato (frontend/dist) servito dallo stesso processo.

- Le risposte delle API hanno una CSP chiusa (`default-src 'none'`): sono JSON e non devono mai eseguire nulla.
- Le pagine del frontend hanno una CSP stretta: script solo dal sito e gli script inline di index.html tramite hash
  (calcolati all'avvio dal file compilato), stili dal sito e da Google Fonts, connessioni solo al sito.
- Il frontend è una SPA: i percorsi che non sono file reali di dist rispondono con index.html; /api resta delle API.
  I file si risolvono dentro dist (niente path traversal)."""
import base64
import hashlib
import mimetypes
import re
from pathlib import Path

from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from . import config

_COMMON = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
]
API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


def inline_script_hashes(html: str) -> list[str]:
    """Hash CSP ('sha256-…') degli script inline (senza src) di una pagina."""
    out = []
    for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S | re.I):
        digest = hashlib.sha256(m.group(1).encode("utf-8")).digest()
        out.append(f"'sha256-{base64.b64encode(digest).decode()}'")
    return out


def page_csp(index_html: str) -> str:
    scripts = " ".join(["'self'", *inline_script_hashes(index_html)])
    return ("default-src 'self'; "
            f"script-src {scripts}; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "  # attributi style di React e Google Fonts
            "font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


class SecurityHeaders:
    """Middleware ASGI: header comuni, CSP per API o pagine, HSTS in produzione. Non tocca il corpo."""

    def __init__(self, app, page_policy: str | None = None):
        self.app = app
        self.page_policy = page_policy or page_csp("")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_api = scope.get("path", "").startswith("/api")

        async def wrapped(message):
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                for k, v in _COMMON:
                    if k.decode() not in h:
                        h.append(k.decode(), v.decode())
                if "content-security-policy" not in h:
                    h.append("Content-Security-Policy", API_CSP if is_api else self.page_policy)
                if config.PRODUCTION:
                    h.append("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
                if is_api:
                    h.append("Cache-Control", "no-store")
            await send(message)

        return await self.app(scope, receive, wrapped)


def frontend_dist() -> Path | None:
    d = config.FRONTEND_DIST
    return d if d is not None and (d / "index.html").is_file() else None


def _file(p: Path, cache: str) -> Response:
    """File intero letto in memoria (gli asset compilati sono piccoli). Niente FileResponse: le richieste «Range»
    con migliaia di intervalli costano CPU nelle versioni di starlette < 0.49.1 (CVE-2025-62727)."""
    media = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    if media.startswith("text/") or media in ("application/javascript", "application/json", "image/svg+xml"):
        media += "; charset=utf-8"
    return Response(p.read_bytes(), media_type=media, headers={"Cache-Control": cache, "Accept-Ranges": "none"})


def spa_handler(dist: Path):
    """Handler GET per i percorsi non-API: file reale di dist (asset con cache lunga) oppure index.html."""
    root = dist.resolve()
    index = root / "index.html"

    async def serve(request: Request, path: str = "") -> Response:
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Elemento non trovato."}, 404)
        if path:
            target = (root / path).resolve()
            if target.is_relative_to(root) and target.is_file():
                cache = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
                return _file(target, cache)
        return _file(index, "no-cache")

    return serve
