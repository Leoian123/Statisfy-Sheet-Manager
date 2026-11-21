"""Amministrazione: account, ruoli, password provvisorie, assegnazione dei PG, registro e tentativi di abuso."""
import threading

from conftest import login
from test_ki import char_id

A = "/api/admin"
H = lambda tok: {"Authorization": f"Bearer {tok}"}  # noqa: E731


def make(client, master, username="luca", **kw):
    r = client.post(f"{A}/users", json={"username": username, **kw}, headers=master)
    assert r.status_code == 201, r.text
    return r.json()


def uid(client, master, username):
    return next(u["id"] for u in client.get(f"{A}/users", headers=master).json() if u["username"] == username)


def first_login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def test_players_cannot_administer(client, p1, master):
    gid = uid(client, master, "giocatore2")
    kid = char_id(client, p1, "Kelvin")
    calls = [("GET", f"{A}/users", None), ("POST", f"{A}/users", {"username": "x123"}),
             ("PATCH", f"{A}/users/{gid}", {"role": "master"}), ("POST", f"{A}/users/{gid}/reset-password", None),
             ("POST", f"{A}/users/{gid}/logout-all", None), ("DELETE", f"{A}/users/{gid}", None),
             ("PATCH", f"{A}/characters/{kid}/owner", {"owner_id": 1}), ("GET", f"{A}/log", None)]
    for method, url, body in calls:
        assert client.request(method, url, json=body, headers=p1).status_code == 403, url
        assert client.request(method, url, json=body).status_code == 401, url


def test_list_users_with_characters(client, master):
    users = client.get(f"{A}/users", headers=master).json()
    me = next(u for u in users if u["username"] == "master")
    assert me["is_self"] and me["role"] == "master" and me["active"]
    g1 = next(u for u in users if u["username"] == "giocatore1")
    assert [c["name"] for c in g1["characters"]] == ["Kelvin"]
    assert "password_hash" not in g1 and "token_version" not in g1


def test_create_with_temporary_password_forces_change(client, master):
    out = make(client, master, "luca", display_name="Luca il Bardo")
    temp = out["temporary_password"]
    assert out["user"]["must_change_password"] and len(temp) == 14
    res = first_login(client, "luca", temp)
    assert res["user"]["must_change_password"] is True
    h = H(res["token"])
    # con la password provvisoria si può solo leggere il profilo, cambiarla o uscire
    assert client.get("/api/auth/me", headers=h).status_code == 200
    assert client.get("/api/characters", headers=h).status_code == 403
    assert client.get("/api/journal", headers=h).status_code == 403
    r = client.post("/api/auth/password", json={"current_password": temp, "new_password": "una-bella-frase"}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["must_change_password"] is False
    assert client.get("/api/auth/me", headers=h).status_code == 401  # vecchio token chiuso
    h2 = H(r.json()["token"])
    assert client.get("/api/characters", headers=h2).json() == []
    assert first_login(client, "luca", "una-bella-frase")["user"]["display_name"] == "Luca il Bardo"


def test_create_with_chosen_password_still_must_change(client, master):
    out = make(client, master, "sara", password="scelta-dal-master", role="master")
    assert "temporary_password" not in out
    assert first_login(client, "sara", "scelta-dal-master")["user"]["must_change_password"] is True


def test_create_validation(client, master):
    bad = [{"username": "ab"}, {"username": "con spazi"}, {"username": "x" * 31}, {"username": "<script>"},
           {"username": "GIOCATORE1"}, {"username": "nuovo1", "role": "admin"}, {"username": "nuovo1", "extra": 1},
           {"username": "nuovo1", "password": "corta"}, {"username": "nuovo1", "password": "Nuovo1"},
           {"username": "nuovo1", "password": "NUOVO1  "}, {"username": "nuovo1", "password": "é" * 40},
           {"username": "nuovo1", "password": "        "}, {"username": "nuovo‮1"}]
    for body in bad:
        assert client.post(f"{A}/users", json=body, headers=master).status_code == 422, body
    assert make(client, master, "nuovo1", display_name="  Nome​  con\n spazi ")["user"]["display_name"] == "Nome con spazi"


def test_last_master_cannot_be_removed(client, master):
    mid = uid(client, master, "master")
    assert client.patch(f"{A}/users/{mid}", json={"role": "player"}, headers=master).status_code == 409
    assert client.patch(f"{A}/users/{mid}", json={"active": False}, headers=master).status_code == 409
    assert client.delete(f"{A}/users/{mid}", headers=master).status_code == 409
    # un secondo Master può togliere il ruolo al primo, ma non a se stesso se resta l'unico
    make(client, master, "vice", password="vice-password-1", role="master")
    vice = first_login(client, "vice", "vice-password-1")
    hv = H(client.post("/api/auth/password", json={"current_password": "vice-password-1", "new_password": "vice-password-2"},
                       headers=H(vice["token"])).json()["token"])
    assert client.patch(f"{A}/users/{mid}", json={"role": "player"}, headers=hv).status_code == 200
    assert client.get(f"{A}/users", headers=master).status_code == 401  # ruolo cambiato: sessione chiusa
    vid = uid(client, hv, "vice")
    assert client.patch(f"{A}/users/{vid}", json={"role": "player"}, headers=hv).status_code == 409
    assert client.get("/api/auth/me", headers=login(client, "master")).json()["role"] == "player"


def test_demoting_each_other_at_once_keeps_one_master(client, master):
    make(client, master, "vice", password="vice-password-1", role="master")
    tok = first_login(client, "vice", "vice-password-1")["token"]
    hv = H(client.post("/api/auth/password", json={"current_password": "vice-password-1", "new_password": "vice-password-2"},
                       headers=H(tok)).json()["token"])
    mid, vid = uid(client, master, "master"), uid(client, master, "vice")
    barrier, codes = threading.Barrier(2), []

    def go(h, target):
        barrier.wait()
        codes.append(client.patch(f"{A}/users/{target}", json={"active": False}, headers=h).status_code)

    ths = [threading.Thread(target=go, args=(master, vid)), threading.Thread(target=go, args=(hv, mid))]
    [t.start() for t in ths]
    [t.join() for t in ths]
    assert sorted(codes) == [200, 409], codes
    from sqlalchemy import func, select

    from app.db import SessionLocal
    from app.models import User
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User).where(User.role == "master", User.active.is_(True))) == 1


def test_deactivate_blocks_login_and_tokens(client, master, p1):
    gid = uid(client, master, "giocatore1")
    assert client.patch(f"{A}/users/{gid}", json={"active": False}, headers=master).json()["active"] is False
    assert client.get("/api/auth/me", headers=p1).status_code == 401
    r = client.post("/api/auth/login", json={"username": "giocatore1", "password": "giocatore1"})
    assert r.status_code == 403 and "disattivato" in r.json()["detail"]
    # password sbagliata: stessa risposta di sempre, lo stato non trapela
    assert client.post("/api/auth/login", json={"username": "giocatore1", "password": "x"}).status_code == 401
    kid = char_id(client, master, "Kelvin")
    g2 = uid(client, master, "giocatore2")
    client.patch(f"{A}/characters/{kid}/owner", json={"owner_id": g2}, headers=master)
    assert client.patch(f"{A}/characters/{kid}/owner", json={"owner_id": gid}, headers=master).status_code == 409
    assert client.patch(f"{A}/users/{gid}", json={"active": True}, headers=master).status_code == 200
    assert login(client, "giocatore1")


def test_promote_player_to_master(client, master, p1):
    gid = uid(client, master, "giocatore1")
    assert client.patch(f"{A}/users/{gid}", json={"role": "master"}, headers=master).json()["role"] == "master"
    assert client.get("/api/auth/me", headers=p1).status_code == 401
    assert client.get(f"{A}/users", headers=login(client, "giocatore1")).status_code == 200


def test_reset_password(client, master, p1):
    gid = uid(client, master, "giocatore1")
    temp = client.post(f"{A}/users/{gid}/reset-password", headers=master).json()["temporary_password"]
    assert client.get("/api/auth/me", headers=p1).status_code == 401
    assert client.post("/api/auth/login", json={"username": "giocatore1", "password": "giocatore1"}).status_code == 401
    assert first_login(client, "giocatore1", temp)["user"]["must_change_password"]
    mid = uid(client, master, "master")
    assert client.post(f"{A}/users/{mid}/reset-password", headers=master).status_code == 409


def test_logout_user_everywhere(client, master, p1):
    gid = uid(client, master, "giocatore1")
    assert client.post(f"{A}/users/{gid}/logout-all", headers=master).status_code == 204
    assert client.get("/api/auth/me", headers=p1).status_code == 401
    assert client.get("/api/auth/me", headers=master).status_code == 200


def test_delete_only_unused_accounts(client, master):
    gid = uid(client, master, "giocatore1")
    r = client.delete(f"{A}/users/{gid}", headers=master)
    assert r.status_code == 409 and "personaggi" in r.json()["detail"]
    nid = make(client, master, "prova1", password="password-prova")["user"]["id"]
    assert client.delete(f"{A}/users/{nid}", headers=master).status_code == 204
    assert client.delete(f"{A}/users/{nid}", headers=master).status_code == 404


def test_deleted_account_token_not_valid_for_reused_id(client, master):
    out = make(client, master, "prova1", password="password-prova")
    old = first_login(client, "prova1", "password-prova")["token"]
    assert client.delete(f"{A}/users/{out['user']['id']}", headers=master).status_code == 204
    new = make(client, master, "prova2", password="password-prova")
    assert new["user"]["id"] == out["user"]["id"]  # SQLite riusa l'id
    assert client.get("/api/auth/me", headers=H(old)).status_code == 401


def test_assign_character(client, master, p1, p2):
    kid = char_id(client, p1, "Kelvin")
    g2 = uid(client, master, "giocatore2")
    r = client.patch(f"{A}/characters/{kid}/owner", json={"owner_id": g2}, headers=master)
    assert r.status_code == 200 and r.json()["owner_id"] == g2 and r.json()["owner_name"]
    assert client.get(f"/api/characters/{kid}", headers=p1).status_code == 404
    assert client.get(f"/api/characters/{kid}", headers=p2).json()["name"] == "Kelvin"
    assert client.get("/api/characters", headers=p2).json()[-1]["owner_id"] == g2
    assert client.patch(f"{A}/characters/{kid}/owner", json={"owner_id": 999}, headers=master).status_code == 404
    assert client.patch(f"{A}/characters/999/owner", json={"owner_id": g2}, headers=master).status_code == 404
    assert client.patch(f"{A}/characters/{kid}/owner", json={"owner_id": "2; DROP"}, headers=master).status_code == 422


def test_rename_username(client, master):
    gid = uid(client, master, "giocatore1")
    assert client.patch(f"{A}/users/{gid}", json={"username": "Giocatore2"}, headers=master).status_code == 422
    assert client.patch(f"{A}/users/{gid}", json={"username": "g uno"}, headers=master).status_code == 422
    assert client.patch(f"{A}/users/{gid}", json={"username": "kelvin.player", "display_name": "  "},
                        headers=master).status_code == 422
    assert client.patch(f"{A}/users/{gid}", json={"username": "kelvin.player"}, headers=master).json()["username"] == "kelvin.player"
    assert client.post("/api/auth/login", json={"username": "kelvin.player", "password": "giocatore1"}).status_code == 200


def test_admin_log(client, master):
    nid = make(client, master, "prova1", password="password-prova")["user"]["id"]
    client.patch(f"{A}/users/{nid}", json={"role": "master"}, headers=master)
    client.delete(f"{A}/users/{nid}", headers=master)
    log = client.get(f"{A}/log", headers=master).json()
    assert [x["action"] for x in log[:3]] == ["elimina", "modifica", "crea"]
    assert all(x["actor"] == "master" and x["target"] == "prova1" for x in log[:3])
    assert "password-prova" not in str(log)
    assert client.get(f"{A}/log", params={"limit": 0}, headers=master).status_code == 422


def test_admin_log_is_trimmed(client, master, monkeypatch):
    from app import accounts
    monkeypatch.setattr(accounts, "LOG_KEEP", 3)
    gid = uid(client, master, "giocatore1")
    for i in range(6):
        client.patch(f"{A}/users/{gid}", json={"display_name": f"Nome {i}"}, headers=master)
    log = client.get(f"{A}/log", headers=master).json()
    assert len(log) == 3 and log[0]["detail"] == "nome visibile «Nome 5»"


def test_change_password_checks(client, p1):
    url = "/api/auth/password"
    assert client.post(url, json={"current_password": "sbagliata", "new_password": "nuova-password"}, headers=p1).status_code == 422
    assert client.post(url, json={"current_password": "giocatore1", "new_password": "giocatore1"}, headers=p1).status_code == 422
    assert client.post(url, json={"current_password": "giocatore1", "new_password": "corta"}, headers=p1).status_code == 422
    assert client.post(url, json={"current_password": "giocatore1", "new_password": "nuova-password", "x": 1},
                       headers=p1).status_code == 422
    assert client.post(url, json={"current_password": "giocatore1", "new_password": "nuova-password"}).status_code == 401


def test_change_password_brute_force_limited(client, p1):
    url = "/api/auth/password"
    for _ in range(10):
        client.post(url, json={"current_password": "tentativo", "new_password": "nuova-password"}, headers=p1)
    r = client.post(url, json={"current_password": "giocatore1", "new_password": "nuova-password"}, headers=p1)
    assert r.status_code == 429


def test_update_own_display_name(client, p1):
    r = client.patch("/api/auth/me", json={"display_name": "  Il‮  Domatore "}, headers=p1)
    assert r.status_code == 200 and r.json()["display_name"] == "Il Domatore"
    assert client.patch("/api/auth/me", json={"display_name": "​"}, headers=p1).status_code == 422
    assert client.patch("/api/auth/me", json={"role": "master", "display_name": "x"}, headers=p1).status_code == 422
    assert client.get("/api/auth/me", headers=p1).json()["role"] == "player"


def test_cli_activate_recovers_master(client, master, monkeypatch):
    from app import users
    make(client, master, "vice", password="vice-password-1", role="master")
    vid = uid(client, master, "vice")
    client.patch(f"{A}/users/{vid}", json={"active": False}, headers=master)
    assert users.main(["activate", "vice"]) == 0
    assert client.post("/api/auth/login", json={"username": "vice", "password": "vice-password-1"}).status_code == 200


def test_old_database_gets_admin_columns(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from app.db import ensure_columns
    eng = create_engine(f"sqlite:///{(tmp_path / 'old.db').as_posix()}")
    with eng.begin() as c:
        c.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50), password_hash VARCHAR(100), "
                       "display_name VARCHAR(100), role VARCHAR(10))"))
        c.execute(text("INSERT INTO users VALUES (1, 'm', 'h', 'M', 'master')"))
    added = ensure_columns(eng)
    assert {"users.active", "users.must_change_password", "users.created_at", "users.last_login_at"} <= set(added)
    with eng.connect() as c:
        row = c.execute(text("SELECT active, must_change_password, created_at FROM users")).one()
    assert tuple(row) == (1, 0, "")
    assert "token_version" in {x["name"] for x in inspect(eng).get_columns("users")}
