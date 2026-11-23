"""Profilo descrittivo del PG (razza, età, aspetto, alleanze): solo testo, modificabile dal Master."""
from test_api import kelvin_id

KEYS = {"razza", "eta", "sesso", "patria", "alleanze", "capelli", "occhi", "abbigliamento", "segni", "statura"}


def test_profile_empty_by_default(client, p1):
    kid = kelvin_id(client, p1)
    p = client.get(f"/api/characters/{kid}", headers=p1).json()["profile"]
    assert set(p) == KEYS and all(v == "" for v in p.values())


def test_master_edits_profile(client, master, p1):
    kid = kelvin_id(client, master)
    r = client.patch(f"/api/characters/{kid}", headers=master,
                     json={"profile": {"razza": " Umana ", "eta": "23 anni", "alleanze": "Eclipse [Gilda]\nDante [Alleato]"}})
    assert r.status_code == 200, r.text
    p = r.json()["profile"]
    assert (p["razza"], p["eta"], p["capelli"]) == ("Umana", "23 anni", "")
    assert p["alleanze"] == "Eclipse [Gilda]\nDante [Alleato]"
    # il giocatore lo vede ma non lo modifica
    assert client.get(f"/api/characters/{kid}", headers=p1).json()["profile"]["razza"] == "Umana"
    assert client.patch(f"/api/characters/{kid}", headers=p1, json={"profile": {"razza": "Elfo"}}).status_code == 403
    # campi sconosciuti e testi troppo lunghi rifiutati; il profilo resta com'era
    assert client.patch(f"/api/characters/{kid}", headers=master, json={"profile": {"colore": "blu"}}).status_code == 422
    assert client.patch(f"/api/characters/{kid}", headers=master, json={"profile": {"segni": "x" * 2001}}).status_code == 422
    assert client.get(f"/api/characters/{kid}", headers=master).json()["profile"]["razza"] == "Umana"


def test_old_database_gets_profile_column(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.db import Base, ensure_columns
    eng = create_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    Base.metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("ALTER TABLE characters DROP COLUMN profile"))
    assert "characters.profile" in ensure_columns(eng)
    assert "profile" in {c["name"] for c in inspect(eng).get_columns("characters")}
    eng.dispose()
