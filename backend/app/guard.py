"""Middleware ASGI di protezione dei corpi delle richieste.

- Dimensione massima: JSON 1 MB, multipart (import Excel) 6 MB → 413 senza leggere oltre il limite.
- JSON con NaN, Infinity o numeri fuori scala (1e999 → inf): 422. Il modulo json di Python li accetta,
  ma salvati nella scheda rompono ogni risposta successiva (Starlette serializza con allow_nan=False → 500).
Il corpo letto viene poi ripassato intatto all'applicazione."""
import json
import math

from starlette.responses import JSONResponse

from . import config

_NO_BODY = {"GET", "HEAD", "OPTIONS"}


class _NonFinite(ValueError):
    pass


def _reject_constant(name: str):
    raise _NonFinite(name)


def _finite_float(s: str) -> float:
    f = float(s)
    if not math.isfinite(f):
        raise _NonFinite(s)
    return f


def has_non_finite(body: bytes) -> bool:
    """True se il JSON contiene NaN/Infinity/numeri che diventano infiniti. Il JSON malformato no (lo gestisce FastAPI)."""
    try:
        json.loads(body, parse_constant=_reject_constant, parse_float=_finite_float)
    except _NonFinite:
        return True
    except (ValueError, UnicodeDecodeError, RecursionError):
        return False
    return False


def has_lone_surrogate(body: bytes) -> bool:
    """True se il JSON contiene un surrogato UTF-16 isolato (es. "\\udfff"): Python lo accetta, ma salvato rompe
    ogni risposta successiva che lo contiene (UnicodeEncodeError → 500)."""
    try:
        obj = json.loads(body)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return False
    try:
        json.dumps(obj, ensure_ascii=False).encode("utf-8")
    except UnicodeEncodeError:
        return True
    except (ValueError, RecursionError):
        return False
    return False


class BodyGuard:
    def __init__(self, app, max_json: int = config.MAX_JSON_BYTES, max_multipart: int = config.MAX_UPLOAD_BYTES):
        self.app = app
        self.max_json = max_json
        self.max_multipart = max_multipart

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in _NO_BODY:
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers") or [])
        ctype = headers.get(b"content-type", b"").split(b";")[0].strip().lower()
        limit = self.max_multipart if ctype == b"multipart/form-data" else self.max_json
        too_big = JSONResponse({"detail": f"Richiesta troppo grande (massimo {limit // (1024 * 1024)} MB)."}, 413)
        length = headers.get(b"content-length")
        if length is not None and length.isdigit() and int(length) > limit:
            return await too_big(scope, receive, send)
        chunks, size = [], 0
        while True:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            body = msg.get("body", b"")
            size += len(body)
            if size > limit:
                return await too_big(scope, receive, send)
            chunks.append(body)
            if not msg.get("more_body", False):
                break
        body = b"".join(chunks)
        # FastAPI legge come JSON anche i corpi senza Content-Type e i tipi «…+json»
        if (ctype == b"" or ctype.endswith(b"json")) and body and has_non_finite(body):
            return await JSONResponse({"detail": "Dati non validi — i numeri devono essere finiti "
                                                 "(niente NaN o Infinity)."}, 422)(scope, receive, send)
        if (ctype == b"" or ctype.endswith(b"json")) and body and b"\\u" in body.lower() and has_lone_surrogate(body):
            return await JSONResponse({"detail": "Dati non validi — testo con caratteri Unicode non validi."},
                                      422)(scope, receive, send)
        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
