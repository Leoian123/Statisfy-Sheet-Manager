/* Mappa della navigazione: poche sezioni per ruolo, sottoschede dentro ogni sezione.
   Una funzione nuova entra come sottoscheda di una sezione esistente, non come voce di menu nuova.
   Giocatore: Personaggio · Gioca · Richieste · Diario
   Master:    Tavolo · Richieste · Personaggi · Mondo · Campagna */

export type Role = "master" | "player";
export type Icon = "pg" | "dice" | "inbox" | "book" | "table" | "users" | "world" | "flag";

export interface NavTab {
  label: string;
  to: string;
  /** La scheda è attiva solo con il percorso esatto */
  end?: boolean;
  /** Punto di richiamo (es. scontro in corso) */
  dot?: boolean;
}
export interface NavSection {
  key: string;
  label: string;
  icon: Icon;
  to: string;
  /** Il percorso appartiene a questa sezione? */
  match: (path: string) => boolean;
  tabs: NavTab[];
  /** Mostra il selettore del personaggio nell'intestazione della sezione */
  charPicker?: boolean;
  badge?: number;
  dot?: boolean;
}

export interface NavCtx {
  role: Role;
  charId: number | null;
  tickets: number;
  battle: boolean;
}

const isChar = (p: string) => /^\/personaggi\/\d+/.test(p);
const charSub = (p: string) => p.replace(/^\/personaggi\/\d+/, "");

export function sections({ role, charId, tickets, battle }: NavCtx): NavSection[] {
  const pg = (s = "") => (charId != null ? `/personaggi/${charId}${s}` : "/crea");
  const richieste: NavSection = {
    key: "richieste", label: "Richieste", icon: "inbox", to: "/richieste", badge: tickets,
    match: (p) => p.startsWith("/richieste"), tabs: [],
  };
  if (role === "master") {
    return [
      {
        key: "tavolo", label: "Tavolo", icon: "table", to: "/master/plancia", dot: battle,
        match: (p) => p.startsWith("/master/plancia") || p.startsWith("/scontro"),
        // Lo scontro a turni è facoltativo: la scheda compare solo se ne è stato avviato uno (da un incontro preparato)
        tabs: battle ? [{ label: "Plancia", to: "/master/plancia" }, { label: "Scontro", to: "/scontro", dot: true }] : [],
      },
      richieste,
      {
        key: "personaggi", label: "Personaggi", icon: "users", to: pg(), charPicker: true,
        match: (p) => isChar(p) || p.startsWith("/crea"),
        tabs: charId != null ? [
          { label: "Scheda", to: pg(), end: true },
          { label: "Level up", to: pg("/level-up") },
          { label: "Plancia del PG", to: pg("/plancia") },
        ] : [],
      },
      {
        key: "mondo", label: "Mondo", icon: "world", to: "/master/forgia",
        match: (p) => p.startsWith("/master/forgia"),
        tabs: [],
      },
      {
        key: "campagna", label: "Campagna", icon: "flag", to: "/master",
        match: (p) => p === "/master" || p.startsWith("/master/amministrazione") || p.startsWith("/diario"),
        tabs: [
          { label: "Sessioni e regole", to: "/master", end: true },
          { label: "Diario", to: "/diario" },
          { label: "Amministrazione", to: "/master/amministrazione" },
        ],
      },
    ];
  }
  return [
    {
      key: "personaggio", label: "Personaggio", icon: "pg", to: pg(), charPicker: true,
      match: (p) => (isChar(p) && charSub(p) !== "/plancia") || p.startsWith("/crea"),
      tabs: charId != null ? [{ label: "Scheda", to: pg(), end: true }, { label: "Level up", to: pg("/level-up") }] : [],
    },
    {
      key: "gioca", label: "Gioca", icon: "dice", to: pg("/plancia"), dot: battle,
      match: (p) => (isChar(p) && charSub(p) === "/plancia") || p.startsWith("/scontro"),
      tabs: battle ? [{ label: "Tavolo", to: pg("/plancia") }, { label: "Scontro", to: "/scontro", dot: true }] : [],
    },
    richieste,
    { key: "diario", label: "Diario", icon: "book", to: "/diario", match: (p) => p.startsWith("/diario"), tabs: [] },
  ];
}

export function activeSection(list: NavSection[], path: string): NavSection | null {
  return list.find((s) => s.match(path)) ?? null;
}
