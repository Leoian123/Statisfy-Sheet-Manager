"""Messaggi di validazione leggibili in italiano."""
from fastapi import HTTPException
from pydantic import ValidationError

_MSG = {
    "missing": "campo obbligatorio mancante",
    "extra_forbidden": "campo non ammesso",
    "int_parsing": "deve essere un numero intero",
    "int_type": "deve essere un numero intero",
    "int_from_float": "deve essere un numero intero",
    "float_parsing": "deve essere un numero",
    "float_type": "deve essere un numero",
    "bool_parsing": "deve essere vero o falso",
    "bool_type": "deve essere vero o falso",
    "string_type": "deve essere un testo",
    "string_too_short": "testo troppo corto",
    "string_too_long": "testo troppo lungo",
    "literal_error": "valore non ammesso",
    "greater_than": "deve essere maggiore di {gt}",
    "greater_than_equal": "deve essere almeno {ge}",
    "less_than_equal": "deve essere al massimo {le}",
    "dict_type": "deve essere un oggetto",
    "list_type": "deve essere una lista",
    "model_type": "deve essere un oggetto",
    "json_invalid": "JSON non valido",
}


def message(errors: list[dict]) -> str:
    if not errors:
        return "Dati non validi."
    parts = []
    for e in errors[:3]:
        loc = [str(x) for x in e.get("loc", ()) if x not in ("body", "query", "path")]
        field = ".".join(loc) or "richiesta"
        tmpl = _MSG.get(e.get("type", ""))
        if tmpl:
            try:
                text = tmpl.format(**(e.get("ctx") or {}))
            except (KeyError, IndexError):
                text = tmpl
            if e.get("type") == "literal_error" and e.get("ctx", {}).get("expected"):
                text += f" (ammessi: {e['ctx']['expected']})"
        else:
            text = "valore non valido"
        parts.append(f"{field}: {text}")
    return "Dati non validi — " + "; ".join(parts) + "."


def validate(model, data):
    """Valida un dict con un modello Pydantic, alzando 422 con messaggio italiano."""
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(422, message(exc.errors()))
