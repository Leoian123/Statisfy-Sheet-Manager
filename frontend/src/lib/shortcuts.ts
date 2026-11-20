/* Scorciatoie da tastiera della Plancia di gioco. Valgono solo quando non si sta scrivendo (campo, menu, area di testo),
   senza Ctrl/Alt/Cmd, senza ripetizione del tasto tenuto premuto e con nessuna finestra di dialogo aperta.
   +  Sopra · −  Sotto · L  Lancia · R  Ripeti l'ultimo tiro (prepara, non lancia). Testate in tests/shortcuts.test.ts. */

export type BoardShortcut = "sopra" | "sotto" | "roll" | "repeat";

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  /** Elemento che ha ricevuto il tasto: tag e contentEditable bastano. */
  target?: { tagName?: string; isContentEditable?: boolean; type?: string } | null;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);
// Pulsanti e caselle non scrivono testo: lì le scorciatoie restano attive
const NON_TEXT_INPUT = new Set(["button", "checkbox", "radio", "range", "submit", "reset"]);

export const SHORTCUT_HELP: [string, string][] = [["+", "Sopra"], ["−", "Sotto"], ["L", "Lancia"], ["R", "Ripeti l'ultimo tiro"]];

export function boardShortcut(e: KeyLike, dialogOpen = false): BoardShortcut | null {
  if (dialogOpen || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return null;
  const t = e.target;
  if (t) {
    if (t.isContentEditable) return null;
    const tag = (t.tagName || "").toUpperCase();
    if (TYPING.has(tag) && !(tag === "INPUT" && NON_TEXT_INPUT.has((t.type || "").toLowerCase()))) return null;
  }
  switch (e.key) {
    case "+": case "=": return "sopra";
    case "-": case "_": return "sotto";
    case "l": case "L": return "roll";
    case "r": case "R": return "repeat";
    default: return null;
  }
}
