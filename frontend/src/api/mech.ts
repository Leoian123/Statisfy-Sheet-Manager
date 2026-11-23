// Meccanica strutturata delle abilità (backend: app/mech.py). Il vocabolario completo (etichette italiane,
// modelli, catalogo degli status) arriva da GET /forge/meta → `mech` (solo Master).

export type MechEvent =
  | "al_lancio" | "inizio_turno" | "fine_turno" | "quando_colpito" | "quando_colpisce" | "uccide" | "muore"
  | "morte_alleato" | "azione_nemica" | "dopo_abilita" | "soglia_hp" | "passivo";
export type MechSide = "se" | "alleato" | "nemico" | "qualsiasi";
export type MechShape = "singolo" | "area" | "catena" | "casuale" | "tutti";
export type MechReach = "mischia" | "distanza" | "a_vista";
export type MechOp =
  | "danno" | "cura" | "danno_e_cura" | "scudo" | "status_applica" | "status_rimuovi" | "status_consuma" | "stat_mod"
  | "evoca" | "sposta" | "interrompi" | "reindirizza" | "dispel" | "risorsa" | "ruba_buff" | "cd_mod" | "turno_mod"
  | "copia" | "trasforma" | "campo" | "esegui_sotto" | "resuscita" | "salvavita" | "legame" | "riflesso" | "doma"
  | "rivela" | "narrativo";
export type MechBase = "fissa" | "intervallo" | "dadi" | "incantesimo" | "arma" | "pct_hp" | "pct_danno" | "pct_eccesso";
export type MechKind = "incantesimo" | "miracolo" | "skill" | "attacco" | "passiva";
export type MechTiming = "mio_turno" | "reazione" | "entrambi";
export type MechActionSlot = "principale" | "bonus" | "libera" | "reazione";
export type MechDuration = "istantaneo" | "turni" | "mantenuto" | "canalizzato";

export interface MechTrigger { evento: MechEvent; chi?: "se" | "bersaglio"; abilita?: string; soglia?: number }
export interface MechTarget { lato: MechSide; forma: MechShape; n?: number; raggio?: number; calo?: number; portata?: MechReach }
export interface MechFormula {
  base: MechBase; min?: number; max?: number; dadi?: string; pct?: number; di?: "se" | "bersaglio";
  quale?: "max" | "attuale" | "mancante"; molt?: "nessuno" | "moltMag" | "moltFis" | "efficacia"; tipo?: string;
  penetrazione?: number;
}
export interface MechCondition {
  soggetto: "se" | "bersaglio"; test: string; status?: string; valore?: number; testo?: string; entro?: number;
}
export interface MechScaling { da: string; status?: string; evento?: string; passo: number; max?: number }
export interface MechAction {
  op: MechOp; status?: string; stack?: number; turni?: number; stat?: string; valore?: number; pct?: number;
  risorsa?: "" | "hp" | "mp" | "sp" | "ki"; modo?: string; nome?: string; hp?: number; eccesso_scudo?: boolean;
  polarita?: "" | "buono" | "cattivo"; testo?: string;
}
export interface MechEffect {
  trigger: MechTrigger; bersaglio: MechTarget; azione: MechAction; formula?: MechFormula | null;
  condizioni?: MechCondition[]; scaling?: MechScaling[]; probabilita?: number; critico?: number; ritardo?: number;
  figli?: MechEffect[];
}
export interface MechCost { risorsa: "MP" | "SP" | "KI" | "HP" | "FEDE" | "stack" | "cariche"; valore: number; per: "lancio" | "turno"; status?: string }
export interface Mech {
  v: 1; tipo: MechKind; costi?: MechCost[]; cooldown?: { valore: number; unita: "turni" | "ore" | "giorni" | "settimana" };
  usi?: { n: number; per: "scontro" | "giorno" } | null; timing?: MechTiming; azione?: MechActionSlot;
  durata?: { tipo: MechDuration; turni?: number; interrompibile?: boolean }; tiro_colpire?: boolean; rischio?: number;
  etichette?: string[]; effetti: MechEffect[];
  interazioni?: { dopo: string; entro_turni: number; consuma_status?: string; effetto: MechEffect }[];
  rider?: { etichetta: string; effetto?: MechEffect | null; grado?: number }[]; fusione?: string[];
}

export interface MechTemplate { id: string; cat: number; gruppo: string; nome: string; desc: string; mech: Mech }
export interface StatusDef {
  polarita: "buono" | "cattivo"; desc: string; mod?: Record<string, boolean>; stack_max?: number; soglia?: number;
  diventa?: string; tipo?: string;
}
/** Vocabolario: chiave → etichetta italiana. */
export interface MechVocabulary {
  events: Record<MechEvent, string>; reactive: MechEvent[]; sides: Record<MechSide, string>; shapes: Record<MechShape, string>;
  reach: Record<MechReach, string>; ops: Record<MechOp, string>; bases: Record<MechBase, string>; mults: Record<string, string>;
  damage_types: string[]; tests: Record<string, string>; scales: Record<string, string>; timings: Record<MechTiming, string>;
  actions: Record<MechActionSlot, string>; durations: Record<MechDuration, string>; resources: Record<string, string>;
  cd_units: Record<string, string>; kinds: Record<MechKind, string>; max_effects: number;
  status: { status: Record<string, StatusDef>; modifiers: Record<string, string> };
  templates: MechTemplate[];
}
