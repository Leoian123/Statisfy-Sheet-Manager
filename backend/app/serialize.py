"""Conversione dei modelli in risposte JSON, con i valori calcolati da rules.py."""
from . import rules
from .models import Character, Npc, Issue, Campaign

LIST_FIELDS = ["titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"]


def raw_input(c: Character) -> dict:
    """Dati salvati del PG per le regole (equip e item_bonus = soli valori manuali del Master)."""
    return {"stats": c.stats or [], "equip": c.equip or {}, "magia": c.magia or {},
            "item_bonus": c.item_bonus or {}, "inventory": c.inventory or [], "level": c.level}


def rules_input(c: Character) -> dict:
    """Dati per le regole, con l'equipaggiamento già applicato (colonna Oggetti, equip, item_bonus)."""
    return rules.apply_equipment(raw_input(c))


def maxes_of(ri: dict) -> dict:
    """Massimi delle risorse: hp, mp, sp e ki (solo per chi ha la statistica KI)."""
    d = {x["key"]: x["value"] for x in rules.derived(ri)}
    return {k: d[k] for k in rules.RESOURCE_KEYS if k in d}


def maxes(c: Character) -> dict:
    return maxes_of(rules_input(c))


def inventory_out(ri: dict) -> list[dict]:
    t = rules.totals(ri["stats"])
    return [{**it, "unmet": rules.unmet_requirements(ri, it, t)} for it in ri["inventory"]]


def stats_out(stats: list[dict]) -> list[dict]:
    return [{**r, "note": r.get("note"), "total": rules.stat_total(r)} for r in stats]


def num_out(v):
    return rules.clean(rules.num(v))


def character_out(c: Character) -> dict:
    ri = rules_input(c)
    combat = {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": [], **(c.combat or {})}
    out = {
        "id": c.id, "owner_id": c.owner_id, "owner_name": c.owner.display_name if c.owner else "",
        "name": c.name, "classe": c.classe, "level": c.level, "exp_pct": num_out(c.exp_pct),
        "regno": c.regno, "pvp": c.pvp, "gilda": {"nome": "", "ruolo": "", **(c.gilda or {})},
        "corone": c.corone, "scellini": c.scellini,
        "stats": stats_out(ri["stats"]), "item_bonus": c.item_bonus or {},
        "equip": rules.equip({"equip": c.equip}), "magia": rules.magic(ri),
        "resources": c.resources or {"hp": 0, "mp": 0, "sp": 0},
        **{f: getattr(c, f) or [] for f in LIST_FIELDS},
        "inventory": inventory_out(ri),
        "equipped": rules.equipped_map(ri["inventory"]),
        "item_previews": rules.item_previews(raw_input(c)),
        "combat": combat, "death": c.death,
        "derived": rules.derived(ri), "totals": rules.totals(ri["stats"]),
        "free_points": rules.free_points(c.level, c.stats or []),
        "power_rank": rules.power_rank(c.level), "next_talent_level": rules.next_talent_level(c.level),
    }
    return out


def summary_out(c: Character) -> dict:
    return {
        "id": c.id, "owner_id": c.owner_id, "owner_name": c.owner.display_name if c.owner else "",
        "name": c.name, "classe": c.classe, "level": c.level, "exp_pct": num_out(c.exp_pct),
        "regno": c.regno, "pvp": c.pvp, "gilda": {"nome": "", "ruolo": "", **(c.gilda or {})},
        "power_rank": rules.power_rank(c.level),
        "hp": (c.resources or {}).get("hp", 0), "hp_max": maxes(c)["hp"],
    }


def npc_out(n: Npc) -> dict:
    return {k: getattr(n, k) for k in ("id", "name", "level", "race", "place", "role", "trust",
                                        "knows", "debts", "last", "secret")} | {"history": n.history or []}


def issue_out(i: Issue) -> dict:
    return {"id": i.id, "title": i.title, "text": i.text, "sev": i.sev, "resolved": bool(i.resolved),
            "decision": i.decision}


def campaign_out(c: Campaign) -> dict:
    return {"id": c.id, "name": c.name, "session": c.session, "master_name": c.master_name,
            "open_quests": c.open_quests or []}
