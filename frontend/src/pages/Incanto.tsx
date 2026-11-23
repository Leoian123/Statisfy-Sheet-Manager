/* Richiesta di incantesimo: il wizard Incantesimo o Miracolo della Forgia dentro una richiesta al Master.
   - Giocatore, nuova (/richieste/incanto?k=spells|miracles): compone e invia; vede solo i suoi PG, non assegna.
   - Giocatore, ?t=<id>: corregge la sua bozza finché la richiesta è attiva (torna «aperta» per il Master).
   - Master, ?t=<id>: rivede la bozza con il wizard completo, la ritocca se serve, forza se mancano requisiti e approva:
     entra nella libreria della Forgia e tra le skill attive del PG. Si respinge dalla pagina della richiesta. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { errorText } from "../api/client";
import { forgeApi, type ForgeMeta } from "../api/forge";
import { incantoMeta, ticketsApi, type MagicKind, type Ticket } from "../api/tickets";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { ErrorBox, Loading, SysMsg } from "../components/Status";
import { Win } from "../components/Win";
import { Wizard, type DraftState, type WizardApi, type WizardDef } from "../forge/engine";
import { MAGIC_WIZARDS } from "../forge/wizardsMagic";
import { canReviseIncanto } from "../lib/richieste";
import "../styles/forge.css";
import "../styles/richieste.css";

const NOTE_MAX = 2000;
const defOf = (k: MagicKind): WizardDef => MAGIC_WIZARDS.find((w) => w.kind === k)!;

export function Incanto() {
  const { user } = useAuth();
  const master = user?.role === "master";
  const { refreshChars } = useAppData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tid = Number(params.get("t")) || null;
  const kParam = params.get("k");
  const [meta, setMeta] = useState<ForgeMeta | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<DraftState | null>(null);
  const [note, setNote] = useState("");
  const [answer, setAnswer] = useState("");
  const [nonce, setNonce] = useState(0);
  const sentId = useRef<number | null>(null);  // richiesta appena inviata o approvata: dopo il salvataggio si apre

  const load = useCallback(async () => {
    setError(null);
    const [m, t] = await Promise.all([master ? forgeApi.meta() : ticketsApi.incantoMeta(), tid ? ticketsApi.get(tid) : Promise.resolve(null)]);
    setMeta(m);
    setTicket(t);
    const im = t ? incantoMeta(t) : null;
    if (t && !im) throw new Error("Questa richiesta non è un incantesimo.");
    if (im) {
      const d = master ? { ...im.draft, charId: String(t!.char_id ?? ""), assign: true, force: false } : im.draft;
      setState({ d, step: 0 });
      setNote(im.note ?? "");
    } else setState(null);
  }, [master, tid]);

  useEffect(() => { load().catch((e) => setError(errorText(e))); }, [load, nonce]);

  const back = () => navigate(tid ? `/richieste?t=${tid}` : "/richieste");
  const title = master ? "Rivedi l'incantesimo" : tid ? "Modifica l'incantesimo" : "Richiedi un incantesimo";

  if (master && !tid) {
    return <ErrorBox title="Richiedi un incantesimo" message="Le richieste di incantesimo le compongono i giocatori. Il Master crea incantesimi e miracoli nella Forgia."
      action={<Link className="btn" to="/master/forgia">Apri la Forgia</Link>} />;
  }
  if (error) return <ErrorBox title={title} message={error} action={<button type="button" className="btn" onClick={() => setNonce((n) => n + 1)}>Riprova</button>} />;
  if (!meta || (tid && !ticket)) return <Loading text="Apro il grimorio…" />;

  const im = ticket ? incantoMeta(ticket) : null;
  const kind: MagicKind | null = im?.forge_kind ?? (kParam === "spells" || kParam === "miracles" ? kParam : null);

  // Richiesta chiusa o non più modificabile
  if (ticket && (master ? !(ticket.status === "aperta" || ticket.status === "in_esame") || ticket.archived_at : !canReviseIncanto(ticket))) {
    return (
      <Win title={title}>
        <div className="stack">
          <SysMsg lines={["La richiesta è chiusa: l'incantesimo non si modifica più."]} />
          <div className="row"><Link className="btn" to={`/richieste?t=${ticket.id}`}>Torna alla richiesta</Link></div>
        </div>
      </Win>
    );
  }

  // Nuova richiesta del giocatore: prima si sceglie tra incantesimo e miracolo
  const clerics = meta.characters.filter((c) => c.cleric);
  if (!kind) {
    return (
      <div className="stack fg-root in-root">
        <button type="button" className="btn ghost fg-back" onClick={back}>← Torna alle richieste</button>
        <Win title="Richiedi un incantesimo" gold>
          {!meta.characters.length ? <p className="ms-empty">Non hai ancora un personaggio: chiedi al Master di assegnartene uno.</p> : (
            <div className="stack">
              <p className="muted small">Componi l'abilità con il sistema di meccanica del gioco, come nella Forgia del Master. Lui la rivede e la approva (entra tra le skill attive del tuo PG) o la respinge.</p>
              <div className="fg-cards">
                <button type="button" className="fg-card" onClick={() => setParams({ k: "spells" })}>
                  <span className="label">Magia arcana</span>
                  <h3>Incantesimo</h3>
                  <span className="small muted">Il mago compone le sfere: effetto, meccanica, livello, metamagia, costo Mana e backlash.</span>
                </button>
                <button type="button" className="fg-card" disabled={!clerics.length} onClick={() => setParams({ k: "miracles" })}
                  title={clerics.length ? undefined : "Solo i chierici chiedono miracoli: nessuno dei tuoi PG è un chierico."}>
                  <span className="label">Fede</span>
                  <h3>Miracolo</h3>
                  <span className="small muted">{clerics.length ? "Il chierico chiede al suo dio: Fede, favore divino, costo Mana, voti e tabù." : "Solo per i chierici: nessuno dei tuoi PG lo è."}</span>
                </button>
              </div>
            </div>
          )}
        </Win>
      </div>
    );
  }

  const def = defOf(kind);
  // Il miracolo lo chiede un chierico: nella richiesta del giocatore si scelgono solo i suoi chierici
  const wmeta: ForgeMeta = !master && kind === "miracles" ? { ...meta, characters: clerics } : meta;
  if (!master && !wmeta.characters.length) {
    return <ErrorBox title={title} message={kind === "miracles" ? "Nessuno dei tuoi PG è un chierico." : "Non hai ancora un personaggio."}
      action={<button type="button" className="btn" onClick={back}>Torna alle richieste</button>} />;
  }
  const cur = state ?? { d: def.fresh(wmeta), step: 0 };
  const charName = ticket?.char_name ?? "il PG";

  const api: WizardApi = master ? {
    preview: (k, d) => forgeApi.preview(k, d),
    submit: async (_k, d) => {
      const r = await ticketsApi.incantoApprove(ticket!.id, { version: ticket!.version, draft: d, force: !!d.force, risposta: answer.trim() });
      sentId.current = r.ticket.id;
      refreshChars();
      return { tag: "RICHIESTE", messages: ["Incantesimo approvato.", ...r.messages] };
    },
    ready: `Pronto: approvando entra nella libreria e tra le skill attive di ${charName}.`,
  } : {
    preview: (k, d) => ticketsApi.incantoPreview(k as MagicKind, d),
    submit: async (k, d) => {
      const t = ticket
        ? await ticketsApi.incantoUpdate(ticket.id, { version: ticket.version, draft: d, note: note.trim() })
        : await ticketsApi.incantoCreate(k as MagicKind, d, note.trim());
      sentId.current = t.id;
      return { tag: "RICHIESTE", messages: [ticket ? "Incantesimo aggiornato: il Master vedrà la nuova versione." : "Richiesta inviata al Master.", "Ti avviso qui quando risponde."] };
    },
    ready: "Pronto: invialo al Master.",
  };

  const extra = master ? (
    <Win title={`Richiesta di ${ticket?.author_name ?? "—"} per ${charName}`}>
      <div className="stack">
        {im?.note && <p className="small rq-pre"><span className="muted">Note del giocatore:</span> {im.note}</p>}
        <p className="small muted">Puoi ritoccare ogni passo (costo, livello, meccanica) prima di approvare. Per respingerlo o chiedere modifiche torna alla richiesta.</p>
        <div className="field">
          <label className="label" htmlFor="in-ans">Risposta al giocatore (facoltativa)</label>
          <textarea className="input" id="in-ans" rows={2} maxLength={5000} value={answer} placeholder="Es. Approvato, ma il costo sale a 35 MP."
            onChange={(e) => setAnswer(e.target.value)} />
        </div>
      </div>
    </Win>
  ) : (
    <div className="field in-note">
      <label className="label" htmlFor="in-note">Note per il Master (facoltative)</label>
      <textarea className="input" id="in-note" rows={2} maxLength={NOTE_MAX} value={note} placeholder="Es. Lo immagino contro i non morti della cripta."
        onChange={(e) => setNote(e.target.value)} />
    </div>
  );

  return (
    <div className="stack fg-root in-root">
      <button type="button" className="btn ghost fg-back" onClick={back}>{tid ? "← Torna alla richiesta" : "← Torna alle richieste"}</button>
      <Wizard key={`${kind}-${tid ?? "new"}`} def={def} meta={wmeta} state={cur} setState={setState} mode={master ? "approve" : "player"} api={api} extra={master ? extra : undefined} footer={master ? undefined : extra}
        cancelTitle={master ? "Torna alla richiesta senza approvare" : "Scarta le modifiche e torna alle richieste"}
        submitLabel={(x) => master ? (x.d.force ? `Approva e forza su ${charName}` : `Approva per ${charName}`) : ticket ? "Invia la nuova versione" : "Invia al Master"}
        onCancel={back}
        onSaved={() => navigate(sentId.current ? `/richieste?t=${sentId.current}` : "/richieste")} />
    </div>
  );
}
