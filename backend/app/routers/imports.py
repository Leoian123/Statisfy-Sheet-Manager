import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_master
from ..db import get_db
from ..excel_import import import_characters, parse_workbook
from ..models import User

router = APIRouter(prefix="/api/import", tags=["import"])

MAX_BYTES = 5 * 1024 * 1024


@router.post("/excel")
async def import_excel(file: UploadFile = File(...), dry_run: bool = Form(False), owners: str = Form(""),
                       create_issues: bool = Form(True), user: User = Depends(require_master),
                       db: Session = Depends(get_db)):
    name = file.filename or "file.xlsx"
    if not name.lower().endswith(".xlsx"):
        raise HTTPException(422, "Carica un file Excel .xlsx.")
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "File troppo grande (massimo 5 MB).")
    owner_map: dict[str, User] = {}
    if owners.strip():
        try:
            raw = json.loads(owners)
            if not isinstance(raw, dict):
                raise ValueError
        except ValueError:
            raise HTTPException(422, "«owners» deve essere un oggetto JSON {\"NomePG\": \"username\"}.")
        for char_name, username in raw.items():
            u = db.scalar(select(User).where(User.username == str(username)))
            if u is None:
                raise HTTPException(422, f"Utente «{username}» inesistente (proprietario di {char_name}).")
            owner_map[str(char_name)] = u
    try:
        chars, report = parse_workbook(content, name)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return import_characters(db, chars, report, default_owner=user, owners=owner_map, dry_run=dry_run,
                             save_issues=create_issues)
