"""Validazione e casi limite: NaN/Infinito, interi enormi, testi lunghi, unicode, JSON malformato, risorse, morte,
equipaggiamento, import Excel ostile, payload enormi."""
import io
import time
import zipfile

import pytest
from openpyxl import Workbook

from app import rules
from conftest import login

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def cid(client, h, name):
    return next(c["id"] for c in client.get("/api/characters", headers=h).json() if c["name"] == name)


def raw_post(client, url, h, body: str, method="POST"):
    return client.request(method, url, headers={**h, "Content-Type": "application/json"}, content=body)


# ---------------------------------------------------------------- NaN, Infinito, numeri enormi

@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e999", "-1e999"])
def test_non_finite_numbers_rejected_on_effects(client, p1, literal):
    """Un giocatore non deve poter salvare un valore non finito: ogni lettura della scheda finirebbe in 500."""
    kid = cid(client, p1, "Kelvin")
    url = f"/api/characters/{kid}/combat/effects"
    for field in ("hpPerTurn", "absorb"):
        r = raw_post(client, url, p1, f'{{"name":"X","kind":"bad","turns":2,"text":"t","{field}":{literal}}}')
        assert r.status_code == 422, (field, r.status_code, r.text)
    assert client.get(f"/api/characters/{kid}", headers=p1).status_code == 200
    assert client.post(f"/api/characters/{kid}/combat/end-turn", headers=p1).status_code == 200


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "1e999"])
def test_non_finite_numbers_rejected_everywhere(client, master, literal):
    kid = cid(client, master, "Kelvin")
    url = f"/api/characters/{kid}"
    for body in (f'{{"resources":{{"hp":{literal},"mp":1,"sp":1}}}}',
                 f'{{"item_bonus":{{"hp":{literal}}}}}',
                 f'{{"equip":{{"difesa":{literal}}}}}',
                 f'{{"exp_pct":{literal}}}'):
        r = raw_post(client, url, master, body, method="PATCH")
        assert r.status_code == 422, (body, r.status_code, r.text)
    r = raw_post(client, "/api/rules/preview", master, f'{{"stats":[{{"code":"STR","iniziale":{literal}}}]}}')
    assert r.status_code == 422
    assert client.get(url, headers=master).status_code == 200


def test_num_is_finite():
    assert rules.num(float("inf")) == 0 and rules.num(float("-inf")) == 0 and rules.num("nan") == 0
    assert rules.num(10 ** 400) == 0  # OverflowError → 0, non 500
    assert rules.num("1e999") == 0


@pytest.mark.parametrize("kind", ["damage", "heal", "spend_mp", "spend_sp"])
def test_huge_combat_amounts(client, p1, kind):
    kid = cid(client, p1, "Kelvin")
    for amount in (10 ** 400, 10 ** 30, 2 ** 63):
        r = client.post(f"/api/characters/{kid}/combat/action", headers=p1, json={"type": kind, "amount": amount})
        assert r.status_code == 422, (amount, r.status_code)
    for amount in (0, -1, 1.5, "abc", None):  # "10" e true passano per coercizione (Pydantic lax): innocuo
        r = client.post(f"/api/characters/{kid}/combat/action", headers=p1, json={"type": kind, "amount": amount})
        assert r.status_code == 422, amount


def test_huge_ints_in_master_patch(client, master):
    kid = cid(client, master, "Kelvin")
    for body in ({"level": 10 ** 20}, {"corone": 10 ** 20}, {"scellini": 2 ** 63}, {"level": 0}, {"corone": -1}):
        r = client.patch(f"/api/characters/{kid}", headers=master, json=body)
        assert r.status_code == 422, (body, r.status_code, r.text)
    assert client.get(f"/api/characters/{kid}", headers=master).status_code == 200


def test_huge_alloc_in_distribute(client, p1):
    kid = cid(client, p1, "Kelvin")
    for alloc in ({"STR": 10 ** 30}, {"STR": -5, "DEX": 10}, {"XYZ": 1}, {}, {"STR": 0}):
        r = client.post(f"/api/characters/{kid}/distribute", headers=p1, json={"alloc": alloc})
        assert r.status_code == 422, alloc


# ---------------------------------------------------------------- testi lunghi, unicode, JSON malformato

def test_long_strings(client, p1):
    kid = cid(client, p1, "Kelvin")
    url = f"/api/characters/{kid}/combat/effects"
    assert client.post(url, headers=p1, json={"name": "x" * 61, "kind": "bad", "turns": 1}).status_code == 422
    r = client.post(url, headers=p1, json={"name": "X", "kind": "bad", "turns": 1, "text": "y" * 100_000})
    assert r.status_code == 422
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra", "reason": "z" * 10_000})
    assert r.status_code == 422


def test_body_size_limit(client, master, p1):
    kid = cid(client, p1, "Kelvin")
    big = '{"reason":"' + "a" * 3_000_000 + '"}'
    r = raw_post(client, f"/api/table/characters/{kid}/rolls", p1, big)
    assert r.status_code == 413
    big = '{"name":"X","knows":"' + "a" * 3_000_000 + '"}'
    assert raw_post(client, "/api/npcs", master, big).status_code == 413
    # i payload normali passano
    assert client.post("/api/npcs", headers=master, json={"name": "Ok", "knows": "a" * 10_000}).status_code == 201


def test_unicode_and_emoji(client, master, p1):
    kid = cid(client, p1, "Kelvin")
    reason = "Tiro 🎲 per l'Ælfwine — 测试 \u200b ‮gnirts"
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra", "reason": reason})
    assert r.status_code == 201 and r.json()["reason"] == reason
    n = client.post("/api/npcs", headers=master, json={"name": "Ñandú 🐉", "race": "Drago"}).json()
    assert n["name"] == "Ñandú 🐉"
    # nomi PG: solo lettere e numeri, niente emoji né spazi
    body = {"name": "Drago🐉", "classe_id": "guerriero", "regno_id": "valeria",
            "stats": {"STR": 15, "DEX": 15, "VIT": 15, "INT": 15}}
    assert client.post("/api/characters", headers=p1, json=body).status_code == 422
    body["name"] = "Ærwen"
    assert client.post("/api/characters", headers=p1, json=body).status_code == 201
    body["name"] = "ærwen"  # duplicato a meno delle maiuscole
    assert client.post("/api/characters", headers=p1, json=body).status_code == 422


@pytest.mark.parametrize("body", ['{"type":"damage","amount":5', '{"type":', "[]", "null", '"x"', "", "{'a':1}",
                                  '{"type":"damage","amount":5}}', "\xff\xfe"])
def test_malformed_json(client, p1, body):
    kid = cid(client, p1, "Kelvin")
    r = raw_post(client, f"/api/characters/{kid}/combat/action", p1, body.encode("utf-8", "surrogatepass")
                 if isinstance(body, str) else body)
    assert r.status_code in (400, 422), r.status_code
    assert isinstance(r.json()["detail"], str)


def test_wrong_types_and_nonexistent_ids(client, master, p1):
    kid = cid(client, p1, "Kelvin")
    assert client.patch(f"/api/characters/{kid}", headers=p1, json=[1, 2]).status_code == 422
    assert client.patch(f"/api/characters/{kid}", headers=p1, json={"resources": "full"}).status_code == 422
    assert client.patch(f"/api/characters/{kid}", headers=p1, json={"combat": {"position": "Cielo"}}).status_code == 422
    assert client.patch(f"/api/characters/{kid}", headers=p1, json={"combat": {"position": "Mischia", "turn": 9}}).status_code == 422
    assert client.get("/api/characters/abc", headers=p1).status_code == 422
    assert client.get("/api/characters/-1", headers=p1).status_code == 404
    assert client.get(f"/api/characters/{2 ** 70}", headers=p1).status_code == 422  # prima: 500 (OverflowError SQLite)
    assert client.patch(f"/api/npcs/{2 ** 70}", headers=master, json={"name": "x"}).status_code == 422
    assert client.delete(f"/api/characters/{kid}/combat/effects/99", headers=p1).status_code == 404
    assert client.delete(f"/api/characters/{kid}/combat/effects/-1", headers=p1).status_code == 404
    assert client.patch("/api/npcs/999999", headers=master, json={"name": "x"}).status_code == 404
    assert client.patch("/api/issues/999999", headers=master, json={"resolved": True}).status_code == 404
    assert client.delete("/api/table/requests/999999", headers=master).status_code == 404
    assert client.post("/api/table/requests", headers=master, json={"char_id": 999999, "what": "xx"}).status_code == 404
    r = client.post(f"/api/table/characters/{kid}/rolls", headers=p1, json={"call": "sopra", "request_id": 999999})
    assert r.status_code == 201 and r.json()["request_id"] is None
    assert client.get("/api/table/rolls?limit=100000", headers=p1).status_code == 422
    assert client.get("/api/table/rolls?limit=0", headers=p1).status_code == 422


def test_master_patch_lists_edge_cases(client, master):
    kid = cid(client, master, "Kelvin")
    url = f"/api/characters/{kid}"
    c = client.get(url, headers=master).json()
    stats = [{k: v for k, v in r.items() if k not in ("total",)} for r in c["stats"]]
    assert client.patch(url, headers=master, json={"stats": []}).status_code == 422          # basi rimosse
    assert client.patch(url, headers=master, json={"stats": stats + [stats[0]]}).status_code == 422  # duplicato
    neg = [{**r, "altro": -10_000} if r["code"] == "STR" else r for r in stats]
    assert client.patch(url, headers=master, json={"stats": neg}).status_code == 422          # totale negativo
    assert client.patch(url, headers=master, json={"titles": [{"name": "", "rarity": "Raro"}]}).status_code == 422
    assert client.patch(url, headers=master, json={"titles": [{"name": "T", "rarity": "Inventata"}]}).status_code == 422
    # liste vuote ammesse
    r = client.patch(url, headers=master, json={"titles": [], "pets": [], "curses": []})
    assert r.status_code == 200 and r.json()["titles"] == []


# ---------------------------------------------------------------- risorse, morte, livello

def test_resources_bounds(client, p1):
    kid = cid(client, p1, "Kelvin")
    url = f"/api/characters/{kid}"
    mx = {d["key"]: d["value"] for d in client.get(url, headers=p1).json()["derived"]}
    assert client.patch(url, headers=p1, json={"resources": {"hp": -1, "mp": 0, "sp": 0}}).status_code == 422
    assert client.patch(url, headers=p1, json={"resources": {"hp": mx["hp"] + 1, "mp": 0, "sp": 0}}).status_code == 422
    assert client.patch(url, headers=p1, json={"resources": {"hp": 1, "mp": 0, "sp": 0, "ki": 5}}).status_code == 422
    r = client.patch(url, headers=p1, json={"resources": {"hp": 0, "mp": 0, "sp": 0}})
    assert r.status_code == 200 and r.json()["resources"]["hp"] == 0
    # danno oltre gli HP: resta 0
    r = client.post(f"{url}/combat/action", headers=p1, json={"type": "damage", "amount": 10 ** 9})
    assert r.status_code == 200 and r.json()["resources"]["hp"] == 0
    # spendere più di quanto si ha
    r = client.post(f"{url}/combat/action", headers=p1, json={"type": "spend_mp", "amount": 1})
    assert r.status_code == 422
    r = client.post(f"{url}/combat/action", headers=p1, json={"type": "spend_ki", "amount": 1})
    assert r.status_code == 422  # Kelvin non ha KI
    r = client.post(f"{url}/combat/action", headers=p1, json={"type": "heal", "amount": 10 ** 9})
    assert r.status_code == 200 and r.json()["resources"]["hp"] == mx["hp"]


def test_death_at_low_level_and_repeated(client, p1):
    body = {"name": "Novizio", "classe_id": "mago", "regno_id": "qadesh",
            "stats": {"STR": 10, "DEX": 10, "VIT": 15, "INT": 25}}
    c = client.post("/api/characters", headers=p1, json=body).json()
    url = f"/api/characters/{c['id']}"
    for _ in range(3):
        r = client.post(f"{url}/death", headers=p1, json={"hubris": True, "respawn": "here"})
        assert r.status_code == 200 and r.json()["level"] == 1 and r.json()["death"]["protected"]
        assert r.json()["resources"]["hp"] == 1
    for _ in range(3):
        client.post(f"{url}/level-up", headers=p1)
    r = client.post(f"{url}/death", headers=p1, json={"hubris": True})
    assert r.json()["level"] == 1 and r.json()["exp_pct"] == 0  # 4 − 3 = 1, mai sotto 1
    assert client.post(f"{url}/death", headers=p1, json={"respawn": "altrove"}).status_code == 422
    # i punti investiti restano ma il residuo non va sotto zero
    assert r.json()["free_points"]["left"] >= 0


def test_effect_turn_bounds(client, p1):
    kid = cid(client, p1, "Kelvin")
    url = f"/api/characters/{kid}/combat/effects"
    for turns in (0, 100, -1, 1.5):
        assert client.post(url, headers=p1, json={"name": "X", "kind": "good", "turns": turns}).status_code == 422
    assert client.post(url, headers=p1, json={"name": "   ", "kind": "good", "turns": 1}).status_code == 422
    assert client.post(url, headers=p1, json={"name": "X", "kind": "neutro", "turns": 1}).status_code == 422
    for hp in (10 ** 10, -10 ** 10):
        assert client.post(url, headers=p1, json={"name": "X", "kind": "good", "turns": 1, "hpPerTurn": hp}).status_code == 422


# ---------------------------------------------------------------- equipaggiamento

def test_equipment_edge_cases(client, master):
    kid = cid(client, master, "Kelvin")
    base = f"/api/characters/{kid}/equipment"
    c = client.get(f"/api/characters/{kid}", headers=master).json()
    bag = [i for i in c["inventory"] if not i["slot"]]
    assert client.post(f"{base}/equip", headers=master, json={"item_id": "inesistente"}).status_code == 422
    assert client.post(f"{base}/equip", headers=master, json={"item_id": ""}).status_code == 422
    assert client.post(f"{base}/equip", headers=master, json={"item_id": "x", "slot": "coda"}).status_code == 422
    assert client.post(f"{base}/unequip", headers=master, json={"slot": "coda"}).status_code == 422
    assert client.post(f"{base}/move", headers=master, json={"from_slot": "testa", "to_slot": "testa"}).status_code == 422
    coins = next(i for i in c["inventory"] if i["type"] == "Monete")
    r = client.post(f"{base}/equip", headers=master, json={"item_id": coins["id"]})
    assert r.status_code == 422 and "non equipaggiabile" in r.json()["detail"]
    # quantità 0 e quantità > 1 su un oggetto equipaggiabile
    inv = [{k: v for k, v in i.items() if k != "unmet"} for i in c["inventory"]]
    eq = next((i for i in inv if i["equip_type"] and i["slot"]), None)
    if eq is not None:
        for qty in (0, 2):
            bad = [{**i, "qty": qty} if i["id"] == eq["id"] else i for i in inv]
            r = client.patch(f"/api/characters/{kid}", headers=master, json={"inventory": bad})
            assert r.status_code == 422 and "quantità 1" in r.json()["detail"], qty
    neg = [{**inv[0], "qty": -1}, *inv[1:]]
    assert client.patch(f"/api/characters/{kid}", headers=master, json={"inventory": neg}).status_code == 422
    assert bag is not None


# ---------------------------------------------------------------- rules/preview

def test_preview_requires_login(client, p1):
    stats = [{"code": "STR", "iniziale": 10}]
    assert client.post("/api/rules/preview", json={"stats": stats}).status_code == 401
    assert client.post("/api/rules/preview", headers=p1, json={"stats": stats}).status_code == 200
    assert client.post("/api/rules/preview", headers=p1, json={"stats": stats * 500}).status_code == 422


# ---------------------------------------------------------------- import Excel ostile

def upload(client, h, content, name="x.xlsx", ctype=XLSX, **form):
    return client.post("/api/import/excel", headers=h, data=form, files={"file": (name, content, ctype)})


def tiny_xlsx(**cells):
    wb = Workbook()
    ws = wb.active
    for k, v in cells.items():
        ws[k] = v
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_import_not_xlsx(client, master):
    assert upload(client, master, b"%PDF-1.4", name="x.pdf").status_code == 422
    assert upload(client, master, b"not a zip", name="x.xlsx").status_code == 422
    assert upload(client, master, b"", name="x.xlsx").status_code == 422
    # zip valido ma non xlsx
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("hello.txt", "ciao")
    assert upload(client, master, buf.getvalue(), name="x.xlsx").status_code == 422


def test_import_too_big(client, master):
    r = upload(client, master, b"0" * (5 * 1024 * 1024 + 10))
    assert r.status_code == 413


def test_import_zip_bomb_rejected_fast(client, master):
    """Un .xlsx piccolo che si espande in centinaia di MB: rifiutato prima di openpyxl."""
    base = tiny_xlsx(A1="x")
    src = zipfile.ZipFile(io.BytesIO(base))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                pad = b"<!--" + b" " * (120 * 1024 * 1024) + b"-->"
                data = data.replace(b"<sheetData>", pad + b"<sheetData>", 1) if b"<sheetData>" in data else data + pad
            z.writestr(item, data)
    content = out.getvalue()
    assert len(content) < 5 * 1024 * 1024
    t = time.monotonic()
    r = upload(client, master, content)
    assert r.status_code == 422, r.status_code
    assert time.monotonic() - t < 5


def test_import_huge_dimensions_rejected_fast(client, master):
    """Scheda valida + foglio accessorio «Skills» con una sola cella lontana: il parser scorreva
    max_row × max_col celle (con ZZ5000 oltre 3 minuti; con XFD1048576 17 miliardi di celle)."""
    from test_import import synthetic
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(synthetic()))
    wb.create_sheet("Skills")["XFD1048576"] = "x"
    buf = io.BytesIO()
    wb.save(buf)
    content = buf.getvalue()
    t = time.monotonic()
    r = upload(client, master, content, dry_run="true")
    assert r.status_code == 422, (r.status_code, r.text[:200])
    assert time.monotonic() - t < 5


def test_import_empty_and_formula_sheets(client, master):
    r = upload(client, master, tiny_xlsx(), dry_run="true")
    assert r.status_code == 200
    assert r.json()["characters"] == []
    r = upload(client, master, tiny_xlsx(A1="=1+1", B2='=HYPERLINK("http://x","y")', C3="=cmd|' /C calc'!A0"),
               dry_run="true")
    assert r.status_code == 200


def test_import_filename_path_traversal(client, master, tmp_path):
    before = set(p.name for p in tmp_path.parent.iterdir())
    for name in ("../../evil.xlsx", "..\\..\\evil.xlsx", "/etc/passwd.xlsx", "C:\\Windows\\x.xlsx", "<img src=x>.xlsx"):
        r = upload(client, master, tiny_xlsx(), name=name, dry_run="true")
        assert r.status_code == 200, name
    assert set(p.name for p in tmp_path.parent.iterdir()) == before


def test_import_owners_param(client, master):
    for owners in ("[1,2]", "not json", '"x"', "1"):
        assert upload(client, master, tiny_xlsx(), owners=owners).status_code == 422


def test_login_endpoint_still_works_for_all_seed_users(client):
    for u in ["master"] + [f"giocatore{i}" for i in range(1, 7)]:
        login(client, u)
