"""Modelli della galleria della Forgia: una meccanica pronta per ogni categoria di effetto.

`cat` = numero della categoria (1–57 dall'elenco del Master, 58–74 quelle trovate negli incantesimi esistenti).
Ogni modello è un `mech` valido: il Master lo sceglie, poi ritocca nomi, numeri e status.
"""
from __future__ import annotations

from typing import Any


def F(base: str = "incantesimo", tipo: str = "magico", **kw) -> dict:
    return {"base": base, "tipo": tipo, **kw}


_EFF_KEYS = {"condizioni", "scaling", "probabilita", "critico", "ritardo", "figli"}


def E(op: str, formula: dict | None = None, lato: str = "nemico", forma: str = "singolo", evento: str = "al_lancio",
      bers: dict | None = None, trig: dict | None = None, **kw) -> dict:
    eff: dict[str, Any] = {"trigger": {"evento": evento, **(trig or {})},
                           "bersaglio": {"lato": lato, "forma": forma, **(bers or {})},
                           "azione": {"op": op}}
    for k, v in kw.items():
        if k in _EFF_KEYS:
            eff[k] = v
        else:
            eff["azione"][k] = v
    if formula is not None:
        eff["formula"] = formula
    return eff


def M(*effetti: dict, tipo: str = "incantesimo", mp: float = 30, **kw) -> dict:
    m: dict[str, Any] = {"v": 1, "tipo": tipo, "effetti": list(effetti)}
    if mp and tipo != "passiva":
        m["costi"] = [{"risorsa": "MP" if tipo == "incantesimo" else "SP" if tipo in ("skill", "attacco") else "FEDE",
                       "valore": mp, "per": "lancio"}]
    m.update(kw)
    return m


def T(cat: int, gruppo: str, nome: str, desc: str, mech: dict) -> dict:
    return {"id": f"c{cat:02d}", "cat": cat, "gruppo": gruppo, "nome": nome, "desc": desc, "mech": mech}


DANNO, CTRL, STAT, VITA, RIS, META, NUOVE = "Danno", "Controllo", "Buff, debuff e status", "Vita e morte", \
    "Risorse e tempo", "Meta", "Altre meccaniche"

TEMPLATES: list[dict] = [
    T(1, DANNO, "Dardo", "Un colpo singolo al lancio.", M(E("danno", F(tipo="Vis")), etichette=["Vis", "Proiettile"])),
    T(2, DANNO, "Colpi multipli", "Più colpi con un solo lancio.",
      M(*[E("danno", F("intervallo", min=20, max=40)) for _ in range(3)])),
    T(3, DANNO, "Danno continuato", "Finché lo mantieni, colpisce a ogni tuo turno e cresce.",
      M(E("danno", F(tipo="Aqua"), forma="area", bers={"raggio": 3, "n": 5}),
        E("danno", F(tipo="Aqua"), forma="area", evento="inizio_turno", bers={"raggio": 3, "n": 5},
          scaling=[{"da": "turni_mantenuto", "passo": 15, "max": 60}]),
        durata={"tipo": "mantenuto"}, costi=[{"risorsa": "MP", "valore": 40, "per": "lancio"},
                                            {"risorsa": "MP", "valore": 40, "per": "turno"}])),
    T(4, DANNO, "Status che fa danno", "Applica un danno nel tempo.",
      M(E("status_applica", F("fissa", min=25, tipo="Veleno"), status="Veleno", stack=1, turni=3))),
    T(5, VITA, "Cura", "Cura un alleato.", M(E("cura", F(tipo="Vita"), lato="alleato"))),
    T(6, VITA, "Danno e cura", "Colpisce e ti cura di parte del danno.", M(E("danno_e_cura", F(tipo="Anima"), pct=50))),
    T(7, DANNO, "Percentuale della vita", "Danno pari a una percentuale della vita del bersaglio.",
      M(E("danno", F("pct_hp", pct=10, quale="max", tipo="puro")))),
    T(8, STAT, "Potenzia i danni altrui", "Un alleato infligge più danni.",
      M(E("status_applica", lato="alleato", status="Potenziato", valore=25, turni=2))),
    T(9, STAT, "Scudo", "Assorbe danni.", M(E("scudo", F("fissa", min=150), lato="alleato", turni=3))),
    T(10, META, "Evocazione", "Evoca un alleato temporaneo.",
      M(E("evoca", F("intervallo", min=20, max=40), lato="se", nome="Famiglio", hp=200, turni=5))),
    T(11, CTRL, "Reindirizza il colpo", "Reazione: il colpo nemico prende te invece del bersaglio.",
      M(E("reindirizza", lato="se"), timing="reazione", azione="reazione", mp=20)),
    T(12, CTRL, "Interrompi", "Reazione: annulla l'incantesimo o la skill di un nemico.",
      M(E("interrompi"), timing="reazione", azione="reazione", mp=40, tiro_colpire=False)),
    T(13, STAT, "Modifica statistiche", "Cambia una statistica per qualche turno.",
      M(E("stat_mod", stat="precisione", valore=-20, turni=2))),
    T(14, DANNO, "Cresce con lo storico", "Più danno per ogni colpo subito in questo scontro.",
      M(E("danno", F("arma", tipo="fisico"), scaling=[{"da": "storico", "evento": "colpito", "passo": 10, "max": 50}]),
        tipo="skill", mp=15)),
    T(15, DANNO, "Cresce con i lanci", "Più forte ogni volta che lo lanci.",
      M(E("danno", F(), scaling=[{"da": "lanci", "passo": 10, "max": 100}]))),
    T(16, DANNO, "Esecuzione", "Uccide sotto una soglia di vita.", M(E("esegui_sotto", pct=15), mp=60)),
    T(17, DANNO, "Area", "Colpisce più nemici in una zona.",
      M(E("danno", F(tipo="Ignis"), forma="area", bers={"raggio": 5, "n": 6}))),
    T(18, DANNO, "Catena", "Rimbalza su più bersagli calando a ogni salto.",
      M(E("danno", F(tipo="Ventus"), forma="catena", bers={"n": 4, "calo": 25}))),
    T(19, DANNO, "Bomba ritardata", "Esplode dopo qualche turno.", M(E("danno", F(), ritardo=2), tiro_colpire=False)),
    T(20, DANNO, "Danno puro", "Ignora armatura, scudi e resistenze.", M(E("danno", F(tipo="puro")))),
    T(21, DANNO, "Vita mancante", "Più danno quanto più il bersaglio è ferito.",
      M(E("danno", F(), scaling=[{"da": "hp_mancante_bersaglio", "passo": 1, "max": 100}]))),
    T(22, STAT, "Spine", "Restituisce parte del danno subito.", M(E("riflesso", lato="se", pct=30, turni=3))),
    T(23, CTRL, "Contrattacco", "Passiva: quando vieni colpito rispondi con un attacco.",
      M(E("danno", F("arma", tipo="fisico"), evento="quando_colpito"), tipo="passiva")),
    T(24, CTRL, "Trappola o runa", "Scatta quando un nemico agisce.",
      M(E("danno", F(), evento="azione_nemica",
          figli=[E("status_applica", status="Immobilizzato", turni=1)]), tiro_colpire=False)),
    T(25, CTRL, "Stordimento", "Il bersaglio salta il turno.", M(E("status_applica", status="Stordito", turni=1))),
    T(26, CTRL, "Silenzio o disarmo", "Blocca gli incantesimi (o gli attacchi con Disarmato).",
      M(E("status_applica", status="Silenzio", turni=2))),
    T(27, CTRL, "Provocazione", "I nemici devono colpire te.",
      M(E("status_applica", forma="tutti", status="Provocato", turni=2), tipo="skill", mp=20)),
    T(28, CTRL, "Charme o confusione", "Il bersaglio attacca i suoi alleati.",
      M(E("status_applica", status="Charme", turni=1))),
    T(29, CTRL, "Invisibilità", "Non puoi essere scelto come bersaglio finché non agisci.",
      M(E("status_applica", lato="se", status="Invisibile", turni=3))),
    T(30, CTRL, "Spostamento", "Spinge, attira o scambia le posizioni.", M(E("sposta", modo="spingi"))),
    T(31, STAT, "Dissolvi e purifica", "Toglie gli effetti positivi ai nemici e quelli negativi agli alleati.",
      M(E("dispel", modo="buoni", stack=2), E("dispel", lato="alleato", modo="cattivi", stack=2))),
    T(32, STAT, "Invulnerabilità", "Nessun danno per un turno.",
      M(E("status_applica", lato="se", status="Invulnerabile", turni=1), mp=80)),
    T(33, STAT, "Marchio", "Il bersaglio subisce più danni da tutti.",
      M(E("status_applica", status="Marchio", valore=20, turni=3))),
    T(34, STAT, "Furto", "Ruba un effetto positivo e del mana.",
      M(E("ruba_buff"), E("risorsa", F("fissa", min=50), risorsa="mp", modo="ruba"))),
    T(35, STAT, "Anti-cura", "Le cure sul bersaglio rendono meno.",
      M(E("status_applica", status="Ferita grave", valore=50, turni=3))),
    T(36, STAT, "Status a soglia", "Si accumula: 3 stack di Gelo congelano.",
      M(E("danno", F(tipo="Aqua"), figli=[E("status_applica", status="Gelo", turni=3)]))),
    T(37, STAT, "Detonazione", "Consuma uno status per un effetto extra.",
      M(E("status_consuma", status="Gelo",
          figli=[E("danno", F(tipo="Aqua"), scaling=[{"da": "consumati", "passo": 50, "max": 150}])]))),
    T(38, STAT, "Aura", "Finché la mantieni, gli alleati infliggono più danni.",
      M(E("status_applica", lato="alleato", forma="tutti", evento="inizio_turno", status="Potenziato", valore=10,
          turni=1), durata={"tipo": "mantenuto"},
        costi=[{"risorsa": "MP", "valore": 20, "per": "lancio"}, {"risorsa": "MP", "valore": 20, "per": "turno"}])),
    T(39, VITA, "Furto di vita", "Per qualche turno ti curi di parte del danno inflitto.",
      M(E("status_applica", lato="se", status="Furto di vita", valore=25, turni=3))),
    T(40, VITA, "Resurrezione", "Riporta in vita un alleato.", M(E("resuscita", lato="alleato", pct=30), mp=200)),
    T(41, VITA, "Salvavita", "Chi dovrebbe morire resta a 1 HP, una volta.",
      M(E("salvavita", lato="alleato", turni=3), mp=100)),
    T(42, VITA, "Effetto alla morte", "Passiva: quando muori esplodi sui nemici.",
      M(E("danno", F("fissa", min=300, tipo="Ignis"), forma="tutti", evento="muore"), tipo="passiva")),
    T(43, VITA, "Sacrificio", "Paghi vita per curare molto un alleato.",
      M(E("cura", F("fissa", min=500, tipo="Vita"), lato="alleato"), costi=[{"risorsa": "HP", "valore": 200}])),
    T(44, VITA, "Legame", "Metà del danno subito dall'alleato passa a te.",
      M(E("legame", lato="alleato", pct=50, turni=3))),
    T(45, VITA, "Cura in eccesso → scudo", "La cura oltre il massimo diventa scudo.",
      M(E("cura", F(tipo="Vita"), lato="alleato", eccesso_scudo=True))),
    T(46, RIS, "Canalizzato", "Due turni di preparazione, effetto potente; interrompibile.",
      M(E("danno", F("incantesimo", molt="efficacia"), forma="area", bers={"n": 6}),
        durata={"tipo": "canalizzato", "turni": 2})),
    T(47, RIS, "Costo alternativo", "Si paga con stack di uno status invece che con il mana.",
      M(E("danno", F("arma", tipo="fisico"), critico=25), tipo="skill", mp=0,
        costi=[{"risorsa": "stack", "status": "Carica", "valore": 3}])),
    T(48, RIS, "Prosciuga mana", "Ruba mana al bersaglio.",
      M(E("risorsa", F("fissa", min=100), risorsa="mp", modo="ruba"))),
    T(49, RIS, "Manipola cooldown", "Azzera i tuoi cooldown e allunga quelli nemici.",
      M(E("cd_mod", lato="se", valore=-2), E("cd_mod", valore=2), mp=60)),
    T(50, RIS, "Turno extra", "Un alleato ottiene un'azione in più.", M(E("turno_mod", lato="alleato", modo="extra"))),
    T(51, META, "Copia", "Ripete l'ultima abilità usata dal bersaglio.", M(E("copia"), tiro_colpire=False)),
    T(52, META, "Trasformazione", "Cambia forma: più evasione per tre turni.",
      M(E("trasforma", lato="se", nome="Forma dell'acqua", turni=3,
          figli=[E("stat_mod", lato="se", stat="evasione", valore=30, turni=3)]))),
    T(53, META, "Critici e proc", "Alta probabilità di critico e 30% di bruciare.",
      M(E("danno", F(tipo="Ignis"), critico=20,
          figli=[E("status_applica", F("fissa", min=30, tipo="Ignis"), status="Bruciatura", turni=2,
                   probabilita=30)]))),
    T(54, META, "Condizionale", "Danno extra se il bersaglio è Bagnato.",
      M(E("danno", F(tipo="Ventus"),
          figli=[E("danno", F("fissa", min=100, tipo="Ventus"),
                   condizioni=[{"soggetto": "bersaglio", "test": "ha_status", "status": "Bagnato"}])]))),
    T(55, META, "Effetto di campo", "Nebbia: i nemici mirano peggio a ogni round.",
      M(E("campo", lato="se", nome="Nebbia", turni=3,
          figli=[E("stat_mod", forma="tutti", stat="precisione", valore=-20, turni=1)]), tiro_colpire=False)),
    T(56, META, "Passiva", "Sempre attiva: +20% critico.",
      M(E("stat_mod", lato="se", evento="passivo", stat="critico", valore=20), tipo="passiva")),
    T(57, META, "Dopo un incantesimo specifico", "Se lanciato subito dopo un incantesimo #Vis, colpisce ancora.",
      M(E("danno", F(tipo="Aqua")),
        interazioni=[{"dopo": "#Vis", "entro_turni": 1,
                      "effetto": E("danno", F("fissa", min=150, tipo="Vis"))}])),
    # Meccaniche trovate negli incantesimi esistenti
    T(58, NUOVE, "Effetto agganciato a un'etichetta", "Passiva: ogni incantesimo #Vis lancia anche un dardo.",
      M(tipo="passiva", rider=[{"etichetta": "Vis", "effetto": E("danno", F("fissa", min=80, tipo="Vis"))}])),
    T(59, NUOVE, "Fusione", "Richiede di conoscere Scudo e Dardo arcano.",
      M(E("danno", F(tipo="Vis"), forma="area", bers={"n": 4}), fusione=["Scudo", "Dardo arcano"], mp=80)),
    T(60, NUOVE, "Immobilizzare", "Non si muove né schiva, ma può agire.",
      M(E("status_applica", status="Immobilizzato", turni=2))),
    T(61, NUOVE, "Rivelare", "Annulla l'invisibilità e mostra le statistiche.", M(E("rivela"), tiro_colpire=False)),
    T(62, NUOVE, "Azioni in più", "Due incantesimi con una sola azione per due turni.",
      M(E("status_applica", lato="se", status="Lancio doppio", turni=2), mp=60)),
    T(63, NUOVE, "All'uccisione", "Passiva: ogni uccisione ti cura del 20%.",
      M(E("cura", F("pct_hp", pct=20, di="se", tipo="Vita"), lato="se", evento="uccide"), tipo="passiva")),
    T(64, NUOVE, "Danno in eccesso", "Passiva: il danno oltre la morte passa a un altro nemico.",
      M(E("danno", F("pct_eccesso", pct=100, tipo="puro"), forma="casuale", evento="uccide"), tipo="passiva")),
    T(65, NUOVE, "Comando", "Indichi un bersaglio: gli alleati gli fanno più danni.",
      M(E("status_applica", status="Marchio", valore=20, turni=1), tipo="skill", mp=10, tiro_colpire=False)),
    T(66, NUOVE, "Domare", "Tenta di far passare dalla tua parte una creatura indebolita.",
      M(E("doma", pct=25, probabilita=60), tipo="skill", mp=120)),
    T(67, NUOVE, "Costrutto", "Crea un costrutto con propria vita (ponte, muro, labirinto).",
      M(E("evoca", lato="se", nome="Costrutto di fili", hp=300, turni=0), tipo="skill", mp=40)),
    T(68, NUOVE, "Penetrazione", "Ignora parte della resistenza.", M(E("danno", F(tipo="Aqua", penetrazione=35)))),
    T(69, NUOVE, "Potenziamento da oggetto", "Passiva: +1 al grado degli incantesimi #Mens.",
      M(tipo="passiva", rider=[{"etichetta": "Mens", "grado": 1}])),
    T(70, NUOVE, "A vista", "Nessun limite di portata.",
      M(E("danno", F(tipo="Spatium"), bers={"portata": "a_vista"}))),
    T(71, NUOVE, "Neutralità di fazione", "Una fazione non attacca per prima.",
      M(E("narrativo", lato="se", evento="passivo", testo="I draghi non ti attaccano a vista."), tipo="passiva")),
    T(72, NUOVE, "Contraccolpo", "Potente ma con rischio di sfuggire al controllo.",
      M(E("danno", F("incantesimo", molt="efficacia"), forma="area", bers={"n": 6}), rischio=15, mp=120)),
    T(73, NUOVE, "Ricarica in tempo reale", "Una volta al giorno.",
      M(E("scudo", F("fissa", min=500), lato="alleato", forma="tutti", turni=2),
        cooldown={"valore": 1, "unita": "giorni"}, mp=100)),
    T(74, NUOVE, "Resistenza percentuale", "−40% ai danni di fuoco per tre turni.",
      M(E("status_applica", lato="se", status="Resistente", stat="Ignis", valore=40, turni=3))),
]


def templates() -> list[dict]:
    return TEMPLATES


# Skill iniziali delle classi (rules.CLASSES): meccanica di default quando la scheda non ne ha una
_INVIS = {"soggetto": "se", "test": "ha_status", "status": "Invisibile"}
_VIS = {"soggetto": "se", "test": "non_ha_status", "status": "Invisibile"}
CLASS_MECH: dict[str, dict] = {
    "dardo magico": M(E("danno", F(tipo="Vis")), mp=20, tiro_colpire=False, cooldown={"valore": 1, "unita": "turni"},
                      etichette=["Vis", "Proiettile"]),
    "attacco possente": M(E("danno", F("arma", tipo="fisico"), scaling=[{"da": "grado", "passo": 50, "max": 50}]),
                          tipo="skill", mp=15, cooldown={"valore": 3, "unita": "turni"}),
    "colpo furtivo": M(E("danno", F("arma", tipo="fisico"), condizioni=[_VIS]),
                       E("danno", F("arma", tipo="fisico"), critico=100, condizioni=[_INVIS]),
                       tipo="skill", mp=10, cooldown={"valore": 2, "unita": "turni"}),
    "cura minore": M(E("cura", F("intervallo", min=40, max=60, tipo="Vita"), lato="alleato"), tipo="miracolo", mp=0,
                     costi=[{"risorsa": "MP", "valore": 25, "per": "lancio"}], cooldown={"valore": 1, "unita": "turni"}),
}
