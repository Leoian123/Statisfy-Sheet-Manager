// API della sezione PNG (/api/png, solo Master). Composizione, pescate e numeri sono tutti nel backend (app/png):
// qui solo i tipi e le chiamate. Lo stesso motore serve la pagina Mondo → PNG e il wizard PNG della Forgia.
import { request } from "./client";
import type { Npc } from "./types";

export type Atteggiamento = "ostile" | "diffidente" | "indifferente" | "interessato" | "ben_disposto";
export type Dettaglio = "comparsa" | "scheda" | "completa";

/** Strati di un PNG: ruolo → età → razza → luogo → ritocchi. */
export interface Strati {
  ruolo: string;
  eta: string;
  razza: string;
  regno?: string;
  insediamento?: string;
  zona?: string;
  ritocchi: string[];
}

/** Valore composto con lo strato che l'ha deciso, il file e la riga, il commento FONTE/PROPOSTA. */
export interface Campo { valore: unknown; da: string; dove: string; nota: string; prima?: unknown; sposta?: number }
export interface Voce { voce: string; da: string; dove: string; nota: string }

export interface Composizione {
  strati: Record<string, unknown>;
  campi: Record<string, Campo>;
  elenchi: Record<string, Voce[]>;
  atteggiamento: { frequenze: Record<Atteggiamento, number>; storia: (Partial<Campo> & { sposta?: Record<string, number> })[] };
  canone: string[];
  motivo_richiesto: string[];
  avvisi: string[];
  errori: string[];
}

export interface Immagine { id: string; src: string; principale: boolean; nota?: string }
export interface Ritratto { descrizione: string; immagini: Immagine[] }

export interface StatoPartita {
  vivo: boolean;
  atteggiamento_iniziale: Atteggiamento | null;
  affinita: number;
  memoria: { giorno?: number | null; testo: string }[];
  legami: { giorno?: number | null; testo: string }[];
  registro?: { giorno: number | null; chiesto: number; applicato: number; motivo: string; regola: string }[];
  morte?: { giorno: number | null; causa: string };
}

export interface Scheda {
  id: string;
  dettaglio: Dettaglio;
  provenienza: { ruolo: string; eta: string; razza: string; luogo: string; insediamento: string; ritocchi: string[]; seme: number };
  nome: string;
  genere: "m" | "f";
  livello: number;
  ruolo: string;
  razza: string;
  eta: { fase: string; apparente: number | null; vera: number | null };
  luogo: string;
  conta: string;
  tratti: string[];
  vuole: string | null; teme: string | null; difetto: string | null; forestieri: string | null; prezzo: string | null; vita: string | null;
  contraddizione: string | null;
  contraddizione_spunto?: string | null;
  perche_qui?: string | null;
  voce: string;
  sa: string[]; dicerie: string[]; puo_dare: string[]; no_tipici: string[]; malizia: string[]; segni: string[]; limiti: string[];
  corporatura: string;
  addestramento: string;
  profilo: Record<"STR" | "DEX" | "VIT" | "INT", string>;
  mestiere: { nome: string; grado: string | null } | null;
  ricchezza: string;
  motivo: string | null;
  stato_iniziale: StatoPartita;
  stato: Record<string, StatoPartita>;
  origine: Record<string, string>;
  da_ritoccare: string[];
  ritratto: Ritratto;
  completa?: Record<string, Record<string, unknown> | string | null>;
  db_id?: number;
}

export interface Combattimento {
  combatte: boolean | null;
  nota?: string;
  vita?: number; danno?: number; mana?: number; stamina?: number;
  formula_vita?: string; formula_danno?: string;
  modello?: string; livello?: number; taglia?: string; rarita?: string; addestramento?: string; abilita?: number[] | null; rango?: string;
}

export interface Comparsa {
  dettaglio: "comparsa"; id: string; nome: string; genere: "m" | "f"; ruolo: string; razza: string; eta: string; livello: number;
  tratto: string; difetto: string; atteggiamento: Atteggiamento; voce: string; provenienza: Scheda["provenienza"];
}

export interface Catalogo {
  ruoli: { nome: string; descrizione: string | null; eredita: string | null }[];
  eta: { nome: string; descrizione: string | null }[];
  razze: { nome: string; descrizione: string | null }[];
  regni: { nome: string; titolo: string | null }[];
  insediamenti: string[];
  zone: { nome: string; titolo: string | null; regno: string; insediamento: string }[];
  modello_numeri: string;
}

export interface Nota { dove: string; testo: string; genere?: "avviso" | "proposta" | "null" }
export interface Prova { nome: string; prova: string; atteso: string; esito: string; ok: boolean; dettagli: string[]; note: string[] }
export interface Controllo { errori: Nota[]; avvisi: Nota[]; prove: Prova[]; prove_ok: boolean }

/** Bozza di un PNG: strati + seme + campi scritti a mano. È la stessa forma del wizard PNG della Forgia. */
export interface Bozza extends Strati {
  seme: number;
  nome?: string;
  livello?: number | string;
  genere?: "m" | "f" | "";
  campi: Record<string, string>;
}

export interface NuovoOut {
  scheda: Scheda;
  avvisi: string[];
  errori: string[];
  composizione: Composizione;
  combattimento: Combattimento;
  seme: number;
  npc?: Npc;
}

export interface Confronto {
  ruolo: string;
  varianti: Record<string, { cambia: Record<string, Record<string, unknown>>; errori: string[]; motivo_richiesto: string[] }>;
}

const strati = (s: Partial<Strati>) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== "" && v != null));

export const pngApi = {
  catalogo: () => request<Catalogo>("GET", "/png/catalogo"),
  componi: (s: Strati) => request<Composizione>("POST", "/png/componi", strati({
    ruolo: s.ruolo, eta: s.eta, razza: s.razza, regno: s.regno, insediamento: s.insediamento, zona: s.zona, ritocchi: s.ritocchi,
  })),
  confronta: (ruolo: string) => request<Confronto>("GET", `/png/confronta/${encodeURIComponent(ruolo)}`),
  nuovo: (b: Bozza, opts: { salva?: boolean; ritratto?: Ritratto } = {}) => {
    const { livello, genere, nome, ...resto } = b;
    return request<NuovoOut>("POST", "/png/nuovo", {
      ...strati(resto), campi: Object.fromEntries(Object.entries(b.campi).filter(([, v]) => v.trim())),
      ...(nome?.trim() ? { nome: nome.trim() } : {}), ...(Number(livello) > 0 ? { livello: Number(livello) } : {}),
      ...(genere ? { genere } : {}), ...opts,
    });
  },
  comparse: (luogo: Partial<Strati>, quante: number, salva = false, seme?: number) =>
    request<{ comparse: Comparsa[]; seme: number; avvisi: string[]; npc?: Npc[] }>("POST", "/png/comparse",
      { ...strati({ regno: luogo.regno, insediamento: luogo.insediamento, zona: luogo.zona }), quante, salva, ...(seme ? { seme } : {}) }),
  schede: () => request<Npc[]>("GET", "/png/schede"),
  ritocca: (id: number, campi: Record<string, unknown>, extra: { nome?: string; livello?: number } = {}) =>
    request<{ npc: Npc; errori: Nota[]; avvisi: Nota[] }>("PATCH", `/png/schede/${id}`, { campi, ...extra }),
  combattimento: (id: number) => request<Combattimento>("GET", `/png/schede/${id}/combattimento`),
  promuovi: (id: number) => request<{ npc: Npc; avvisi: string[] }>("POST", `/png/schede/${id}/promuovi`),
  aggiorna: (id: number, ev: { giorno?: number; affinita?: number; motivo?: string; memoria?: string[]; legami?: string[]; morto?: string;
                               eccezione?: boolean; prima_impressione?: boolean }) =>
    request<{ npc: Npc; avvisi: string[] }>("POST", `/png/schede/${id}/aggiorna`, ev),
  riga: (id: number) => request<{ celle: string[]; markdown: string }>("GET", `/png/schede/${id}/riga`),
  controlla: () => request<Controllo>("GET", "/png/controlla"),
};
