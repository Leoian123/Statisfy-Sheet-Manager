/* Plancia del giocatore (porting di mockup/screens/plancia.js, vista giocatore): il tavolo del PG corrente.
   Allega skill, skill attive, titoli e talenti, scrivi per cosa tiri e lancia il d100. Il risultato lo genera
   il server (POST /api/table/characters/{id}/rolls): il vassoio anima i dadi fino a quei valori.
   Il regolamento non dà regole sul d100: il tiro somma i modificatori allegati e l'esito lo legge il Master.
   I valori suggeriti degli allegati sono proposte, modificabili a ogni tiro. Richieste e storico si aggiornano ogni 5 s. */
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errorText } from "../api/client";
import type { Character, Roll, RollMod, RollModKind, RollRequest } from "../api/types";
import { DiceTray, useDiceSound, type DiceTrayHandle, type ThrowOpts } from "../components/DiceTray";
import { RollLog, RollResult, modsSum, signed } from "../components/RollViews";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { ROMAN, rarityKey } from "../lib/format";
import { useCharacter } from "../lib/useCharacter";
import { usePolling } from "../lib/usePolling";
import "../styles/tavolo.css";

interface Item { key: string; kind: RollModKind; name: string; sub: string; rarity?: string; mod: number; text: string; raw?: string }
interface Group { label: string; items: Item[] }
type Attached = Record<string, Item>;

const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
const roman = (n: unknown) => ROMAN[Math.max(1, Math.min(10, Number(n) || 1))];
const statText = (b: Record<string, number> | undefined) => Object.entries(b || {}).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ");
const clampMod = (v: number) => Math.max(-999, Math.min(999, Math.trunc(Number(v) || 0)));

/** Cosa si può allegare, con i valori suggeriti: skill e skill attive +2 per Grado; titoli e talenti 0;
 *  Re dei Giochi = bonus Fortuna arrotondato; senza quel talento, una voce "Bonus Fortuna sui tiri". */
function attachables(c: Character): Group[] {
  const luckD = c.derived.find((d) => d.key === "bonusFortuna");
  const luck = luckD ? Number(luckD.value) : null;
  const groups: Group[] = [];
  const sk: Item[] = (c.skills || []).map((s) => ({ key: "sk:" + s.name, kind: "Skill", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.type || "—"}`,
    mod: 2 * (Number(s.lvl) || 0), text: s.passive || `Skill ${s.type || ""} di Grado ${roman(s.lvl)}` }));
  if (sk.length) groups.push({ label: "Skill", items: sk });
  const ak: Item[] = (c.active_skills || []).map((s) => ({ key: "as:" + s.name, kind: "Skill attiva", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.cost || ""}`,
    mod: 2 * (Number(s.lvl) || 0), text: s.effect || "" }));
  if (ak.length) groups.push({ label: "Skill attive", items: ak });
  const ti: Item[] = (c.titles || []).map((t) => ({ key: "ti:" + t.name, kind: "Titolo", name: t.name, sub: t.rarity, rarity: t.rarity,
    mod: 0, text: statText(t.bonus) || "Effetto narrativo" }));
  if (ti.length) groups.push({ label: "Titoli", items: ti });
  const lck = c.totals?.LCK;
  const ta: Item[] = (c.talents || []).map((t) => {
    const isLuck = /re dei giochi/i.test(t.name) && luck != null;
    return { key: "ta:" + t.name, kind: "Talento", name: t.name, sub: t.rarity + (t.origin ? ` · ${t.origin}` : ""), rarity: t.rarity,
      mod: isLuck ? Math.round(luck!) : 0, text: (t.effect || "") + (isLuck ? ` · ora +${nf(luck!)} (LCK ${lck ?? "?"}/100)` : "") };
  });
  if (ta.length) groups.push({ label: "Talenti", items: ta });
  if (luck != null && !ta.some((x) => /re dei giochi/i.test(x.name))) {
    groups.push({ label: "Statistiche", items: [{ key: "der:fortuna", kind: "Fortuna", name: "Bonus Fortuna sui tiri", sub: "LCK / 100",
      mod: Math.round(luck), text: "Dalla Fortuna (LCK)" }] });
  }
  return groups;
}

/* Allegati e campo "Per cosa tiri" restano per PG finché la pagina è aperta nella sessione del browser */
const memo = new Map<number, { attached: Attached; reason: string }>();

export function PlanciaGiocatore() {
  const id = Number(useParams().id);
  const { char, error, reload } = useCharacter(id);
  if (error && !char) return <ErrorBox title="Plancia" message={error} action={<button className="btn" type="button" onClick={reload}>Riprova</button>} />;
  if (!char || char.id !== id) return <Loading text="Il tavolo si prepara…" />;
  return <Table key={char.id} c={char} />;
}

function Table({ c }: { c: Character }) {
  const toast = useToast();
  const groups = useMemo(() => attachables(c), [c]);
  const saved = memo.get(c.id);
  const [attached, setAttachedRaw] = useState<Attached>(saved?.attached ?? {});
  const [reason, setReasonRaw] = useState(saved?.reason ?? "");
  const [q, setQ] = useState("");
  const [requestId, setRequestId] = useState<number | null>(null);
  const [last, setLast] = useState<Roll | null>(null);
  const [rolls, setRolls] = useState<Roll[] | null>(null);
  const [reqs, setReqs] = useState<RollRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pollErr, setPollErr] = useState<string | null>(null);
  const [sound, toggleSound] = useDiceSound();
  const tray = useRef<DiceTrayHandle>(null);
  const rollBtn = useRef<HTMLButtonElement>(null);
  const seenReqs = useRef<Set<number> | null>(null);

  const setAttached = (fn: (a: Attached) => Attached) => setAttachedRaw((a) => {
    const next = fn(a);
    memo.set(c.id, { attached: next, reason: memo.get(c.id)?.reason ?? reason });
    return next;
  });
  const setReason = (v: string) => { setReasonRaw(v); memo.set(c.id, { attached, reason: v }); };

  const refresh = useCallback(async () => {
    try {
      const [rs, qs] = await Promise.all([api.rolls({ charId: c.id, limit: 10 }), api.rollRequests("aperta")]);
      const mine = qs.filter((x) => x.char_id === c.id);
      // Nuova richiesta del Master arrivata col polling: avviso
      if (seenReqs.current) {
        const fresh = mine.filter((x) => !seenReqs.current!.has(x.id));
        if (fresh.length) toast("RICHIESTA DEL MASTER", fresh.map((x) => `Tiro d100: ${x.what}${x.note ? ` — ${x.note}` : ""}`), { gold: true });
      }
      seenReqs.current = new Set(mine.map((x) => x.id));
      setRolls(rs);
      setReqs(mine);
      setPollErr(null);
      setRequestId((rid) => (rid != null && !mine.some((x) => x.id === rid) ? null : rid));
    } catch (e) { setPollErr(errorText(e)); }
  }, [c.id, toast]);
  usePolling(refresh, 5000, [refresh]);

  const list = Object.values(attached);
  const sum = modsSum(list);

  async function doRoll(opts?: ThrowOpts) {
    if (busy || tray.current?.isRolling()) return;
    setBusy(true);
    setErr(null);
    const mods: RollMod[] = list.map((a) => ({ kind: a.kind, name: a.name, mod: clampMod(a.mod), text: a.text.slice(0, 300) }));
    try {
      const r = await api.rollForChar(c.id, { reason: reason.trim().slice(0, 120), mods, request_id: requestId });
      setLast(null);
      await tray.current?.throwTo(r.tens, r.units, opts);
      setLast(r);
      if (r.request_id != null) setRequestId(null);
      toast("TIRO", [`${c.name}: d100 ${r.natural}${r.mods.length ? ` ${signed(r.total - r.natural)} = ${nf(r.total)}` : ""}${r.reason ? ` · ${r.reason}` : ""}`],
        { gold: r.natural === 100 });
      refresh();
      rollBtn.current?.focus({ preventScroll: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

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
    rollBtn.current?.focus();
    rollBtn.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const ql = q.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((it) => !ql || `${it.name} ${it.sub} ${it.text}`.toLowerCase().includes(ql)) }))
    .filter((g) => g.items.length);

  return (
    <div className="stack tv-root">
      {reqs.map((x) => (
        <div key={x.id} className="sysmsg gold tv-req">
          <span className="tag">[RICHIESTA DEL MASTER]</span>
          <span>Tiro d100: <b>{x.what}</b>{x.note ? <span className="muted"> — {x.note}</span> : null}</span>
          <span><button type="button" className="btn primary tv-mini" aria-pressed={requestId === x.id} onClick={() => answer(x)}>
            {requestId === x.id ? "In risposta ✓" : "Rispondi con un tiro"}</button></span>
        </div>
      ))}
      <div className="tv-grid">
        <Win title={`Tavolo · ${c.name}`} gold className="tv-table">
          <div className="field">
            <label className="label" htmlFor="tv-reason">Per cosa tiri</label>
            <input className="input" id="tv-reason" maxLength={80} placeholder="es. Scassinare la serratura del forziere"
              value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DiceTray ref={tray} hint={!last} disabled={busy} onFling={(o) => doRoll(o)} />
          <div className="row tv-actions">
            <button type="button" ref={rollBtn} className="btn primary tv-roll" disabled={busy} onClick={() => doRoll()}>
              {busy ? "I dadi rotolano…" : "Lancia d100"}</button>
            <span className="small muted">Allegati: <b className="num">{signed(sum)}</b></span>
            <button type="button" className="btn ghost tv-mini" aria-pressed={sound} onClick={toggleSound}>{sound ? "Suono: sì" : "Suono: no"}</button>
          </div>
          {requestId != null && <span className="xs tv-gold">Questo tiro risponde alla richiesta del Master.
            <button type="button" className="tv-link" onClick={() => setRequestId(null)}>Annulla</button></span>}
          <InlineError message={err} />
          <div aria-live="polite">
            {busy && !last ? <p className="small muted dt-res-empty">I dadi rotolano…</p>
              : <RollResult r={last} empty="Allega quello che serve, scrivi per cosa tiri e lancia." />}
          </div>
        </Win>
        <div className="stack tv-side">
          <Win title="Allegati al tiro" right={list.length ? <span className="chip gold num">{signed(sum)}</span> : undefined}>
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
          <Win title="Skill, titoli e talenti">
            {groups.length ? <>
              <input className="input" type="search" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca tra skill, titoli e talenti" />
              <div className="tv-picker">
                {shown.length ? shown.map((g) => (
                  <div key={g.label} className="tv-pk-group">
                    <span className="label">{g.label}</span>
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
      <Win title="I miei tiri">
        <InlineError message={pollErr} />
        {rolls == null ? <Loading /> : <RollLog rolls={rolls} empty="Ancora nessun tiro." />}
      </Win>
    </div>
  );
}
