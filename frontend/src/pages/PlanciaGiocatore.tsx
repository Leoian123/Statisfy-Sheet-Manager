/* Plancia di gioco del PG: un'unica pagina per giocare (ha preso il posto delle vecchie pagine Plancia e Combattimento).
   - HUD compatto e sticky: nome, barre HP/MP/SP (KI) con −/+ rapidi, turno, posizione, quantità.
   - Tiro d100 al centro: dichiarazione Sopra/Sotto (obbligatoria), per cosa tiri, vassoio, Lancia, Tiro veloce, suono.
     Il risultato lo genera il server (POST /api/table/characters/{id}/rolls) e calcola anche il critico sul naturale.
   - A lato: Combattimento (progressive disclosure: chiuso quando non serve, si apre da solo se ci sono effetti o
     cooldown o il turno è > 1) e gli allegati al tiro (skill, skill attive, titoli, talenti, Fortuna).
   - Un solo registro con filtro Tutto / Tiri / Combattimento.
   - Telefono: HUD sticky e selettore di sezione Tiro / Combattimento / Allegati.
   - Tastiera (lib/shortcuts.ts): + Sopra, − Sotto, L lancia, R ripete la preparazione dell'ultimo tiro.
   Richieste del Master e tiri si aggiornano ogni 5 s con la pagina visibile. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errorText } from "../api/client";
import type { Character, CombatActionType, ResourceKey, Roll, RollCall, RollMod, RollRequest } from "../api/types";
import { useAppData } from "../auth/AppData";
import { CallPicker } from "../components/CallPicker";
import { CombatPanel } from "../components/CombatPanel";
import { DiceTray, useDiceSound, useFastRoll, type DiceTrayHandle, type ThrowOpts } from "../components/DiceTray";
import { PlayerHud } from "../components/PlayerHud";
import { PlayRegister } from "../components/PlayRegister";
import { RollResult, modsSum, signed } from "../components/RollViews";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { rarityKey } from "../lib/format";
import { attachables, clampMod, filterGroups, fromRoll, type AttachItem as Item, type Attached } from "../lib/attach";
import { SHORTCUT_HELP, boardShortcut } from "../lib/shortcuts";
import { useBusy, useCharacter } from "../lib/useCharacter";
import { usePolling } from "../lib/usePolling";
import { BattleBanner } from "../components/combat/BattleBanner";
import "../styles/tavolo.css";
import "../styles/gioco.css";

type Tab = "tiro" | "combattimento" | "allegati";

const FALLBACK_POSITIONS = ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"];
const CALL_KEY = "statisfy-roll-call";
const COMBAT_OPEN_KEY = "statisfy-combat-open";
const PHONE = "(max-width: 760px)";

const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
const load = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* facoltativo */ } };

/** Vero sul telefono (larghezza ≤ 760px): una sezione alla volta. */
function usePhone() {
  const [phone, setPhone] = useState(() => typeof matchMedia === "function" && matchMedia(PHONE).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

/* Allegati, "Per cosa tiri" e sezione aperta sul telefono restano per PG finché la pagina è aperta nella sessione del browser */
const memo = new Map<number, { attached: Attached; reason: string; tab: Tab }>();

export function PlanciaGiocatore() {
  const id = Number(useParams().id);
  const { char, setChar, error, reload } = useCharacter(id);
  if (error && !char) return <ErrorBox title="Plancia di gioco" message={error} action={<button className="btn" type="button" onClick={reload}>Riprova</button>} />;
  if (!char || char.id !== id) return <Loading text="Il tavolo si prepara…" />;
  return <Board key={char.id} c={char} setChar={setChar} />;
}

function Board({ c, setChar }: { c: Character; setChar: (c: Character) => void }) {
  const toast = useToast();
  const { rules, refreshChars } = useAppData();
  const phone = usePhone();
  const groups = useMemo(() => attachables(c), [c]);
  const saved = memo.get(c.id);
  const [attached, setAttachedRaw] = useState<Attached>(saved?.attached ?? {});
  const [reason, setReasonRaw] = useState(saved?.reason ?? "");
  const [tab, setTabRaw] = useState<Tab>(saved?.tab ?? "tiro");
  const [call, setCallRaw] = useState<RollCall | null>(() => { const v = load(CALL_KEY); return v === "sopra" || v === "sotto" ? v : null; });
  const [callMissing, setCallMissing] = useState(false);
  const [q, setQ] = useState("");
  const [requestId, setRequestId] = useState<number | null>(null);
  const [last, setLast] = useState<Roll | null>(null);
  const [rolls, setRolls] = useState<Roll[] | null>(null);
  const [reqs, setReqs] = useState<RollRequest[]>([]);
  const [rolling, setRolling] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [sound, toggleSound] = useDiceSound();
  const [fast, toggleFast] = useFastRoll();
  const [amt, setAmt] = useState("50");
  const { busy, error: actErr, run } = useBusy();
  const tray = useRef<DiceTrayHandle>(null);
  const rollBtn = useRef<HTMLButtonElement>(null);
  const callRef = useRef<HTMLDivElement>(null);
  const seenReqs = useRef<Set<number> | null>(null);
  // Mutazioni avviate da questa scheda: un polling partito prima non deve sovrascrivere la risposta più recente
  const mutations = useRef(0);

  /* Combattimento: aperto se in corso (effetti, cooldown o turno > 1), altrimenti come l'ultima scelta */
  const active = c.combat.effects.length > 0 || c.combat.cooldowns.length > 0 || c.combat.turn > 1;
  const [open, setOpen] = useState(() => active || load(COMBAT_OPEN_KEY) === "open");
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) setOpen(true);
    wasActive.current = active;
  }, [active]);
  const toggleOpen = () => setOpen((o) => { save(COMBAT_OPEN_KEY, o ? "closed" : "open"); return !o; });

  const keep = (patch: Partial<{ attached: Attached; reason: string; tab: Tab }>) =>
    memo.set(c.id, { attached, reason, tab, ...memo.get(c.id), ...patch });
  const setAttached = (fn: (a: Attached) => Attached) => setAttachedRaw((a) => { const next = fn(a); keep({ attached: next }); return next; });
  const setReason = (v: string) => { setReasonRaw(v); keep({ reason: v }); };
  const setTab = (t: Tab) => { setTabRaw(t); keep({ tab: t }); window.scrollTo({ top: 0 }); };
  const setCall = (v: RollCall | null) => { setCallRaw(v); if (v) { save(CALL_KEY, v); setCallMissing(false); } };

  const refresh = useCallback(async () => {
    try {
      const seq = mutations.current;
      const [rs, qs, fresh] = await Promise.all([api.rolls({ charId: c.id, limit: 30 }), api.rollRequests("aperta"), api.character(c.id)]);
      // Scheda aggiornata (HP cambiati dal Master, effetti, livello) se nel frattempo qui non è partita un'azione
      if (seq === mutations.current) setChar(fresh);
      const mine = qs.filter((x) => x.char_id === c.id);
      // Nuova richiesta del Master arrivata col polling: avviso
      if (seenReqs.current) {
        const nuove = mine.filter((x) => !seenReqs.current!.has(x.id));
        if (nuove.length) toast("RICHIESTA DEL MASTER", nuove.map((x) => `Tiro d100: ${x.what}${x.note ? ` — ${x.note}` : ""}`), { gold: true });
      }
      seenReqs.current = new Set(mine.map((x) => x.id));
      setRolls(rs);
      setReqs(mine);
      setPollErr(null);
      setRequestId((rid) => (rid != null && !mine.some((x) => x.id === rid) ? null : rid));
    } catch (e) { setPollErr(errorText(e)); }
  }, [c.id, toast, setChar]);
  usePolling(refresh, 5000, [refresh]);

  /* ---------- Combattimento (HUD e sezione condividono quantità, stato "in corso" ed errore) ---------- */
  const apply = useCallback(async (fn: () => Promise<Character>) => {
    mutations.current += 1;
    const out = await run(fn);
    mutations.current += 1;
    if (out) setChar(out);
    return out;
  }, [run, setChar]);
  const amount = Math.floor(Number(amt));
  const onAction = (type: CombatActionType) => { if (Number.isFinite(amount) && amount > 0) apply(() => api.combatAction(c.id, type, amount)); };
  // Recupero relativo calcolato dal server sul valore salvato: non riscrive HP/MP/SP cambiati da un'altra sessione
  const onRestore = (key: Exclude<ResourceKey, "hp">) => {
    if (amount > 0) apply(() => api.combatAction(c.id, `restore_${key}`, amount));
  };
  const onPosition = (p: string) => apply(() => api.patchCharacter(c.id, { combat: { position: p } }));

  /* ---------- Tiro ---------- */
  const list = Object.values(attached);
  const sum = modsSum(list);

  async function doRoll(opts?: ThrowOpts) {
    if (rolling || tray.current?.isRolling()) return;
    if (!call) {
      setCallMissing(true);
      if (phone && tab !== "tiro") setTab("tiro");
      // il selettore può stare sotto l'HUD sticky: lo si porta al centro prima del focus
      callRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      callRef.current?.querySelector("button")?.focus({ preventScroll: true });
      return;
    }
    setRolling(true);
    setErr(null);
    const mods: RollMod[] = list.map((a) => ({ kind: a.kind, name: a.name, mod: clampMod(a.mod), text: a.text.slice(0, 300) }));
    try {
      const r = await api.rollForChar(c.id, { call, reason: reason.trim().slice(0, 120), mods, request_id: requestId });
      setLast(null);
      await tray.current?.throwTo(r.tens, r.units, { ...opts, instant: fast });
      setLast(r);
      if (r.request_id != null) setRequestId(null);
      toast("TIRO", [`${c.name}: d100 ${r.natural}${r.mods.length ? ` ${signed(r.total - r.natural)} = ${nf(r.total)}` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
        ...(r.crit ? [`${r.crit === "supercritico" ? "SUPERCRITICO" : "Critico"} (${r.call})`] : [])], { gold: r.crit != null });
      refresh();
      rollBtn.current?.focus({ preventScroll: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setRolling(false);
    }
  }

  /* Ripeti ultimo: stessi allegati (con i valori usati), motivo e dichiarazione dell'ultimo tiro del PG. Non lancia. */
  const lastRoll = rolls?.[0] ?? null;
  function repeatLast() {
    if (!lastRoll || rolling) return;
    const x = fromRoll(lastRoll, groups);
    setAttached(() => x.attached);
    setReason(x.reason);
    if (x.call) setCall(x.call);
    toast("SISTEMA", [`Pronto come l'ultimo tiro${x.reason ? `: ${x.reason}` : ""}. Premi Lancia.`,
      ...(x.missing.length ? [`Non più nella scheda: ${x.missing.join(", ")}.`] : [])]);
    rollBtn.current?.focus({ preventScroll: true });
  }

  /* Scorciatoie da tastiera (non mentre si scrive o con una finestra aperta) */
  const keys = useRef({ doRoll, repeatLast, setCall, rolling });
  keys.current = { doRoll, repeatLast, setCall, rolling };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = boardShortcut({ key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, repeat: e.repeat,
        target: e.target as HTMLElement | null }, !!document.querySelector("dialog[open]"));
      if (!k) return;
      const h = keys.current;
      if (h.rolling && k !== "sopra" && k !== "sotto") return;
      e.preventDefault();
      if (k === "sopra" || k === "sotto") h.setCall(k);
      else if (k === "roll") h.doRoll();
      else h.repeatLast();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggle(it: Item) {
    setAttached((a) => {
      const n = { ...a };
      if (n[it.key]) delete n[it.key];
      else n[it.key] = { ...it };
      return n;
    });
  }
  function answer(x: RollRequest) {
    setRequestId(x.id);
    setReason(x.what);
    if (phone && tab !== "tiro") setTab("tiro");
    requestAnimationFrame(() => {
      rollBtn.current?.focus({ preventScroll: true });
      rollBtn.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  const shown = filterGroups(groups, q);
  const positions = rules?.positions ?? FALLBACK_POSITIONS;

  return (
    <div className="pg-root" data-tab={tab}>
      <BattleBanner charId={c.id} />
      <PlayerHud c={c} amt={amt} setAmt={setAmt} busy={busy} error={actErr} positions={positions}
        onAction={onAction} onRestore={onRestore} onPosition={onPosition} />

      <div className="seg pg-tabs" role="group" aria-label="Sezione della plancia">
        <button type="button" aria-pressed={tab === "tiro"} onClick={() => setTab("tiro")}>Tiro</button>
        <button type="button" aria-pressed={tab === "combattimento"} onClick={() => setTab("combattimento")}>
          Combattimento{active ? <span className="pg-dot" aria-label="in corso" /> : null}</button>
        <button type="button" aria-pressed={tab === "allegati"} onClick={() => setTab("allegati")}>
          Allegati{list.length ? <span className="num xs pg-tab-n">{signed(sum)}</span> : null}</button>
      </div>

      {reqs.map((x) => (
        <div key={x.id} className="sysmsg gold tv-req pg-req">
          <span className="tag">[RICHIESTA DEL MASTER]</span>
          <span>Tiro d100: <b>{x.what}</b>{x.note ? <span className="muted"> — {x.note}</span> : null}</span>
          <span><button type="button" className="btn primary tv-mini" aria-pressed={requestId === x.id} onClick={() => answer(x)}>
            {requestId === x.id ? "In risposta ✓" : "Rispondi con un tiro"}</button></span>
        </div>
      ))}

      <div className="pg-grid">
        <div className="stack pg-main">
          <Win title="Tiro d100" gold className="tv-table pg-sec sec-tiro">
            <div className="pg-roll-top">
              <div ref={callRef} className="pg-call">
                <CallPicker id="pg-call" value={call} onChange={setCall} missing={callMissing} disabled={rolling} />
              </div>
              <div className="field pg-reason">
                <label className="label" htmlFor="pg-reason">Per cosa tiri</label>
                <input className="input" id="pg-reason" maxLength={80} placeholder="es. Scassinare la serratura del forziere"
                  value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <DiceTray ref={tray} hint={!last} disabled={rolling} onFling={(o) => doRoll(o)} />
            <div className="row tv-actions">
              <button type="button" ref={rollBtn} className="btn primary tv-roll" disabled={rolling} aria-describedby="pg-call-h"
                onClick={() => doRoll()}>{rolling ? "I dadi rotolano…" : call ? `Lancia d100 · ${call === "sopra" ? "↑ Sopra" : "↓ Sotto"}` : "Lancia d100"}</button>
              <button type="button" className="tv-link pg-att-sum small" onClick={() => setTab("allegati")} title="Allegati al tiro">
                Allegati: <b className="num">{signed(sum)}</b></button>
              <button type="button" className="btn ghost tv-mini" disabled={!lastRoll || rolling} onClick={repeatLast}
                title={lastRoll ? `Prepara di nuovo l'ultimo tiro (tasto R): ${lastRoll.reason || "senza motivo"}${lastRoll.mods.length ? ` · ${lastRoll.mods.map((m) => `${m.name} ${signed(m.mod)}`).join(", ")}` : ""}` : "Ancora nessun tiro da ripetere"}>
                ↻ Ripeti ultimo</button>
              <span className="row tv-toggles">
                <button type="button" className="btn ghost tv-mini" aria-pressed={fast} onClick={toggleFast}
                  title="Mostra subito il risultato, senza animazione">{fast ? "Tiro veloce: sì" : "Tiro veloce: no"}</button>
                <button type="button" className="btn ghost tv-mini" aria-pressed={sound} onClick={toggleSound}>{sound ? "Suono: sì" : "Suono: no"}</button>
                {!phone && <span className="chip muted pg-keys" tabIndex={0} aria-label={`Scorciatoie da tastiera: ${SHORTCUT_HELP.map(([k, v]) => `${k} ${v}`).join(", ")}`}
                  title={["Scorciatoie da tastiera (non mentre scrivi)", ...SHORTCUT_HELP.map(([k, v]) => `${k}  ${v}`)].join("\n")}>⌨</span>}
              </span>
            </div>
            {requestId != null && <span className="xs tv-gold">Questo tiro risponde alla richiesta del Master.
              <button type="button" className="tv-link" onClick={() => setRequestId(null)}>Annulla</button></span>}
            <InlineError message={err} />
            <div aria-live="polite">
              {rolling && !last ? <p className="small muted dt-res-empty">I dadi rotolano…</p>
                : <RollResult r={last} empty="Dichiara Sopra o Sotto, allega quello che serve, scrivi per cosa tiri e lancia." />}
            </div>
          </Win>
          <div className="pg-sec sec-tiro sec-combattimento pg-log-wrap">
            <PlayRegister c={c} rolls={rolls ?? []} loading={rolls == null} error={<InlineError message={pollErr} />} />
          </div>
        </div>

        <div className="stack pg-side">
          <div className="pg-sec sec-combattimento pg-combat-wrap">
            <CombatPanel c={c} rules={rules} busy={busy} amt={amt} setAmt={setAmt} apply={apply} onDied={refreshChars}
              open={open || phone} onToggle={phone ? undefined : toggleOpen} />
          </div>
          <Win title="Allegati al tiro" className="pg-sec sec-allegati" right={list.length ? <span className="chip gold num">{signed(sum)}</span> : undefined}>
            {list.length ? (
              <ul className="tv-att">
                {list.map((a) => (
                  <li key={a.key} className="tv-att-row" title={`${a.kind} · ${a.name}${a.text ? `\n${a.text}` : ""}`}>
                    <span className="tv-att-name"><span className="xs muted">{a.kind}</span> {a.name}</span>
                    <input className="input num tv-att-mod" type="number" step={1} min={-999} max={999} value={a.raw ?? String(a.mod)}
                      aria-label={`Modificatore di ${a.name}`}
                      onChange={(e) => { const raw = e.target.value; setAttached((x) => ({ ...x, [a.key]: { ...x[a.key], raw, mod: clampMod(Number(raw)) } })); }}
                      onBlur={() => setAttached((x) => (x[a.key] ? { ...x, [a.key]: { ...x[a.key], raw: undefined } } : x))} />
                    <button type="button" className="btn icon ghost" aria-label={`Togli ${a.name}`} onClick={() => toggle(a)}>✕</button>
                  </li>
                ))}
              </ul>
            ) : <p className="small muted">Niente allegato: il tiro sarà un d100 secco. Scegli dall'elenco qui sotto.</p>}
          </Win>
          <Win title="Skill, titoli e talenti" className="pg-sec sec-allegati">
            {groups.length ? <>
              <input className="input" type="search" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca tra skill, titoli e talenti" />
              <div className="tv-picker">
                {shown.length ? shown.map((g) => (
                  <div key={g.label} className="tv-pk-group" role="group" aria-labelledby={`tv-pk-${g.label.replace(/\W+/g, "-")}`}>
                    <span className="label" id={`tv-pk-${g.label.replace(/\W+/g, "-")}`}>{g.label}</span>
                    {g.items.map((it) => {
                      const on = !!attached[it.key];
                      return (
                        <button key={it.key} type="button" className={`tv-pk${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggle(it)}
                          title={`${it.name}\n${it.sub}\n${it.text}\nSuggerito sul tiro: ${signed(it.mod)}`}>
                          <span className="tv-pk-name" data-rarity={it.rarity ? rarityKey(it.rarity) : undefined}>{it.name}</span>
                          <span className="xs muted tv-pk-sub">{it.sub}</span>
                          <span className="num xs tv-pk-mod">{it.mod ? signed(it.mod) : "—"}</span>
                        </button>
                      );
                    })}
                  </div>
                )) : <p className="small muted">Nessun risultato.</p>}
              </div>
              <p className="footnote">Valori suggeriti: skill e skill attive +2 per Grado; titoli e talenti 0 (scrivi tu l'effetto sul tiro); Re dei Giochi = bonus Fortuna. Sono una proposta: cambiali sugli allegati.</p>
            </> : <p className="small muted">Nessuna skill, titolo o talento da allegare.</p>}
          </Win>
        </div>
      </div>
    </div>
  );
}
