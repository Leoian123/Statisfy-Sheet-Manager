"""Motore di combattimento: un modello per categoria e i casi limite."""
import copy
import json
import random

import pytest

from app import engine as E
from app import mech as MECH
from app.mech_templates import TEMPLATES

TPL = {t["cat"]: t["mech"] for t in TEMPLATES}


def ab(nome, mech, grado=5):
    m, errs = MECH.parse(mech)
    assert not errs, errs
    return {"nome": nome, "grado": grado, "efficacia": grado, "mech": MECH.dump(m)}


def base_state(extra_abilities=(), enemy_abilities=(), hp=1000):
    eric = E.combatant("p1", "Eric", "alleati", 2000, mp=5000, sp=500, arma=[50, 50],
                       stat_vals={"precisione": 100, "evasione": 0, "critico": 0, "moltMag": 2, "iniziativa": 50},
                       abilita=list(extra_abilities), rif="pg:1")
    corax = E.combatant("p2", "Corax", "alleati", 1500, mp=500, sp=500, arma=[40, 40],
                        stat_vals={"precisione": 100, "evasione": 0, "critico": 0, "iniziativa": 40}, rif="pg:2")
    lupo_a = E.combatant("n1", "Lupo A", "nemici", hp, arma=[30, 30], abilita=list(enemy_abilities),
                         stat_vals={"precisione": 100, "evasione": 0, "critico": 0, "iniziativa": 30})
    lupo_b = E.combatant("n2", "Lupo B", "nemici", hp, arma=[30, 30],
                         stat_vals={"precisione": 100, "evasione": 0, "critico": 0, "iniziativa": 20})
    s = E.new_state([eric, corax, lupo_a, lupo_b])
    E.start(s, random.Random(1), tiri={f"ini:{k}": 10 for k in s["combattenti"]})
    assert E.current(s)["id"] == "p1"
    return s


def use(s, nome, bersagli=("n1",), attore="p1", seed=3, **kw):
    return E.act(s, {"attore": attore, "abilita": nome, "bersagli": list(bersagli)}, random.Random(seed), **kw)


def ctx(s):
    return E.Ctx(s, None, random.Random(1))


@pytest.mark.parametrize("t", TEMPLATES, ids=lambda t: f"{t['cat']:02d}")
def test_every_template_runs(t):
    """Ogni modello si valida, si descrive, si anteprima e si risolve senza errori; poi i turni avanzano."""
    m, errs = MECH.parse(t["mech"])
    assert not errs, errs
    assert MECH.describe(m)
    extra = [ab("Scudo", TPL[9]), ab("Dardo arcano", TPL[1])] if m.fusione else []
    s = base_state([ab("Prova", t["mech"])] + extra)
    if m.tipo == "passiva" or m.timing == "reazione":
        for _ in range(4):
            E.next_turn(s, random.Random(2))
        return
    target = "p2" if m.effetti and m.effetti[0].bersaglio.lato == "alleato" else "n1"
    if m.costi and m.costi[0].risorsa == "stack":
        p1 = s["combattenti"]["p1"]
        E.add_status(ctx(s), p1, p1, "Carica", stack=3)
    if m.effetti and m.effetti[0].azione.op == "resuscita":
        s["combattenti"]["p2"].update(vivo=False, hp=0)
    E.preview(s, {"attore": "p1", "abilita": "Prova", "bersagli": [target]})
    out = use(s, "Prova", [target])
    assert out["esito"] == "ok"
    for _ in range(8):
        E.next_turn(s, random.Random(4))
    assert s["round"] >= 2
    json.dumps(s)


def test_bolt_damage_formula_and_preview():
    s = base_state([ab("Dardo", TPL[1], grado=9)])
    p = E.preview(s, {"attore": "p1", "abilita": "Dardo", "bersagli": ["n1"]})
    assert p["stima"]["n1"]["danno"] == [15 * 9 * 2, 30 * 9 * 2]  # 15–30 × efficacia 9 × molt. magico 2
    assert any(r["key"] == "danno:a.0:n1" for r in p["richieste"])
    use(s, "Dardo", tiri={"danno:a.0:n1": 20 * 9})
    assert s["combattenti"]["n1"]["hp"] == 1000 - 360
    assert s["combattenti"]["p1"]["mp"] == 5000 - 30


def test_miss_with_manual_roll():
    s = base_state([ab("Dardo", TPL[1])])
    s["combattenti"]["n1"]["stat"]["evasione"] = 50  # soglia 100 − 50 = 50
    use(s, "Dardo", tiri={"colpo:n1": 80})
    assert s["combattenti"]["n1"]["hp"] == 1000
    assert any("manca" in r["t"] for r in s["registro"])


def test_maintained_geyser_ticks_and_scales():
    s = base_state([ab("Geyser", TPL[3], grado=1)], hp=100000)
    use(s, "Geyser", ["n1", "n2"], tiri={"danno:a.0:n1": 15, "danno:a.0:n2": 15})
    assert s["combattenti"]["n1"]["hp"] == 100000 - 30
    for _ in range(4):  # torna il turno di Eric: primo tick, +15%
        E.next_turn(s, random.Random(1))
    assert E.current(s)["id"] == "p1"
    assert s["combattenti"]["p1"]["mantenuti"][0]["turni"] == 1
    assert s["combattenti"]["n1"]["hp"] < 100000 - 30
    E.toggle_off(s, "p1", "Geyser")
    assert not s["combattenti"]["p1"]["mantenuti"]
    with pytest.raises(E.EngineError):
        E.toggle_off(s, "p1", "Geyser")


def test_maintained_dropped_without_mana():
    s = base_state([ab("Geyser", TPL[3], grado=1)], hp=100000)
    use(s, "Geyser", ["n1"])
    p1 = s["combattenti"]["p1"]
    p1["mp_max"] = 10  # la rigenerazione non basta più
    p1["mp"] = 0
    for _ in range(4):
        E.next_turn(s, random.Random(1))
    assert not p1["mantenuti"]


def test_frost_stacks_freeze_and_skip_turn():
    s = base_state([ab("Gelo", TPL[36])], hp=100000)
    for i in range(3):
        s["combattenti"]["p1"]["azioni"]["principale"] = 1
        use(s, "Gelo", seed=i)
    n1 = s["combattenti"]["n1"]
    assert [x["nome"] for x in n1["status"]] == ["Congelato"]
    E.next_turn(s)  # Corax
    E.next_turn(s)  # Lupo A congelato salta: tocca a Lupo B
    assert E.current(s)["id"] == "n2"
    assert any("salta il turno" in r["t"] for r in s["registro"])
    assert not E.statuses(n1, nome="Congelato")


def test_detonation_consumes_stacks():
    s = base_state([ab("Gelo", TPL[36], 1), ab("Detona", TPL[37], 1)], hp=100000)
    use(s, "Gelo", tiri={"danno:a.0:n1": 15})
    s["combattenti"]["p1"]["azioni"]["principale"] = 1
    use(s, "Detona", tiri={"danno:a.0.f.0:n1": 15})
    n1 = s["combattenti"]["n1"]
    assert not E.statuses(n1, nome="Gelo")
    assert n1["hp"] == 100000 - 30 - 45  # 15 × 2 × (1 + 50%)


def test_shield_absorbs_then_hp():
    s = base_state([ab("Scudo", TPL[9])])
    use(s, "Scudo", ["p2"])
    E.next_turn(s)
    E.next_turn(s)  # Lupo A
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p2"]}, random.Random(1))
    p2 = s["combattenti"]["p2"]
    assert p2["hp"] == 1500
    assert E.statuses(p2, nome="Scudo")[0]["valore"] == 150 - 30


def test_pure_ignores_shield_and_resistance():
    s = base_state([ab("Puro", TPL[20], 1)])
    n1 = s["combattenti"]["n1"]
    E.add_status(ctx(s), n1, n1, "Scudo", valore=500)
    n1["resistenze"] = {"puro": 90, "magico": 90}
    use(s, "Puro", tiri={"danno:a.0:n1": 20})
    assert n1["hp"] == 1000 - 40


def test_resistance_and_penetration():
    s = base_state([ab("Pen", TPL[68], 1)])
    n1 = s["combattenti"]["n1"]
    n1["resistenze"] = {"Aqua": 50}
    use(s, "Pen", tiri={"danno:a.0:n1": 20})  # 40 × (1 − 50% × 0,65) = 27
    assert round(1000 - n1["hp"]) == 27


def test_mark_increases_damage_from_everyone():
    s = base_state([ab("Marchio", TPL[33])])
    use(s, "Marchio")
    E.next_turn(s)
    E.act(s, {"attore": "p2", "abilita": "Attacco", "bersagli": ["n1"]}, random.Random(1))
    assert s["combattenti"]["n1"]["hp"] == 1000 - 48  # 40 × 1,2


def test_chain_falls_off():
    s = base_state([ab("Catena", TPL[18], 1)])
    use(s, "Catena", ["n1", "n2"], tiri={"danno:a.0:n1": 20, "danno:a.0:n2": 20})
    assert s["combattenti"]["n1"]["hp"] == 1000 - 40
    assert s["combattenti"]["n2"]["hp"] == 1000 - 30  # −25% al salto


def test_delayed_bomb():
    s = base_state([ab("Bomba", TPL[19], 1)])
    use(s, "Bomba")
    assert s["combattenti"]["n1"]["hp"] == 1000
    for _ in range(8):
        E.next_turn(s, random.Random(1))
    assert s["combattenti"]["n1"]["hp"] < 1000
    assert not [w for w in s["in_attesa"] if w["tipo"] == "bomba"]


def test_channel_interrupted_by_reaction():
    s = base_state([ab("Meteora", TPL[46])], enemy_abilities=[ab("Counterspell", TPL[12])])
    s["combattenti"]["n1"]["mp"] = s["combattenti"]["n1"]["mp_max"] = 500
    out = use(s, "Meteora", ["n1", "n2"])
    assert out["esito"] == "reazione"
    w = out["finestra"]
    assert w["candidati"][0]["abilita"] == "Counterspell"
    E.react(s, w["id"], {"attore": "n1", "abilita": "Counterspell", "bersagli": ["p1"]}, random.Random(1))
    assert not [x for x in s["in_attesa"] if x["tipo"] in ("canalizzazione", "reazione")]
    assert any("annullato" in r["t"] for r in s["registro"])
    assert s["combattenti"]["n1"]["azioni"]["reazione"] == 0


def test_reaction_skipped_then_channel_completes():
    s = base_state([ab("Meteora", TPL[46], 1)], enemy_abilities=[ab("Counterspell", TPL[12])], hp=100000)
    s["combattenti"]["n1"]["mp"] = s["combattenti"]["n1"]["mp_max"] = 500
    out = use(s, "Meteora", ["n1", "n2"])
    E.react(s, out["finestra"]["id"], None)
    assert [x for x in s["in_attesa"] if x["tipo"] == "canalizzazione"]
    for _ in range(8):
        E.next_turn(s, random.Random(1))
    assert s["combattenti"]["n1"]["hp"] < 100000


def test_redirect_reaction():
    s = base_state([ab("Dardo", TPL[1], 1)], enemy_abilities=[ab("Deflettore", TPL[11])])
    s["combattenti"]["n1"]["mp"] = s["combattenti"]["n1"]["mp_max"] = 500
    out = use(s, "Dardo", ["n2"])
    E.react(s, out["finestra"]["id"], {"attore": "n1", "abilita": "Deflettore"}, random.Random(1),
            tiri={"danno:a.0:n1": 20})
    assert s["combattenti"]["n2"]["hp"] == 1000
    assert s["combattenti"]["n1"]["hp"] == 1000 - 40


def test_taunt_forces_target():
    s = base_state([ab("Provoca", TPL[27])])
    use(s, "Provoca", [])
    E.next_turn(s)
    E.next_turn(s)  # Lupo A, provocato da Eric
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p2"]}, random.Random(1))
    assert s["combattenti"]["p2"]["hp"] == 1500
    assert s["combattenti"]["p1"]["hp"] == 2000 - 30


def test_invisible_untargetable_until_acting():
    s = base_state([ab("Invisibilità", TPL[29])])
    use(s, "Invisibilità", [])
    E.next_turn(s)
    E.next_turn(s)
    with pytest.raises(E.EngineError):
        E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p1"]}, random.Random(1))


def test_execute_below_threshold_and_on_kill_heal():
    s = base_state([ab("Esegui", TPL[16]), ab("Vampiro", TPL[63])])
    p1 = s["combattenti"]["p1"]
    p1["hp"] = 1000
    s["combattenti"]["n1"]["hp"] = 100
    use(s, "Esegui")
    assert not s["combattenti"]["n1"]["vivo"]
    assert p1["hp"] == 1000 + 400  # 20% di 2000 all'uccisione


def test_cheat_death_once():
    s = base_state([ab("Salva", TPL[41])])
    use(s, "Salva", ["p2"])
    p2 = s["combattenti"]["p2"]
    E.deal(ctx(s), s["combattenti"]["n1"], p2, 99999, "puro", can_crit=False)
    assert p2["vivo"] and p2["hp"] == 1
    E.deal(ctx(s), s["combattenti"]["n1"], p2, 99999, "puro", can_crit=False)
    assert not p2["vivo"]


def test_on_death_explosion():
    s = base_state(enemy_abilities=[ab("Esplodi", TPL[42])])
    c = ctx(s)
    E.deal(c, s["combattenti"]["p1"], s["combattenti"]["n1"], 99999, "puro", can_crit=False)
    E.drain(c)
    assert s["combattenti"]["p1"]["hp"] == 2000 - 300
    assert s["combattenti"]["p2"]["hp"] == 1500 - 300


def test_chain_of_triggers_is_bounded():
    """Due contrattacchi passivi che si colpiscono a vicenda non vanno in loop."""
    s = base_state([ab("Contrattacco", TPL[23])], enemy_abilities=[ab("Contrattacco", TPL[23])], hp=100000)
    use(s, "Attacco")
    hits = [r for r in s["registro"] if "si attiva" in r["t"]]
    assert 1 <= len(hits) <= E.MAX_CHAIN + 1


def test_overheal_becomes_shield():
    s = base_state([ab("Cura", TPL[45], 1)])
    p2 = s["combattenti"]["p2"]
    p2["hp"] = 1490
    use(s, "Cura", ["p2"], tiri={"cura:a.0:p2": 20})
    assert p2["hp"] == 1500
    assert E.statuses(p2, nome="Scudo")[0]["valore"] == 30


def test_anti_heal_halves_heals():
    s = base_state([ab("Cura", TPL[5], 1)])
    p2 = s["combattenti"]["p2"]
    p2["hp"] = 1000
    E.add_status(ctx(s), s["combattenti"]["n1"], p2, "Ferita grave", valore=50, turni=3)
    use(s, "Cura", ["p2"], tiri={"cura:a.0:p2": 20})
    assert p2["hp"] == 1000 + 20


def test_link_and_thorns():
    s = base_state([ab("Legame", TPL[44]), ab("Spine", TPL[22])])
    use(s, "Legame", ["p2"])
    s["combattenti"]["p1"]["azioni"]["principale"] = 1
    use(s, "Spine", [])
    E.next_turn(s)
    E.next_turn(s)
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p2"]}, random.Random(1))
    assert s["combattenti"]["p2"]["hp"] == 1500 - 15
    assert s["combattenti"]["p1"]["hp"] == 2000 - 15


def test_summon_joins_order_and_expires():
    s = base_state([ab("Famiglio", TPL[10])])
    use(s, "Famiglio", [])
    ev = [c for c in s["combattenti"].values() if c.get("evocazione")]
    assert ev and ev[0]["id"] in s["ordine"]
    for _ in range(30):
        E.next_turn(s, random.Random(1))
    assert not ev[0]["vivo"]


def test_rider_on_tag_and_interaction_combo():
    s = base_state([ab("Dardo", TPL[1], 1), ab("Dardo magico X", TPL[58]), ab("Geyser", TPL[57], 1)], hp=100000)
    use(s, "Dardo", tiri={"danno:a.0:n1": 15})
    assert s["combattenti"]["n1"]["hp"] == 100000 - 30 - 80
    s["combattenti"]["p1"]["azioni"]["principale"] = 1
    use(s, "Geyser", tiri={"danno:a.0:n1": 15})
    assert s["combattenti"]["n1"]["hp"] == 100000 - 110 - 30 - 150


def test_fusion_requires_known_abilities():
    s = base_state([ab("Esplosione", TPL[59])])
    with pytest.raises(E.EngineError, match="fusione"):
        use(s, "Esplosione")


def test_upcast_from_passive():
    mens = ab("Furto", {"v": 1, "tipo": "incantesimo", "etichette": ["Mens"],
                        "effetti": [{"azione": {"op": "danno"}, "formula": {"base": "incantesimo", "tipo": "Mens"}}]}, 2)
    s = base_state([mens, ab("Occhio", TPL[69])])
    p = E.preview(s, {"attore": "p1", "abilita": "Furto", "bersagli": ["n1"]})
    assert p["stima"]["n1"]["danno"] == [15 * 3 * 2, 30 * 3 * 2]


def test_silence_blocks_spells_not_attacks():
    s = base_state([ab("Dardo", TPL[1])])
    E.add_status(ctx(s), s["combattenti"]["n1"], s["combattenti"]["p1"], "Silenzio", turni=2)
    with pytest.raises(E.EngineError, match="silenziato"):
        use(s, "Dardo")
    use(s, "Attacco")


def test_cooldown_and_action_economy():
    s = base_state([ab("Dardo", {**TPL[1], "cooldown": {"valore": 2, "unita": "turni"}})])
    use(s, "Dardo")
    with pytest.raises(E.EngineError):
        use(s, "Attacco")  # azione principale già usata
    for _ in range(2):  # CD 2: salta due turni propri
        for _ in range(4):
            E.next_turn(s)
        with pytest.raises(E.EngineError, match="ricarica"):
            use(s, "Dardo")
    for _ in range(4):
        E.next_turn(s)
    use(s, "Dardo")


def test_double_cast_status():
    s = base_state([ab("Doppio", TPL[62]), ab("Dardo", TPL[1])])
    use(s, "Doppio", [])
    for _ in range(4):
        E.next_turn(s)
    use(s, "Dardo")
    use(s, "Dardo")
    with pytest.raises(E.EngineError):
        use(s, "Dardo")


def test_not_your_turn_and_force():
    s = base_state()
    with pytest.raises(E.EngineError, match="turno"):
        E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p1"]})
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p1"], "forza": True}, random.Random(1))


def test_public_hides_mech():
    s = base_state([ab("Geyser", TPL[3])])
    use(s, "Geyser", ["n1"])
    pub = E.public(s)
    assert all("mech" not in a for a in pub["combattenti"]["p1"]["abilita"])
    assert "mech" in s["combattenti"]["p1"]["abilita"][1]


def test_preview_does_not_change_state():
    s = base_state([ab("Dardo", TPL[1])])
    before = copy.deepcopy(s)
    E.preview(s, {"attore": "p1", "abilita": "Dardo", "bersagli": ["n1"]})
    assert s == before


def test_trap_fires_on_enemy_action():
    s = base_state([ab("Runa", TPL[24], 1)])
    use(s, "Runa", ["n1"])
    assert [w for w in s["in_attesa"] if w["tipo"] == "trappola"]
    E.next_turn(s)
    E.next_turn(s)
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["p1"]}, random.Random(1))
    assert E.statuses(s["combattenti"]["n1"], nome="Immobilizzato")


def test_charm_turns_attacks_on_allies():
    s = base_state([ab("Charme", TPL[28])])
    use(s, "Charme")
    E.next_turn(s)
    E.next_turn(s)
    E.act(s, {"attore": "n1", "abilita": "Attacco", "bersagli": ["n2"]}, random.Random(1))
    assert s["combattenti"]["n2"]["hp"] == 1000 - 30


def test_field_applies_each_round():
    s = base_state([ab("Nebbia", TPL[55])])
    use(s, "Nebbia", [])
    for _ in range(4):
        E.next_turn(s, random.Random(1))
    assert E.statuses(s["combattenti"]["n1"], nome="Modifica: precisione")
    assert E.stat(s["combattenti"]["n1"], "precisione") == 80


def test_passive_stat_applied_at_start():
    s = base_state([ab("Occhio di falco", TPL[56])])
    assert E.stat(s["combattenti"]["p1"], "critico") == 0  # 0 × (1 + 20%) = 0: è una percentuale della stat
    s2 = base_state()
    s2["combattenti"]["p1"]["stat"]["critico"] = 10
    s2["combattenti"]["p1"]["abilita"].append(ab("Occhio", TPL[56]))
    E.start(s2, random.Random(1))
    assert E.stat(s2["combattenti"]["p1"], "critico") == 12


def test_resurrection_targets_fallen_ally():
    s = base_state([ab("Rinascita", TPL[40])])
    s["combattenti"]["p2"].update(vivo=False, hp=0)
    use(s, "Rinascita", [])
    assert s["combattenti"]["p2"]["vivo"] and s["combattenti"]["p2"]["hp"] == 450


def test_tame_switches_side():
    s = base_state([ab("Doma", TPL[66])])
    s["combattenti"]["n1"]["hp"] = 100
    use(s, "Doma", tiri={"doma:a.0:n1": 10})
    assert s["combattenti"]["n1"]["lato"] == "alleati"


def test_copy_last_enemy_ability():
    s = base_state([ab("Copia", TPL[51])], enemy_abilities=[ab("Morso", TPL[1], 1)])
    s["combattenti"]["n1"]["mp"] = s["combattenti"]["n1"]["mp_max"] = 500
    E.act(s, {"attore": "n1", "abilita": "Morso", "bersagli": ["p2"], "forza": True}, random.Random(1))
    hp = s["combattenti"]["n2"]["hp"]
    use(s, "Copia", ["n1"])
    assert s["combattenti"]["n2"]["hp"] < hp or s["combattenti"]["n1"]["hp"] < 1000


def test_rolls_requested_in_preview():
    s = base_state([ab("Proc", TPL[53])])
    p = E.preview(s, {"attore": "p1", "abilita": "Proc", "bersagli": ["n1"]})
    kinds = {r["key"].split(":")[0] for r in p["richieste"]}
    assert {"colpo", "crit", "danno", "proc"} <= kinds


def test_counterspell_does_not_answer_weapon_attacks():
    s = base_state(enemy_abilities=[ab("Counterspell", TPL[12])])
    s["combattenti"]["n1"]["mp"] = s["combattenti"]["n1"]["mp_max"] = 500
    assert use(s, "Attacco")["esito"] == "ok"
