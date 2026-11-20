"""Dati iniziali (da mockup/data.js). Uso: python -m app.seed [--reset]"""
import sys

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from . import rules
from .auth import hash_password
from .db import Base, SessionLocal, engine
from .models import Campaign, Character, Issue, Npc, User
from .serialize import maxes

USERS = [("master", "Il Narratore", "master")] + [(f"giocatore{i}", f"Giocatore {i}", "player") for i in range(1, 7)]


def stat(code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note=None):
    return {"code": code, "name": name, "kind": kind, "iniziale": iniziale, "creazione": creazione,
            "investiti": investiti, "levelup": levelup, "altro": altro, "titoli": titoli, "note": note}


KELVIN = {
    "name": "Kelvin", "classe": "Domatore", "level": 77, "exp_pct": 0, "regno": "Valeria", "pvp": "Bianco",
    "gilda": {"nome": "—", "ruolo": "Nessuna gilda"}, "corone": 25, "scellini": 30,
    "stats": [
        stat("STR", "Forza", "base", 10, 0, 84, 76, 0, 0),
        stat("DEX", "Destrezza", "base", 10, 0, 401, 76, 0, 5),
        stat("VIT", "Vitalità", "base", 10, 20, 75, 76, 0, 5),
        stat("INT", "Intelligenza", "base", 10, 0, 0, 76, 0, 0),
        stat("FIN", "Finesse", "avanzata", 0, 0, 200, 35, 354, 60, "Altro = talento Finesse IV: (somma+titoli)×1,2"),
        stat("AUT", "Autorità", "avanzata", 5, 0, 0, 7, 0, 50, "Sbloccata al livello 70"),
    ],
    # Difesa, critico ed evasione arrivano dagli oggetti equipaggiati (rules.apply_equipment): niente valori a mano.
    "item_bonus": {},
    "equip": {"difesa": 0, "difesaMagica": 0, "blocco": 0},
    "magia": {"nucleo": 4, "talenti": 0},
    "resources": {"hp": 2410, "mp": 640, "sp": 2900},
    "titles": [
        {"name": "Artigiano Talentuoso", "rarity": "Raro", "bonus": {"DEX": 5, "VIT": 5, "FIN": 10}},
        {"name": "Il Primo Passo verso l'Artigiano", "rarity": "Raro", "bonus": {"FIN": 50}},
        {"name": "Domatore delle Epoche", "rarity": "Epico", "bonus": {"AUT": 50}},
    ],
    "skills": [
        {"name": "Cooking", "lvl": 10, "pct": "MAX", "type": "Craft", "passive": "Gli effetti dei consumabili ingeriti raddoppiano"},
        {"name": "Crafting", "lvl": 10, "pct": "MAX", "type": "Craft", "passive": "Passiva di Grado X sbloccata"},
        {"name": "Leatherworking", "lvl": 9, "pct": 20, "type": "Craft"},
        {"name": "Ispeziona", "lvl": 8, "pct": 85, "type": "Utility"},
        {"name": "Domare", "lvl": 6, "pct": 40, "type": "Classe"},
        {"name": "Gathering", "lvl": 7, "pct": 12, "type": "Gathering"},
        {"name": "Spear", "lvl": 4, "pct": 66, "type": "Combat"},
        {"name": "Schivata", "lvl": 5, "pct": 30, "type": "Defense"},
        {"name": "Vis", "lvl": 1, "pct": 80, "type": "Knowledge"},
        {"name": "Lingua Eldarin", "lvl": 1, "pct": 85, "type": "Language"},
    ],
    "active_skills": [
        {"name": "Comando: Sottomissione", "effect": "Tenta di sottomettere una creatura indebolita", "lvl": 1, "pct": 0, "cost": "120 MP", "cd": 5},
        {"name": "Comando: Battaglia", "effect": "I compagni attaccano il bersaglio indicato con +20% danno", "lvl": 1, "pct": 60, "cost": "80 SP", "cd": 3},
    ],
    "talents": [
        {"name": "Ispeziona", "rarity": "Non Comune", "origin": "Lvl 05", "effect": "Rivela statistiche base di oggetti e creature"},
        {"name": "Gatherer", "rarity": "Comune", "origin": "Lvl 10", "effect": "+20% materiali raccolti"},
        {"name": "Segugio", "rarity": "Non Comune", "origin": "Lvl 15", "effect": "Segue le tracce di creature fino a 24 ore"},
        {"name": "Finesse I", "rarity": "Raro", "origin": "Lvl 20", "effect": "Sblocca la statistica Finesse"},
        {"name": "Finesse II", "rarity": "Raro", "origin": "Libro Abilità", "effect": "Finesse ×1,05"},
        {"name": "Giant Killer", "rarity": "Epico", "origin": "Lvl 45", "effect": "+30% danno contro creature di taglia grande"},
        {"name": "Linguistica", "rarity": "Non Comune", "origin": "Lvl 55", "effect": "Apprendimento lingue raddoppiato"},
        {"name": "Finesse IV", "rarity": "Epico", "origin": "Lvl 75", "effect": "Finesse ×1,2 su somma e titoli"},
    ],
    # Oggetti di Kelvin (da mockup/data.js). Pesi e numeri degli oggetti nuovi sono di esempio.
    # equip_type = tipo (rules.EQUIP_TYPES), slot = dove è indossato (None = borsa).
    "inventory": [
        {"id": "it-thanatos", "name": "La Promessa di Thanatos", "rarity": "Unico", "type": "Arma", "equip_type": "dueMani",
         "slot": "manoPrincipale", "weapon_base": 410, "bonus": {"critico": 12}, "durability": {"cur": 182, "max": 200},
         "req": {"level": 70, "DEX": 300}, "stats_text": "Lancia a due mani · Base 410 · +12% critico",
         "desc": "Una promessa fatta a un dio non si spezza: si consuma.", "qty": 1, "weight": 6},
        {"id": "it-simbionte", "name": "Spalla del Simbionte", "rarity": "Epico", "type": "Armatura", "equip_type": "spallacci",
         "slot": "spalle", "bonus": {"difesa": 85, "evasione": 10}, "durability": {"cur": 95, "max": 120}, "req": {"level": 60},
         "stats_text": "Difesa 85 · +10% Evasione", "desc": "Cresce di qualche fibra ogni notte.", "qty": 1, "weight": 4},
        {"id": "it-elmo", "name": "Elmo del Domatore", "rarity": "Raro", "type": "Armatura", "equip_type": "elmo",
         "stats": {"VIT": 8, "AUT": 5}, "bonus": {"difesa": 30}, "durability": {"cur": 70, "max": 70}, "req": {"level": 50},
         "stats_text": "Difesa 30 · VIT +8 · AUT +5", "qty": 1, "weight": 3},
        {"id": "it-mantello", "name": "Mantello del Gelo", "rarity": "Raro", "type": "Armatura", "equip_type": "mantello",
         "stats": {"VIT": 5}, "bonus": {"difesaMagica": 15, "resElementi": 5}, "durability": {"cur": 40, "max": 60},
         "stats_text": "Difesa magica 15 · VIT +5 · +5% Res. elementi", "qty": 1, "weight": 2},
        {"id": "it-stivali", "name": "Stivali del Segugio", "rarity": "Non Comune", "type": "Armatura", "equip_type": "stivali",
         "stats": {"DEX": 6}, "bonus": {"difesa": 12, "velocita": 5}, "durability": {"cur": 50, "max": 50},
         "stats_text": "Difesa 12 · DEX +6 · +5% velocità", "qty": 1, "weight": 2},
        {"id": "it-anello-wyrm", "name": "Anello del Wyrm", "rarity": "Epico", "type": "Accessorio", "equip_type": "anello",
         "stats": {"INT": 12}, "bonus": {"difesaMagica": 20}, "req": {"level": 75},
         "stats_text": "INT +12 · Difesa magica 20", "qty": 1, "weight": 0.1},
        {"id": "it-anello-fin", "name": "Anello dell'Artigiano", "rarity": "Non Comune", "type": "Accessorio", "equip_type": "anello",
         "stats": {"FIN": 15}, "stats_text": "FIN +15", "qty": 1, "weight": 0.1},
        {"id": "it-scudo", "name": "Scudo di pelle di Wyrm", "rarity": "Raro", "type": "Scudo", "equip_type": "scudo",
         "bonus": {"blocco": 20, "difesa": 25}, "durability": {"cur": 80, "max": 80}, "req": {"STR": 150},
         "stats_text": "Blocco 20% · Difesa 25", "qty": 1, "weight": 5},
        {"id": "it-zanna", "name": "Zanna del Topo dei Ghiacci", "rarity": "Non Comune", "type": "Accessorio", "equip_type": "ninnolo",
         "bonus": {"critico": 3}, "stats_text": "+3% critico", "qty": 1, "weight": 0.2},
        {"id": "it-corazza", "name": "Corazza di scaglie di Wyrm", "rarity": "Raro", "type": "Armatura", "equip_type": "corazza",
         "stats": {"VIT": 6}, "bonus": {"difesa": 55}, "durability": {"cur": 90, "max": 110}, "req": {"level": 55, "STR": 120},
         "stats_text": "Difesa 55 · VIT +6", "qty": 1, "weight": 9},
        {"id": "it-gambali", "name": "Gambali da battitore", "rarity": "Non Comune", "type": "Armatura", "equip_type": "gambali",
         "stats": {"DEX": 4}, "bonus": {"difesa": 18}, "durability": {"cur": 60, "max": 60},
         "stats_text": "Difesa 18 · DEX +4", "qty": 1, "weight": 4},
        {"id": "it-guanti", "name": "Guanti del Conciatore", "rarity": "Non Comune", "type": "Armatura", "equip_type": "guanti",
         "stats": {"FIN": 8}, "bonus": {"difesa": 6}, "durability": {"cur": 30, "max": 40},
         "stats_text": "Difesa 6 · FIN +8", "qty": 1, "weight": 1},
        {"id": "it-bracciali", "name": "Bracciali di corda gelata", "rarity": "Comune", "type": "Armatura", "equip_type": "bracciali",
         "bonus": {"difesa": 5, "resElementi": 2}, "durability": {"cur": 35, "max": 35},
         "stats_text": "Difesa 5 · +2% Res. elementi", "qty": 1, "weight": 0.5},
        {"id": "it-cintura", "name": "Cintura delle esche", "rarity": "Comune", "type": "Armatura", "equip_type": "cintura",
         "stats": {"STR": 3}, "bonus": {"difesa": 4}, "stats_text": "Difesa 4 · STR +3", "qty": 1, "weight": 0.5},
        {"id": "it-amuleto", "name": "Amuleto del Branco", "rarity": "Epico", "type": "Accessorio", "equip_type": "amuleto",
         "stats": {"AUT": 14}, "bonus": {"difesaMagica": 10}, "req": {"level": 65},
         "stats_text": "AUT +14 · Difesa magica 10", "qty": 1, "weight": 0.2},
        {"id": "it-pugnale", "name": "Pugnale da scuoiatore", "rarity": "Non Comune", "type": "Arma", "equip_type": "unaMano",
         "weapon_base": 24, "stats": {"DEX": 4}, "bonus": {"critico": 4}, "durability": {"cur": 45, "max": 50},
         "stats_text": "Una mano · Base 24 · DEX +4 · +4% critico", "qty": 1, "weight": 1},
        {"id": "it-coltello", "name": "Coltello d'osso", "rarity": "Comune", "type": "Arma", "equip_type": "unaMano",
         "weapon_base": 18, "bonus": {"critico": 2}, "durability": {"cur": 20, "max": 40},
         "stats_text": "Una mano · Base 18 · +2% critico", "qty": 1, "weight": 0.8},
        {"id": "it-frusta", "name": "Frusta del Domatore", "rarity": "Raro", "type": "Arma", "equip_type": "manoPrincipale",
         "weapon_base": 120, "stats": {"AUT": 10}, "durability": {"cur": 70, "max": 70}, "req": {"level": 40},
         "stats_text": "Mano principale · Base 120 · AUT +10", "qty": 1, "weight": 2},
        {"id": "it-fischietto", "name": "Fischietto del Branco", "rarity": "Raro", "type": "Accessorio", "equip_type": "tenuto",
         "stats": {"AUT": 8}, "stats_text": "Tenuto in mano secondaria · AUT +8",
         "desc": "Un fischio, e il branco risponde.", "qty": 1, "weight": 0.1},
        {"id": "it-kit", "name": "Kit del conciatore", "stats_text": "+5% qualità pelli", "rarity": "Non Comune", "type": "Strumento", "qty": 1, "weight": 3},
        {"id": "it-pelle", "name": "Pelle di Wyrm", "stats_text": "Materiale grezzo", "rarity": "Raro", "type": "Materiale", "qty": 4, "weight": 2},
        {"id": "it-razione", "name": "Razione da viaggio", "stats_text": "+50% recupero per 1h", "rarity": "Comune", "type": "Cibo", "qty": 12, "weight": 0.5},
        {"id": "it-diario", "name": "Diario di caccia", "stats_text": "Appunti sulle creature domate", "rarity": "Comune", "type": "Libro", "qty": 1, "weight": 1},
        {"id": "it-pozione-hp", "name": "Pozione di cura maggiore", "stats_text": "Ripristina 600 HP", "rarity": "Raro", "type": "Pozione", "qty": 7, "weight": 0.3},
        {"id": "it-pozione-mp", "name": "Pozione di mana", "stats_text": "Ripristina 250 MP", "rarity": "Non Comune", "type": "Pozione", "qty": 4, "weight": 0.3},
        {"id": "it-stufato", "name": "Stufato di Wyrm", "stats_text": "+15% STR per 2h (raddoppiato da Cooking)", "rarity": "Raro", "type": "Cibo", "qty": 3, "weight": 0.8},
        {"id": "it-pergamena", "name": "Pergamena del ritorno", "stats_text": "Teletrasporto alla città vincolata", "rarity": "Non Comune", "type": "Pergamena", "qty": 2, "weight": 0.1},
        {"id": "it-zanne", "name": "Zanne di lupo grigio", "stats_text": "Materiale di conciatura", "rarity": "Comune", "type": "Materiale", "qty": 46, "weight": 0.1},
        {"id": "it-cristallo", "name": "Cristallo di gelo", "stats_text": "Catalizzatore magico", "rarity": "Epico", "type": "Materiale", "qty": 1, "weight": 0.5},
        {"id": "it-uovo", "name": "Frammento di guscio di Wyrm", "stats_text": "Indizio per la quest «Il Wyrm che non brucia»", "rarity": "Raro", "type": "Oggetto quest", "qty": 2, "weight": 0.4},
        {"id": "it-corone", "name": "Corone d'Oro", "stats_text": "Moneta di Valeria", "rarity": "Comune", "type": "Monete", "qty": 25, "weight": 0},
        {"id": "it-scellini", "name": "Scellini", "stats_text": "Moneta minore", "rarity": "Comune", "type": "Monete", "qty": 30, "weight": 0},
    ],
    "pets": [
        {"name": "Celsius", "species": "Topo dei Ghiacci", "lvl": 56, "passive": "Aura di gelo",
         "skills": [{"name": "Morso glaciale", "lvl": 6, "pct": 30}, {"name": "Mimetismo nella neve", "lvl": 4, "pct": 10}]},
        {"name": "Fahrenheit", "species": "Wyrm del Fuoco", "lvl": 3, "passive": "Immunità alla lava",
         "skills": [{"name": "Ignis", "lvl": 9, "pct": 0}]},
    ],
    "curses": [
        {"name": "Braccio degli antichi", "desc": "Il braccio destro è posseduto da uno spirito antico.",
         "bonus": "+20% FOR nelle prove con il braccio posseduto", "malus": "−2 livelli di skill nei lavori di precisione"},
    ],
    "quests": [
        {"name": "Il Wyrm che non brucia", "progress": "2/3 indizi", "reward": "Uovo di Wyrm (Raro)", "rarity": "Raro"},
        {"name": "Pelli per la gilda dei conciatori", "progress": "8/20 pelli", "reward": "120 Corone, +Reputazione Valeria", "rarity": "Comune"},
    ],
    "reputation": [
        {"scope": "Regionale", "target": "Valeria", "value": 340, "range": 1000, "label": "Benvoluto"},
        {"scope": "Gruppo", "target": "Gilda dei Conciatori", "value": 42, "range": 100, "label": "Amico"},
        {"scope": "PNG", "target": "Marta la Locandiera", "value": 6, "range": 10, "label": "Fiducia"},
        {"scope": "Cosmica", "target": "Luxor", "value": 0, "range": 0, "label": "Neutrale"},
    ],
    "combat": {
        "position": "Media distanza", "turn": 1, "log": [],
        "effects": [
            {"name": "Emorragia", "kind": "bad", "text": "−3 HP/turno", "turns": 2, "hpPerTurn": -3},
            {"name": "Scudo Magico", "kind": "good", "text": "Assorbe 50 danni", "turns": 3, "absorb": 50},
            {"name": "Concentrazione", "kind": "good", "text": "+50% al prossimo attacco", "turns": 1},
        ],
        "cooldowns": [{"name": "Comando: Battaglia", "turns": 2}, {"name": "Comando: Sottomissione", "turns": 4}],
    },
}


def quick(name, owner, classe, level, s, str_, dex, vit, int_, **extra):
    return {
        "owner": owner, "name": name, "classe": classe, "level": level, "exp_pct": extra.get("exp_pct", 30),
        "regno": extra.get("regno", "Valeria"), "pvp": extra.get("pvp", "Bianco"),
        "gilda": extra.get("gilda", {"nome": "—", "ruolo": ""}), "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, s[0], str_, level - 1, 0, 0),
            stat("DEX", "Destrezza", "base", 10, s[1], dex, level - 1, 0, 0),
            stat("VIT", "Vitalità", "base", 10, s[2], vit, level - 1, 0, 0),
            stat("INT", "Intelligenza", "base", 10, s[3], int_, level - 1, 0, 0),
        ],
    }


# Gli altri PG della campagna: dati reali da Scheda_Personaggio_STATISFY.xlsx (statistiche avanzate e titoli inclusi).
# Le incoerenze dell'Excel restano come sono e sono annotate nella nota della statistica.
OTHERS = [
    {
        "owner": "giocatore2", "name": "Eric", "classe": "Faro della Civiltà", "level": 110, "exp_pct": 0,
        "regno": "Valeria", "pvp": "Bianco",
        "gilda": {"nome": "Lanterne di Valeria", "ruolo": "Diplomatico"}, "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, 0, 0, 109, 0, 213),
            stat("DEX", "Destrezza", "base", 10, 5, 0, 109, 0, 220),
            stat("VIT", "Vitalità", "base", 10, 5, 0, 109, 0, 410),
            stat("INT", "Intelligenza", "base", 10, 10, 1000, 109, 30, 283),
            stat("CHA", "Carisma", "avanzata", 5, 0, 90, 109, 0, 265),
            stat("WIS", "Saggezza", "avanzata", 5, 0, 0, 129, 0, 180, "Excel: Punti Level Up 129, più dei 109 level up del livello 110"),
        ],
        "titles": [{"name": "Questo Matrimonio non s'ha da fare", "rarity": "Raro", "bonus": {"STR": 5, "VIT": 10}}, {"name": "Fratello d'Armi del Passo dell'Aquila", "rarity": "Raro", "bonus": {"STR": 8, "VIT": 10}}, {"name": "EROE DELL'ECLISSI", "rarity": "Unico", "bonus": {"VIT": 20, "INT": 25, "CHA": 30}}, {"name": "Primo Erudito", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Portatore di Eclissi", "rarity": "Epico", "bonus": {"VIT": 12, "INT": 8, "CHA": 10}}, {"name": "Primo Maestro della Sfera del Flusso", "rarity": "Epico", "bonus": {"DEX": 10, "VIT": 8, "INT": 15}}, {"name": "Amico delle scaglie Blu", "rarity": "Raro", "bonus": {"VIT": 5, "INT": 10}}, {"name": "Pionoere di Abyssos", "rarity": "Epico", "bonus": {"VIT": 10, "INT": 10, "CHA": 15}}, {"name": "Cacciatore di Maghi", "rarity": "Epico", "bonus": {"DEX": 5, "VIT": 10, "INT": 5}}, {"name": "Portatore di Calamità", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Amici dei Draghi", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Maestro dell'accademia Magica di Valeria", "rarity": "Raro", "bonus": {"INT": 30}}, {"name": "Pioniere di Karak'Ktur", "rarity": "Epico", "bonus": {"VIT": 30}}, {"name": "Uccisore del Corvo", "rarity": "Leggendario", "bonus": {"STR": 30, "DEX": 30, "VIT": 30, "INT": 30, "CHA": 30, "WIS": 30}}, {"name": "Cacciatori degli Abissi", "rarity": "Unico", "bonus": {"STR": 20, "DEX": 25, "VIT": 50}}, {"name": "Mano destra e Mano sinistra del dottore", "rarity": "Raro", "bonus": {"VIT": 15}}, {"name": "Signore dei Nani", "rarity": "Unico", "bonus": {"VIT": 50, "CHA": 30}}],
        "talents": [],
    },
    {
        "owner": "giocatore3", "name": "Corax", "classe": "Monaco", "level": 181, "exp_pct": 0,
        "regno": "Valeria", "pvp": "Grigio",
        "gilda": {"nome": "Pugno di Raijin", "ruolo": "Ufficiale"}, "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, -2, 150, 185, 0, 180, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
            stat("DEX", "Destrezza", "base", 10, 10, 300, 185, 0, 235, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
            stat("VIT", "Vitalità", "base", 10, -3, 100, 185, 20, 193, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
            stat("INT", "Intelligenza", "base", 10, 15, 300, 185, 62, 156, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
            stat("SHA", "Shadow", "avanzata", 5, 0, 300, 178, 10, 220),
            stat("KI", "KI", "avanzata", 5, 10, 430, 144, 0, 140),
            stat("CHA", "Carisma", "avanzata", 10, 0, 100, 108, 30, 150, "Titoli: +150 dai bonus CHA dei titoli (nell’Excel la cella Punti Titoli era 0 senza formula)"),
        ],
        "titles": [{"name": "La Santa del Mattatoio", "rarity": "Epico", "bonus": {"DEX": 10, "VIT": 8, "INT": 6, "SHA": 10}}, {"name": "Prima Maestra", "rarity": "Epico", "bonus": {"DEX": 25}}, {"name": "Primo Monaco", "rarity": "Epico", "bonus": {"DEX": 15, "VIT": 15, "KI": 10}}, {"name": "Il Primo Agente dei Nocturn", "rarity": "Unico", "bonus": {"VIT": -20, "INT": 15, "SHA": 30, "CHA": 20}}, {"name": "Mano DX e Mano Sx del Doc", "rarity": "Raro", "bonus": {"VIT": 15}}, {"name": "Underdog", "rarity": "Epico", "bonus": {"DEX": 50}}, {"name": "Cacciatore di Maghi", "rarity": "Epico", "bonus": {"DEX": 5, "VIT": 10, "INT": 5}}, {"name": "Portatori di Calamità", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "SHA": 50, "KI": 50, "CHA": 50}}, {"name": "Amici dei Draghi", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "SHA": 50, "KI": 50, "CHA": 50}}, {"name": "Come Russel", "rarity": "Leggendario", "bonus": {"STR": 30, "DEX": 30, "VIT": 30, "INT": 30, "SHA": 30, "KI": 30, "CHA": 30}}, {"name": "Confessore della Madre", "rarity": "Raro", "bonus": {"SHA": 50}}, {"name": "Sangue di Oni", "rarity": "Epico", "bonus": {"STR": 50, "VIT": 35}}],
        "talents": [],
    },
    {
        "owner": "giocatore4", "name": "Deniel", "classe": "Guerriero", "level": 110, "exp_pct": 0,
        "regno": "Valeria", "pvp": "Bianco",
        "gilda": {"nome": "—", "ruolo": ""}, "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, 15, 600, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
            stat("DEX", "Destrezza", "base", 10, 5, 100, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
            stat("VIT", "Vitalità", "base", 10, 0, 390, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
            stat("INT", "Intelligenza", "base", 10, 0, 0, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
        ],
        "titles": [],
        "talents": [{"name": "Rabbia del Berserker", "rarity": "Raro", "origin": "Excel", "effect": "Sotto il 25% della vita"}],
    },
    {
        "owner": "giocatore5", "name": "Connor", "classe": "Guerriero", "level": 111, "exp_pct": 0,
        "regno": "Qadesh", "pvp": "Bianco",
        "gilda": {"nome": "—", "ruolo": ""}, "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, 10, 150, 110, 0, 13),
            stat("DEX", "Destrezza", "base", 10, 5, 163, 110, 0, 0),
            stat("VIT", "Vitalità", "base", 10, 5, 731, 110, 0, 40),
            stat("INT", "Intelligenza", "base", 10, 0, 56, 110, 0, 25),
            stat("CHA", "Carisma", "avanzata", 0, 0, 0, 69, 0, 30),
        ],
        "titles": [{"name": "Questo Matrimonio non s'ha da fare", "rarity": "Raro", "bonus": {"STR": 5, "VIT": 10}}, {"name": "Fratello d'Armi del Passo dell'Aquila", "rarity": "Raro", "bonus": {"STR": 8, "VIT": 10}}, {"name": "EROE DELL'ECLISSI", "rarity": "Unico", "bonus": {"VIT": 20, "INT": 25, "CHA": 30}}],
        "talents": [],
    },
    {
        "owner": "giocatore6", "name": "Dante", "classe": "Ladro", "level": 120, "exp_pct": 0,
        "regno": "Valeria", "pvp": "Rosso",
        "gilda": {"nome": "—", "ruolo": ""}, "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, 0, 0, 119, 0, 0),
            stat("DEX", "Destrezza", "base", 10, 10, 0, 119, 0, 0),
            stat("VIT", "Vitalità", "base", 10, 0, 0, 119, 0, 0),
            stat("INT", "Intelligenza", "base", 10, 10, 0, 119, 0, 0),
            stat("LCK", "Fortuna", "avanzata", 5, 0, 1190, 113, 25, 0, "Fortuna: la gimmick di Dante. Altro = +25 dal talento Re dei Giochi. Entra nell’Evasione: (DEX + LCK)/20"),
        ],
        "titles": [],
        "talents": [{"name": "Re dei Giochi", "rarity": "Epico", "origin": "Evolutivo", "effect": "Fortuna +25. Talento evolutivo: cresce evolvendo. Bonus Fortuna sui tiri = LCK/100."}],
    },
]

NPCS = [
    {"name": "Marta la Locandiera", "level": 12, "race": "Umana", "place": "Alba Chiara — Il Gallo Storto",
     "role": "Locandiera, informatrice", "trust": "Buono",
     "knows": "Sa che Kelvin è un Immortale e che cerca uova di Wyrm.",
     "debts": "Kelvin le deve un favore (2 notti non pagate).",
     "last": "Sessione 14 — gli ha venduto una mappa delle grotte.",
     "secret": "Paga una tassa ai contrabbandieri del porto."},
    {"name": "Capitano Orsino", "level": 95, "race": "Umano", "place": "Alba Chiara — Caserma",
     "role": "Capitano della guardia", "trust": "Neutrale", "knows": "Conosce Kelvin solo di nome.", "debts": "—",
     "last": "Sessione 11 — ha multato Dante per rissa.", "secret": "Ha perso il fratello contro un Wyrm del Fuoco."},
    {"name": "Fra' Teodoro", "level": 40, "race": "Umano", "place": "Tempio di Luxor", "role": "Chierico, guaritore",
     "trust": "Eccellente", "knows": "Ha curato la maledizione di Kelvin per due volte.",
     "debts": "Kelvin ha promesso una donazione di 50 Corone.",
     "last": "Sessione 13 — ha studiato il Braccio degli antichi.",
     "secret": "Sospetta che lo spirito nel braccio sia un antico re."},
]

OPEN_QUESTS = [
    {"name": "Il Wyrm che non brucia", "who": "Kelvin", "rarity": "Raro", "due": "—"},
    {"name": "Taglia su Dante", "who": "Dante", "rarity": "Epico", "due": "24h di gioco"},
    {"name": "Ambasceria a Qadesh", "who": "Eric, Connor", "rarity": "Raro", "due": "Sessione 18"},
]

ISSUES = [
    {"title": "Moltiplicatore danno magico", "text": "Le schede usano INT/50, INT/60 e INT/80. Serve un divisore unico.",
     "sev": "bad", "resolved": True,
     "decision": "1 + INT/100. Ogni grado di nucleo magico o talento apposito abbassa il divisore di 10 (90, 80, …, minimo 10)."},
    {"title": "Stamina assente nell'Excel",
     "text": "Il regolamento definisce SP = 50 + (STR+DEX)×5, ma nessuna scheda la calcola.", "sev": "warn", "resolved": True,
     "decision": "Confermata SP = 50 + (STR+DEX)×5. Va aggiunta al modello e calcolata in automatico."},
    {"title": "Scala di rarità",
     "text": "Combat unisce Unico/Leggendario, il Crafting li separa e aggiunge Evolutivo; i titoli aggiungono Divino.",
     "sev": "warn", "resolved": True,
     "decision": "Scala unica a 8 gradi: Comune, Non Comune, Raro, Epico, Unico, Leggendario, Mitico, Divino. Base danno arma: Unico 250–500, Leggendario 500–1000, Mitico 1000–2000, Divino 2000+. Moltiplicatore creature = grado³ (fino a ×512). Evolutivo è un tipo di oggetto con rarità effettiva, non un grado."},
    {"title": "Punti Level Up incoerenti", "text": "Corax (lv 181) ha 185 punti invece di 180 su STR, DEX, VIT e INT; Deniel (lv 110) ne ha 110 invece di 109; Eric (lv 110) ha 129 punti su WIS, più dei 109 level up.", "sev": "warn",
     "resolved": True, "decision": "Si tengono come nell'Excel (deciso dal Master il 20/11/2026): i punti restano e sono annotati sulla statistica."},
    {"title": "Formule non definite", "text": "Difesa, iniziativa, probabilità di critico e di blocco non hanno formula.",
     "sev": "bad", "resolved": True,
     "decision": "Difesa = VIT/10 + Difesa equip × (1 + VIT/100); Difesa magica = INT/10 + Difesa magica equip × (1 + INT/100); Iniziativa = 10 + DEX/10; Critico = 5 + DEX/40 % (max 75%); Blocco = Blocco scudo + STR/40 % (solo con scudo, max 75%)."},
]

LIST_FIELDS = ["titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"]


def _character(data: dict, owner: User) -> Character:
    c = Character(
        owner_id=owner.id, name=data["name"], name_key=data["name"].lower(), classe=data["classe"],
        level=data["level"], exp_pct=data["exp_pct"], regno=data["regno"], pvp=data["pvp"], gilda=data["gilda"],
        corone=data.get("corone", 0), scellini=data.get("scellini", 0), stats=data["stats"],
        item_bonus=data.get("item_bonus", {}), equip=data.get("equip", {"difesa": 0, "difesaMagica": 0, "blocco": 0}),
        magia=data.get("magia", {"nucleo": 0, "talenti": 0}),
        combat=data.get("combat", {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": []}),
        death=None, **{f: data.get(f, []) for f in LIST_FIELDS},
    )
    inv = rules.normalize_inventory(c.inventory)
    rules.ensure_item_ids(inv)
    c.inventory = inv
    if data.get("resources"):
        c.resources = data["resources"]
    else:
        d = rules.derived_values({"stats": c.stats, "equip": c.equip, "magia": c.magia})
        c.resources = {k: d[k] for k in rules.RESOURCE_KEYS if k in d}
    return c


def seed(db: Session) -> None:
    users = {}
    for username, display, role in USERS:
        u = User(username=username, password_hash=hash_password(username), display_name=display, role=role)
        db.add(u)
        users[username] = u
    db.flush()
    master = users["master"]
    db.add(Campaign(name="Campagna di Alba Chiara", session=15, master_name=master.display_name,
                    open_quests=OPEN_QUESTS))
    db.add(_character(KELVIN, users["giocatore1"]))
    for o in OTHERS:
        db.add(_character(o, users[o["owner"]]))
    for n in NPCS:
        db.add(Npc(**n, history=[]))
    for i in ISSUES:
        db.add(Issue(**i))
    db.commit()


def migrate(db: Session) -> int:
    """Compatibilità con i DB creati prima dell'inventario MMORPG: dà un id a ogni oggetto e porta il vecchio
    campo testuale `stats` in `stats_text` (gli oggetti restano nella borsa, i valori manuali di equip e
    item_bonus restano invariati). I PG con la statistica KI senza `resources.ki` partono dal KI massimo.
    Ritorna il numero di personaggi aggiornati."""
    changed = 0
    for c in db.scalars(select(Character)).unique():
        raw = c.inventory or []
        inv = rules.normalize_inventory(raw)
        ids = rules.ensure_item_ids(inv)
        legacy = any(isinstance(x, dict) and (isinstance(x.get("stats"), str) or "category" not in x) for x in raw)
        touched = False
        if ids or legacy:
            c.inventory = inv
            flag_modified(c, "inventory")
            touched = True
        if any(r.get("code") == "KI" for r in (c.stats or [])) and "ki" not in (c.resources or {}):
            c.resources = {**(c.resources or {}), "ki": maxes(c)["ki"]}
            flag_modified(c, "resources")
            touched = True
        changed += touched
    if changed:
        db.commit()
    return changed


# Colonne aggiunte dopo la creazione della tabella: `create_all` crea le tabelle mancanti ma non aggiunge colonne a
# quelle esistenti, quindi qui un ALTER TABLE ADD COLUMN (tutte nullable, senza default: le righe vecchie restano NULL).
ADDED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "rolls": [("call", "VARCHAR(10)"), ("crit", "VARCHAR(15)")],
}


def migrate_schema(bind: Engine) -> list[str]:
    """Aggiunge alle tabelle esistenti le colonne nuove di `ADDED_COLUMNS`. Ritorna le colonne aggiunte ("tab.col")."""
    insp = inspect(bind)
    added = []
    with bind.begin() as conn:
        for table, cols in ADDED_COLUMNS.items():
            if not insp.has_table(table):
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols:
                if name not in have:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN "{name}" {ddl}'))
                    added.append(f"{table}.{name}")
    return added


def seed_if_empty(db: Session) -> bool:
    Base.metadata.create_all(bind=db.get_bind())
    migrate_schema(db.get_bind())
    if db.scalar(select(User).limit(1)) is not None:
        migrate(db)
        return False
    seed(db)
    return True


def reset() -> None:
    Base.metadata.drop_all(bind=engine)
    with SessionLocal() as db:
        seed_if_empty(db)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
        print("Database ricreato con i dati di seed.")
    else:
        with SessionLocal() as db:
            print("Seed eseguito." if seed_if_empty(db) else "Database già popolato: nessuna modifica (usa --reset).")
