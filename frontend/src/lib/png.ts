// Sezione PNG: funzioni pure per l'interfaccia (etichette, strati, immagini). Le regole stanno nel backend (app/png).
import type { Atteggiamento, Bozza, Immagine, Scheda, Strati } from "../api/png";

export const ATTEGGIAMENTI: Atteggiamento[] = ["ostile", "diffidente", "indifferente", "interessato", "ben_disposto"];
export const ATT_LABEL: Record<Atteggiamento, string> = {
  ostile: "ostile", diffidente: "diffidente", indifferente: "indifferente o occupato", interessato: "interessato", ben_disposto: "ben disposto",
};
export const ATT_TONE: Record<Atteggiamento, string> = {
  ostile: "bad", diffidente: "warn", indifferente: "muted", interessato: "violet", ben_disposto: "good",
};
export const SETTE = ["vuole", "teme", "difetto", "forestieri", "prezzo", "vita", "contraddizione"] as const;
export const SETTE_LABEL: Record<string, string> = {
  vuole: "Vuole", teme: "Teme", difetto: "Difetto", forestieri: "Forestieri", prezzo: "Prezzo", vita: "In questi giorni",
  contraddizione: "Contraddizione", perche_qui: "Perché è qui", voce: "Voce",
};
export const SETTE_HELP: Record<string, string> = {
  vuole: "Che cosa gli serve oggi, di concreto (Taratura §2).",
  teme: "Che cosa ha paura di perdere.",
  difetto: "Deve costare qualcosa al forestiero almeno una volta.",
  forestieri: "Che cosa pensa dei forestieri, per esperienza diretta.",
  prezzo: "Che cosa chiede in cambio, detto o non detto.",
  vita: "Che cosa gli sta succedendo in questi giorni.",
  contraddizione: "Non si pesca: si scrive guardando difetto e tratti, e li smentisce.",
  perche_qui: "La sua razza è rara nel luogo: la scheda deve dire perché è lì.",
};

/** «mercante_ambulante» → «mercante ambulante» */
export const parola = (s: string | null | undefined) => String(s ?? "").replace(/_/g, " ");
export const maiuscola = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Colore del chip dello strato che ha deciso un valore. */
export function tonoStrato(da: string): string {
  const s = da.toLowerCase();
  if (s.startsWith("ritocco") || s.includes("scritto a mano")) return "gold";
  if (s.startsWith("ruolo") || s.includes("variante")) return "violet";
  if (s.startsWith("età")) return "good";
  if (s.startsWith("razza")) return "warn";
  if (s.startsWith("regno") || s.startsWith("zona") || s.startsWith("insediamento")) return "muted";
  return "muted";
}
/** «ruolo fabbro (villaggio)» → «ruolo» per il chip compatto */
export const nomeStrato = (da: string) => (da.includes("variante") ? "variante" : da.split(" ")[0] || da);

/** PROPOSTA o FONTE nel commento del preset. */
export function tipoNota(nota: string): "proposta" | "fonte" | null {
  if (/PROPOSTA/.test(nota)) return "proposta";
  if (/FONTE/.test(nota)) return "fonte";
  return null;
}

export function bozzaNuova(s: Partial<Strati> = {}, seme = nuovoSeme()): Bozza {
  return { ruolo: "cittadino", eta: "adulto", razza: "umano", zona: "alba-chiara", regno: "", insediamento: "", ritocchi: [],
           ...s, seme, nome: "", livello: "", genere: "", campi: {} };
}

export function nuovoSeme(rnd: () => number = Math.random): number {
  return 1 + Math.floor(rnd() * 2_000_000_000);
}

/** Lato lungo massimo e qualità con cui il browser riduce un ritratto prima di salvarlo (≤ 300 kB sul server). */
export const RITRATTO_LATO = 512;
export const RITRATTO_QUALITA = 0.82;
export const RITRATTO_MAX = 6;

/** Misure ridotte mantenendo le proporzioni: il lato lungo diventa al più `lato`. */
export function misureRidotte(w: number, h: number, lato = RITRATTO_LATO): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = Math.min(1, lato / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Immagini dopo un'aggiunta: al più RITRATTO_MAX, sempre una principale. */
export function aggiungiImmagine(imm: Immagine[], nuova: Immagine): Immagine[] {
  const out = [...imm, { ...nuova, principale: !imm.some((i) => i.principale) }].slice(-RITRATTO_MAX);
  return out.some((i) => i.principale) ? out : out.map((i, k) => ({ ...i, principale: k === 0 }));
}
export function principale(imm: Immagine[], id: string): Immagine[] {
  return imm.map((i) => ({ ...i, principale: i.id === id }));
}
export function togliImmagine(imm: Immagine[], id: string): Immagine[] {
  const out = imm.filter((i) => i.id !== id);
  return out.length && !out.some((i) => i.principale) ? out.map((i, k) => ({ ...i, principale: k === 0 })) : out;
}
export const ritrattoPrincipale = (s: Pick<Scheda, "ritratto"> | null | undefined) =>
  s?.ritratto?.immagini?.find((i) => i.principale) ?? s?.ritratto?.immagini?.[0] ?? null;

/** Iniziali per l'avatar provvisorio: «Mira Vacchetti» → «MV», «[nome da scegliere]» → «?» */
export function iniziali(nome: string): string {
  if (!nome || nome.startsWith("[")) return "?";
  const p = nome.trim().split(/\s+/).filter((x) => /^\p{L}/u.test(x));
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}

/** Affinità in parole (Status Sociale §3): il numero resta quello che conta. */
export function affinitaLabel(v: number): string {
  if (v <= -10) return "odio mortale";
  if (v <= -8) return "ostilità";
  if (v <= -5) return "diffidenza";
  if (v <= -2) return "sospetto";
  if (v === -1) return "indifferenza";
  if (v === 0) return "neutralità";
  if (v === 1) return "simpatia";
  if (v <= 4) return "apprezzamento";
  if (v <= 7) return "rispetto";
  if (v <= 9) return "devozione";
  return "adorazione";
}
