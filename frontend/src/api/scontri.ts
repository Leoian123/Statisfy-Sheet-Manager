// Scontri sulla plancia (/api/scontri): stato del motore di combattimento del backend (app/engine.py).
import { request } from "./client";
import type { MechActionSlot, MechCost, MechDuration, MechKind, MechTarget, MechTiming } from "./mech";

export type Side = "alleati" | "nemici";

export interface ActiveStatus {
  nome: string; polarita: "buono" | "cattivo"; stack: number; turni: number; valore: number; stat: string; fonte: string;
  mod: Record<string, boolean>;
}
export interface CombatAbility {
  nome: string; grado: number | null; tipo: MechKind; timing: MechTiming; azione: MechActionSlot; durata: MechDuration;
  etichette: string[]; costi: MechCost[]; cd: { valore: number; unita: string }; bersaglio: MechTarget | null;
  descrizione: string; base: boolean;
  /** Senza meccanica: si paga il costo e l'effetto (testo) lo applica il Master */
  testo?: boolean;
}
export interface Combatant {
  id: string; nome: string; rif: string; lato: Side; vivo: boolean; tipo: string; taglia: string;
  hp: number; hp_max: number; mp: number; mp_max: number; sp: number; sp_max: number; ki?: number; ki_max?: number;
  stat: Record<string, number>; posizione: string; iniziativa?: number;
  status: ActiveStatus[]; cooldown: Record<string, number>; usi: Record<string, number>;
  ricarica_reale?: Record<string, string>;
  mantenuti: { abilita: string; turni: number; bersagli: string[]; resta: number }[];
  azioni: { principale: number; bonus: number; reazione: number };
  abilita: CombatAbility[]; evocazione?: { fonte: string; turni: number };
}
export interface Waiting {
  id: string; tipo: "reazione" | "canalizzazione" | "bomba" | "trappola"; fonte?: string; attore?: string;
  abilita: string; turni?: number; bersagli?: string[];
  candidati?: { id: string; nome: string; abilita: string; bersaglio: boolean }[];
}
export interface LogLine { r: number; t: string; k: string }
export interface BattleState {
  round: number; turno: number; ordine: string[]; combattenti: Record<string, Combatant>;
  campo: { nome: string; turni: number; fonte: string; lato: Side }[]; in_attesa: Waiting[]; registro: LogLine[];
}
export interface BattleResult {
  esito: "ok" | "reazione"; eventi: LogLine[]; passi: string[]; tiri: Record<string, number>; finestra?: Waiting | null;
}
export interface Battle {
  id: number; name: string; version: number; active: boolean; encounter_id: number | null; state: BattleState;
  mine: string[]; master: boolean; can_undo: boolean; result?: BattleResult;
}
export interface RollRequestSpec { key: string; tipo: "d100" | "valore"; label: string; min: number; max: number; soglia: number | null }
export interface BattlePreview {
  passi: string[]; richieste: RollRequestSpec[]; stima: Record<string, Record<string, [number, number]>>;
  eventi: LogLine[]; reazioni: { id: string; nome: string; abilita: string; bersaglio: boolean }[];
}
export interface BattleCandidates {
  encounters: { id: number; name: string; summary: string; party: number[]; creatures: number }[];
  characters: { id: number; name: string; level: number; classe: string; abilities: number }[];
}
export interface ManualCreature { name: string; count: number; level: number; rarity: string; size?: string }

const enc = encodeURIComponent;

export const battleApi = {
  active: () => request<{ scontro: Battle | null }>("GET", "/scontri/attivo"),
  candidates: () => request<BattleCandidates>("GET", "/scontri/candidati"),
  start: (body: { name?: string; encounter_id?: number | null; pg_ids?: number[]; creature?: ManualCreature[]; tutti?: boolean }) =>
    request<Battle>("POST", "/scontri", body),
  preview: (id: number, attore: string, abilita: string, bersagli: string[]) =>
    request<BattlePreview>("POST", `/scontri/${enc(id)}/anteprima`, { attore, abilita, bersagli }),
  act: (id: number, version: number, attore: string, abilita: string, bersagli: string[],
        tiri: Record<string, number> = {}, forza = false) =>
    request<Battle>("POST", `/scontri/${enc(id)}/azione`, { version, attore, abilita, bersagli, tiri, forza }),
  react: (id: number, version: number, finestra: string, attore: string | null, abilita: string | null, bersagli: string[] = []) =>
    request<Battle>("POST", `/scontri/${enc(id)}/reazione`, attore ? { version, finestra, attore, abilita, bersagli } : { version, finestra }),
  stopMaintained: (id: number, version: number, attore: string, abilita: string) =>
    request<Battle>("POST", `/scontri/${enc(id)}/mantenuto/stop`, { version, attore, abilita }),
  endTurn: (id: number, version: number) => request<Battle>("POST", `/scontri/${enc(id)}/fine-turno`, { version }),
  adjust: (id: number, version: number, cid: string, patch: { hp?: number; mp?: number; sp?: number; remove_status?: string; vivo?: boolean }) =>
    request<Battle>("POST", `/scontri/${enc(id)}/combattenti/${enc(cid)}`, { version, ...patch }),
  /** Il Master aggiunge creature (a mano o da un incontro) o PG a uno scontro in corso. */
  add: (id: number, version: number, body: { creature?: ManualCreature[]; encounter_id?: number | null; pg_ids?: number[] }) =>
    request<Battle>("POST", `/scontri/${enc(id)}/aggiungi`, { version, ...body }),
  undo: (id: number, version: number) => request<Battle>("POST", `/scontri/${enc(id)}/annulla`, { version }),
  close: (id: number, version: number) => request<Battle>("POST", `/scontri/${enc(id)}/chiudi`, { version }),
};
