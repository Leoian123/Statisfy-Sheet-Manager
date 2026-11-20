import pytest

from app import rules
from app.seed import KELVIN


def kelvin():
    """Kelvin con l'equipaggiamento applicato (Thanatos a due mani + Spalla del Simbionte)."""
    return rules.apply_equipment({k: KELVIN[k] for k in ("stats", "equip", "magia", "item_bonus", "inventory", "level")})


def by_key(c):
    return {d["key"]: d for d in rules.derived(c)}


def test_kelvin_totals_and_resources():
    t = rules.totals(KELVIN["stats"])
    assert (t["STR"], t["DEX"], t["VIT"], t["INT"]) == (170, 492, 186, 86)
    d = by_key(kelvin())
    assert d["hp"]["value"] == 2890
    assert d["mp"]["value"] == 910
    assert d["sp"]["value"] == 3360


def test_kelvin_combat_values():
    d = by_key(kelvin())
    assert d["evasione"]["base"] == pytest.approx(24.6)
    assert d["evasione"]["bonus"] == 10
    assert d["evasione"]["value"] == pytest.approx(34.6)
    assert d["critico"]["base"] == pytest.approx(17.3)
    assert d["critico"]["value"] == pytest.approx(29.3)
    assert d["critico"]["cap"] == 75
    assert d["difesa"]["value"] == pytest.approx(261.7)
    assert d["difesa"]["explain"] == "186/10 + 85 × (1 + 186/100)"
    assert d["iniziativa"]["value"] == pytest.approx(59.2)
    assert d["moltMag"]["value"] == pytest.approx(1 + 86 / 60)
    assert round(d["moltMag"]["value"], 3) == 2.433
    assert d["moltMag"]["formula"] == "1 + INT/60"
    assert d["moltMag"]["explain"] == "1 + 86/60"
    assert d["blocco"]["value"] == 0
    assert d["sp"]["explain"] == "50 + (170+492)×5"
    assert d["critico"]["explain"] == "5 + 492/40"
    assert d["evasione"]["explain"] == "492 / 20"


def test_kelvin_free_points_and_rank():
    assert rules.free_points(77, KELVIN["stats"]) == {"total": 760, "used": 760, "left": 0}
    assert rules.power_rank(77) == "Soldato Semplice"
    assert rules.power_rank(181) == "Guerriero Scelto"
    assert rules.next_talent_level(77) == 80
    assert rules.next_talent_level(80) == 85


def test_cap_applies_to_bonus():
    c = {"stats": [{"code": "DEX", "iniziale": 3000}], "item_bonus": {"critico": 50}}
    d = by_key(c)
    assert d["critico"]["base"] == 75
    assert d["critico"]["value"] == 75


def test_magic_divisor_min():
    assert rules.magic_divisor({"magia": {"nucleo": 9, "talenti": 5}}) == 10
    assert rules.magic_divisor({}) == 100


def test_death_penalty():
    p = rules.death_penalty(77, 0, False)
    assert (p["level"], p["exp_pct"], p["lost"]) == (75, 50, 1.5)
    assert rules.death_penalty(2, 40, False)["protected"] is True
    assert rules.death_penalty(1, 0, True)["protected"] is True
    p = rules.death_penalty(77, 0, True)
    assert (p["level"], p["exp_pct"], p["lost"]) == (74, 0, 3)
    p = rules.death_penalty(3, 20, True)
    assert (p["level"], p["exp_pct"]) == (1, 0)


def test_penalty_band():
    assert rules.penalty_band(10) is None
    assert rules.penalty_band(8)["band"] == "7–9"
    assert rules.penalty_band(5)["band"] == "4–6"
    assert rules.penalty_band(1)["band"] == "1–3"


def test_end_turn_and_damage_pure():
    res = {"hp": 100, "mp": 0, "sp": 0}
    combat = {"turn": 1, "effects": [{"name": "Scudo", "kind": "good", "turns": 1, "absorb": 30}],
              "cooldowns": [], "log": []}
    rules.apply_damage(res, combat, 50)
    assert res["hp"] == 80 and combat["effects"] == []
    rules.end_turn(res, combat, {"hp": 200, "mp": 910, "sp": 3360})
    assert res["mp"] == 137 and res["sp"] == 840 and combat["turn"] == 2
