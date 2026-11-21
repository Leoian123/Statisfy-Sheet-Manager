"""Richieste al Master: ciclo di vita, permessi, archiviazione automatica (logrotate) e questioni delle regole."""
from datetime import datetime, timedelta, timezone

from conftest import login
from test_ki import char_id

from app.db import SessionLocal
from app.models import Ticket

T = "/api/tickets"


def new(client, h, **kw):
    body = {"kind": "regola", "title": "Il critico conta il totale?", "body": "Con gli allegati si supera 90?", **kw}
    return client.post(T, json=body, headers=h)


def age(tid, days):
    """Sposta indietro la chiusura di una richiesta (simula il passare dei giorni)."""
    with SessionLocal() as db:
        t = db.get(Ticket, tid)
        t.closed_at = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
        db.commit()


def test_lifecycle_and_unread(client, p1, master):
    t = new(client, p1).json()
    assert t["status"] == "aperta" and t["mine"] and not t["unread"]
    assert client.get(f"{T}/summary", headers=master).json()["count"] == 1
    r = client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master)
    assert r.status_code == 200 and r.json()["status"] == "in_esame"
    client.post(f"{T}/{t['id']}/messages", json={"text": "Ci penso"}, headers=master)
    assert client.get(f"{T}/summary", headers=p1).json()["count"] == 1
    lst = client.get(T, headers=p1).json()
    assert lst["items"][0]["unread"] is True
    got = client.get(f"{T}/{t['id']}", headers=p1).json()  # aprirla la segna come letta
    assert got["messages"][0]["role"] == "master" and got["messages"][0]["text"] == "Ci penso"
    assert client.get(f"{T}/summary", headers=p1).json()["count"] == 0
    # leggerla non cambia la versione: il Master con la richiesta aperta non riceve un falso conflitto
    assert got["version"] == lst["items"][0]["version"]
    assert got["messages"][0]["role"] == "master"
    # chiudere senza risposta: rifiutato
    assert client.patch(f"{T}/{t['id']}", json={"status": "risolta"}, headers=master).status_code == 422
    r = client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "Conta il naturale."}, headers=master)
    assert r.status_code == 200 and r.json()["closed_at"] and r.json()["archive_at"]


def test_player_permissions(client, p1, p2, master):
    t = new(client, p1).json()
    # altri giocatori non la vedono
    assert client.get(f"{T}/{t['id']}", headers=p2).status_code == 404
    assert client.post(f"{T}/{t['id']}/messages", json={"text": "ciao"}, headers=p2).status_code == 404
    assert client.patch(f"{T}/{t['id']}", json={"status": "ritirata"}, headers=p2).status_code == 404
    assert client.get(T, headers=p2).json()["total"] == 0
    # l'autore non decide stato né risposta
    assert client.patch(f"{T}/{t['id']}", json={"promote_issue": False, "title": "Titolo ok"}, headers=p1).status_code == 200
    for body in ({"status": "risolta"}, {"status": "in_esame"}, {"answer": "Mi do ragione"}, {"promote_issue": True}):
        assert client.patch(f"{T}/{t['id']}", json=body, headers=p1).status_code == 403, body
    # corregge finché è aperta
    assert client.patch(f"{T}/{t['id']}", json={"title": "Titolo corretto"}, headers=p1).status_code == 200
    client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master)
    assert client.patch(f"{T}/{t['id']}", json={"body": "cambio idea"}, headers=p1).status_code == 409
    # ritira
    r = client.patch(f"{T}/{t['id']}", json={"status": "ritirata"}, headers=p1)
    assert r.status_code == 200 and r.json()["closed_at"]
    assert client.patch(f"{T}/{t['id']}", json={"status": "ritirata"}, headers=p1).status_code == 409
    # il Master non ritira al posto dell'autore
    t2 = new(client, p1).json()
    assert client.patch(f"{T}/{t2['id']}", json={"status": "ritirata"}, headers=master).status_code == 422


def test_rotation_archives_after_retention(client, p1, master):
    t = new(client, p1).json()
    client.patch(f"{T}/{t['id']}", json={"status": "respinta", "answer": "No"}, headers=master)
    age(t["id"], 6)
    assert client.get(T, headers=p1).json()["total"] == 1  # 6 giorni: ancora attiva
    age(t["id"], 8)
    lst = client.get(T, headers=p1).json()
    assert lst["total"] == 0 and lst["counts"]["archivio"] == 1
    arch = client.get(T, params={"scope": "archivio"}, headers=p1).json()["items"]
    assert arch[0]["id"] == t["id"] and arch[0]["archived_at"]
    # in archivio è di sola lettura, anche per il Master
    assert client.post(f"{T}/{t['id']}/messages", json={"text": "ancora?"}, headers=p1).status_code == 409
    assert client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master).status_code == 409
    assert client.get(f"{T}/{t['id']}", headers=p1).status_code == 200


def test_open_tickets_never_archived(client, p1, master):
    t = new(client, p1).json()
    with SessionLocal() as db:
        x = db.get(Ticket, t["id"])
        x.created_at = "2000-01-01T00:00:00+00:00"
        db.commit()
    assert client.post(f"{T}/rotate", headers=master).json()["archived"] == 0
    assert client.get(T, headers=p1).json()["total"] == 1


def test_reopen_clears_closed_at(client, p1, master):
    t = new(client, p1).json()
    client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "Sì"}, headers=master)
    r = client.patch(f"{T}/{t['id']}", json={"status": "in_esame"}, headers=master).json()
    assert r["closed_at"] is None and r["archive_at"] is None
    age(t["id"], 30)  # closed_at forzato ma stato attivo: non va in archivio
    with SessionLocal() as db:
        db.get(Ticket, t["id"]).status = "in_esame"
        db.commit()
    assert client.post(f"{T}/rotate", headers=master).json()["archived"] == 0


def test_archive_now_and_rotate_master_only(client, p1, master):
    t = new(client, p1).json()
    assert client.post(f"{T}/{t['id']}/archive", headers=master).status_code == 409  # non chiusa
    client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "Ok"}, headers=master)
    assert client.post(f"{T}/{t['id']}/archive", headers=p1).status_code == 403
    assert client.post(f"{T}/rotate", headers=p1).status_code == 403
    assert client.post(f"{T}/{t['id']}/archive", headers=master).json()["archived_at"]
    assert client.post(f"{T}/{t['id']}/archive", headers=master).status_code == 409


def test_zero_retention_archives_immediately(client, p1, master, monkeypatch):
    from app import config
    monkeypatch.setattr(config, "TICKET_ARCHIVE_DAYS", 0)
    t = new(client, p1).json()
    client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "Ok"}, headers=master)
    assert client.get(T, headers=master).json()["counts"]["archivio"] == 1


def test_promote_rule_question_to_issue(client, p1, master):
    t = new(client, p1).json()
    assert client.patch(f"{T}/{t['id']}", json={"promote_issue": True}, headers=master).status_code == 422
    r = client.patch(f"{T}/{t['id']}", json={"status": "risolta", "answer": "Conta il naturale.", "promote_issue": True},
                     headers=master).json()
    assert r["issue_id"]
    issues = client.get("/api/issues", headers=master).json()
    it = next(i for i in issues if i["id"] == r["issue_id"])
    assert it["resolved"] and it["decision"] == "Conta il naturale." and it["title"] == t["title"]
    # una seconda promozione non duplica
    again = client.patch(f"{T}/{t['id']}", json={"promote_issue": True}, headers=master).json()
    assert again["issue_id"] == r["issue_id"]
    f = new(client, p1, kind="funzione").json()
    client.patch(f"{T}/{f['id']}", json={"status": "risolta", "answer": "Fatto"}, headers=master)
    assert client.patch(f"{T}/{f['id']}", json={"promote_issue": True}, headers=master).status_code == 422


def test_validation_and_limits(client, p1, p2, monkeypatch):
    from app import config
    assert new(client, p1, kind="bug").status_code == 422
    assert new(client, p1, title="ab").status_code == 422
    assert new(client, p1, title="  \u0000\u0001ab  ").status_code == 422
    assert new(client, p1, body="").status_code == 422
    assert new(client, p1, body="x" * 5001).status_code == 422
    assert new(client, p1, extra=True).status_code == 422
    assert new(client, p1, char_id=char_id(client, p2, "Eric")).status_code == 404
    assert new(client, p1, char_id=char_id(client, p1, "Kelvin")).status_code == 201
    monkeypatch.setattr(config, "TICKET_MAX_ACTIVE", 2)
    assert new(client, p1).status_code == 201
    assert new(client, p1).status_code == 429
    monkeypatch.setattr(config, "TICKET_MAX_MESSAGES", 1)
    tid = client.get(T, headers=p1).json()["items"][0]["id"]
    assert client.post(f"{T}/{tid}/messages", json={"text": "uno"}, headers=p1).status_code == 200
    assert client.post(f"{T}/{tid}/messages", json={"text": "due"}, headers=p1).status_code == 422
    assert client.post(f"{T}/{tid}/messages", json={"text": "x" * 2001}, headers=p1).status_code == 422


def test_version_conflict(client, p1, master):
    t = new(client, p1).json()
    client.patch(f"{T}/{t['id']}", json={"version": t["version"], "status": "in_esame"}, headers=master)
    assert client.patch(f"{T}/{t['id']}", json={"version": t["version"], "answer": "x"}, headers=master).status_code == 409


def test_filters(client, p1, master):
    p3 = login(client, "giocatore3")
    new(client, p1, kind="funzione", title="Esporta in PDF")
    new(client, p3, kind="contenuto", title="Nuova razza")
    assert client.get(T, headers=master).json()["total"] == 2
    assert [x["title"] for x in client.get(T, params={"kind": "contenuto"}, headers=master).json()["items"]] == ["Nuova razza"]
    assert client.get(T, params={"q": "pdf"}, headers=master).json()["total"] == 1
    assert client.get(T, params={"status": "aperta"}, headers=master).json()["counts"]["aperta"] == 2
    assert client.get(T, params={"status": "chiusa"}, headers=master).status_code == 422
    assert client.get(T, headers=p3).json()["total"] == 1


def test_requires_login(client):
    assert client.get(T).status_code == 401
    assert client.get(f"{T}/summary").status_code == 401
