"""Conversione dei modelli in risposte JSON, con i valori calcolati da rules.py."""
from . import rules
from .models import Character, Npc, Issue, Campaign

LIST_FIELDS = ["titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"]


def rules_input(c: Character) -> dict:
    return {"stats": c.stats or [], "equip": c.equip or {}, "magia": c.magia or {}, "item_bonus": c.item_bonus or {}}


def maxes(c: Character) -> dict:
    d = rules.derived_values(rules_input(c))
    return {"hp": d["hp"], "mp": d["mp"], "sp": d["sp"]}


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
        "stats": stats_out(c.stats or []), "item_bonus": c.item_bonus or {},
        "equip": rules.equip(ri), "magia": rules.magic(ri),
        "resources": c.resources or {"hp": 0, "mp": 0, "sp": 0},
        **{f: getattr(c, f) or [] for f in LIST_FIELDS},
        "combat": combat, "death": c.death,
        "derived": rules.derived(ri), "totals": rules.totals(c.stats or []),
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
