"""Catalogo degli status usati dal motore di combattimento.

Un'istanza attiva su un combattente è {nome, polarita, stack, turni, valore, stat, fonte, mod}:
- `turni` 0 = finché non viene rimosso; `valore` = intensità decisa dall'effetto che lo applica
  (danno a turno del Veleno, % del Marchio, assorbimento dello Scudo…); `stat` = statistica o tipo di danno.
- `mod` = modificatori meccanici letti dal motore (sotto).

Uno status che non è nel catalogo è un'etichetta personalizzata (es. «Bagnato») senza meccanica propria:
serve alle condizioni, alle combo (status_consuma) e alle soglie.
"""
from __future__ import annotations

# Modificatori riconosciuti dal motore (chiave → descrizione per il client)
MODIFIERS = {
    "salta_turno": "Salta il turno",
    "si_rompe_colpito": "Finisce quando subisce danno",
    "si_rompe_agisce": "Finisce quando agisce",
    "immobilizzato": "Non può muoversi né schivare",
    "silenzio": "Non può lanciare incantesimi o miracoli",
    "disarmo": "Non può attaccare con le armi",
    "provocazione": "Deve bersagliare chi lo ha provocato",
    "charme": "Attacca i propri alleati",
    "confuso": "Sceglie bersagli a caso",
    "non_bersagliabile": "Non può essere scelto come bersaglio",
    "invulnerabile": "Non subisce danni",
    "marchio": "Subisce +valore% danni",
    "vulnerabilita": "Subisce +valore% danni del tipo indicato",
    "resistenza": "Subisce −valore% danni del tipo indicato",
    "anti_cura": "Cure ricevute −valore%",
    "danno_bonus": "Infligge +valore% danni",
    "furto_vita": "Si cura del valore% del danno inflitto",
    "riflesso": "Restituisce il valore% del danno subito",
    "scudo": "Assorbe danni fino a valore",
    "salvavita": "Resta a 1 HP invece di morire (una volta)",
    "legame": "Il valore% del danno subito passa a chi ha creato il legame",
    "azioni_extra": "+valore azioni principali per turno",
    "reazioni_extra": "+valore reazioni per turno",
    "lanci_doppi": "Può lanciare due incantesimi con una sola azione",
    "stat_mod": "Statistica modificata di valore%",
    "non_ostile": "Non attacca per primo",
    "rivelato": "Non può diventare invisibile",
    "tick_danno": "Subisce valore danni (× stack) a inizio turno",
    "tick_cura": "Recupera valore HP (× stack) a inizio turno",
}

STATUS = {
    # Danno nel tempo e cure nel tempo
    "Veleno": {"polarita": "cattivo", "stack_max": 10, "mod": {"tick_danno": True}, "tipo": "Veleno",
               "desc": "Danno a inizio turno per ogni stack."},
    "Bruciatura": {"polarita": "cattivo", "stack_max": 5, "mod": {"tick_danno": True}, "tipo": "Ignis",
                   "desc": "Danno da fuoco a inizio turno."},
    "Sanguinamento": {"polarita": "cattivo", "stack_max": 10, "mod": {"tick_danno": True}, "tipo": "fisico",
                      "desc": "Danno fisico a inizio turno."},
    "Rigenerazione": {"polarita": "buono", "stack_max": 5, "mod": {"tick_cura": True},
                      "desc": "Cura a inizio turno."},
    # Stack a soglia
    "Gelo": {"polarita": "cattivo", "stack_max": 3, "soglia": 3, "diventa": "Congelato", "desc": "A 3 stack: Congelato."},
    "Congelato": {"polarita": "cattivo", "mod": {"salta_turno": True}, "desc": "Salta il turno."},
    # Controllo
    "Stordito": {"polarita": "cattivo", "mod": {"salta_turno": True}, "desc": "Salta il turno."},
    "Sonno": {"polarita": "cattivo", "mod": {"salta_turno": True, "si_rompe_colpito": True},
              "desc": "Salta il turno; si sveglia se colpito."},
    "Immobilizzato": {"polarita": "cattivo", "mod": {"immobilizzato": True},
                      "desc": "Non si muove e non schiva, ma può agire."},
    "Silenzio": {"polarita": "cattivo", "mod": {"silenzio": True}, "desc": "Niente incantesimi né miracoli."},
    "Disarmato": {"polarita": "cattivo", "mod": {"disarmo": True}, "desc": "Niente attacchi con le armi."},
    "Provocato": {"polarita": "cattivo", "mod": {"provocazione": True}, "desc": "Deve colpire chi l'ha provocato."},
    "Charme": {"polarita": "cattivo", "mod": {"charme": True}, "desc": "Attacca i propri alleati."},
    "Confuso": {"polarita": "cattivo", "mod": {"confuso": True}, "desc": "Bersagli a caso."},
    "Invisibile": {"polarita": "buono", "mod": {"non_bersagliabile": True, "si_rompe_agisce": True},
                   "desc": "Non bersagliabile finché non agisce."},
    "Inafferrabile": {"polarita": "buono", "mod": {"non_bersagliabile": True}, "desc": "Non bersagliabile."},
    "Rivelato": {"polarita": "cattivo", "mod": {"rivelato": True}, "desc": "Non può diventare invisibile."},
    "Invulnerabile": {"polarita": "buono", "mod": {"invulnerabile": True}, "desc": "Nessun danno."},
    "Neutrale": {"polarita": "buono", "mod": {"non_ostile": True}, "desc": "Non attacca per primo."},
    # Modificatori del danno
    "Marchio": {"polarita": "cattivo", "mod": {"marchio": True}, "desc": "+valore% danni subiti."},
    "Vulnerabile": {"polarita": "cattivo", "mod": {"vulnerabilita": True}, "desc": "+valore% danni del tipo."},
    "Resistente": {"polarita": "buono", "mod": {"resistenza": True}, "desc": "−valore% danni del tipo."},
    "Ferita grave": {"polarita": "cattivo", "mod": {"anti_cura": True}, "desc": "Cure ricevute −valore%."},
    "Potenziato": {"polarita": "buono", "mod": {"danno_bonus": True}, "desc": "+valore% danni inflitti."},
    "Indebolito": {"polarita": "cattivo", "mod": {"danno_bonus": True}, "negativo": True,
                   "desc": "−valore% danni inflitti."},
    "Furto di vita": {"polarita": "buono", "mod": {"furto_vita": True}, "desc": "Cura del valore% del danno inflitto."},
    "Spine": {"polarita": "buono", "mod": {"riflesso": True}, "desc": "Restituisce il valore% del danno subito."},
    "Scudo": {"polarita": "buono", "mod": {"scudo": True}, "desc": "Assorbe danni."},
    "Salvavita": {"polarita": "buono", "mod": {"salvavita": True}, "desc": "Resta a 1 HP invece di morire."},
    "Legame": {"polarita": "buono", "mod": {"legame": True}, "desc": "Parte del danno passa a chi l'ha creato."},
    # Economia delle azioni
    "Azione extra": {"polarita": "buono", "mod": {"azioni_extra": True}, "desc": "+valore azioni principali."},
    "Reazione extra": {"polarita": "buono", "mod": {"reazioni_extra": True}, "desc": "+valore reazioni."},
    "Lancio doppio": {"polarita": "buono", "mod": {"lanci_doppi": True}, "desc": "Due incantesimi con un'azione."},
    # Generici
    "Modifica": {"polarita": "buono", "mod": {"stat_mod": True}, "desc": "Statistica modificata."},
    "Forma": {"polarita": "buono", "mod": {}, "desc": "Trasformazione o postura."},
}


def make(name: str, *, stack: int = 1, turni: int = 0, valore: float = 0, stat: str = "", fonte: str = "",
         polarita: str = "") -> dict:
    """Nuova istanza di status (catalogo o personalizzato)."""
    d = STATUS.get(name, {})
    mod = dict(d.get("mod") or {})
    return {"nome": name, "polarita": d.get("polarita") or polarita or "cattivo", "stack": max(1, stack),
            "turni": max(0, turni), "valore": valore, "stat": stat or d.get("tipo", ""), "fonte": fonte, "mod": mod,
            "dispellabile": d.get("dispellabile", True), "negativo": bool(d.get("negativo"))}


def catalog() -> dict:
    return {"status": {k: {kk: v for kk, v in d.items()} for k, d in STATUS.items()}, "modifiers": MODIFIERS}
