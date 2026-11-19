import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorText } from "../api/client";
import type { Derived, RulesConfig, StatRow } from "../api/types";
import { useAppData } from "../auth/AppData";
import { Loading, SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { fmt, n } from "../lib/format";

const STEPS = ["Nome", "Classe", "Statistiche", "Riepilogo"];
type Code = "STR" | "DEX" | "VIT" | "INT";
const CODES: Code[] = ["STR", "DEX", "VIT", "INT"];
const STAT_INFO: Record<Code, { name: string; desc: string }> = {
  STR: { name: "Forza", desc: "Danno fisico, carico, stamina" },
  DEX: { name: "Destrezza", desc: "Evasione, precisione, stamina" },
  VIT: { name: "Vitalità", desc: "Vita, rigenerazione, resistenze" },
  INT: { name: "Intelligenza", desc: "Mana, bonus EXP, danno magico" },
};
const PREVIEW_KEYS = ["hp", "mp", "sp", "carico", "evasione", "precisione"];

interface Wizard {
  step: number;
  name: string;
  classId: string | null;
  stats: Record<Code, number>;
  regno: string;
}

// Lo stato del wizard sopravvive ai cambi di schermata (come nel mockup)
let saved: Wizard | null = null;

function fresh(rules: RulesConfig): Wizard {
  const b = rules.creation.base;
  return { step: 1, name: "", classId: null, stats: { STR: b, DEX: b, VIT: b, INT: b }, regno: rules.kingdoms[0]?.id ?? "" };
}

export function Crea() {
  const { rules } = useAppData();
  if (!rules) return <Loading />;
  return <Wizard rules={rules} />;
}

function Wizard({ rules }: { rules: RulesConfig }) {
  const C = rules.creation;
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshChars } = useAppData();
  const [w, setW] = useState<Wizard>(() => saved ?? fresh(rules));
  const [preview, setPreview] = useState<Derived[] | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => { saved = w; }, [w]);
  const upd = (p: Partial<Wizard>) => setW((x) => ({ ...x, ...p }));

  const remaining = C.bonus_points - CODES.reduce((s, k) => s + (w.stats[k] - C.base), 0);
  const cls = rules.classes.find((x) => x.id === w.classId) ?? null;
  const kingdom = rules.kingdoms.find((k) => k.id === w.regno) ?? rules.kingdoms[0];

  const nameCheck = useMemo(() => {
    const name = w.name.trim();
    if (!name) return { ok: false, empty: true, msg: `${C.name_min}–${C.name_max} caratteri, solo lettere e numeri.` };
    if (!/^[A-Za-z0-9]+$/.test(name)) return { ok: false, msg: "Solo lettere e numeri: niente spazi, accenti o simboli." };
    if (name.length < C.name_min) return { ok: false, msg: `Troppo corto: ${name.length} caratteri su minimo ${C.name_min}.` };
    if (name.length > C.name_max) return { ok: false, msg: `Troppo lungo: ${name.length} caratteri su massimo ${C.name_max}.` };
    return { ok: true, msg: "Formato valido. L'unicità viene verificata alla conferma." };
  }, [w.name, C]);

  const valid = (k: number): boolean => {
    if (k === 1) return nameCheck.ok;
    if (k === 2) return !!cls;
    if (k === 3) return remaining === 0;
    return valid(1) && valid(2) && valid(3);
  };
  const canReach = (k: number) => { for (let j = 1; j < k; j++) if (!valid(j)) return false; return true; };
  const goStep = (k: number) => { if (k >= 1 && k <= 4 && (k === w.step || canReach(k))) { upd({ step: k }); setSubmitErr(null); } };

  // Anteprima derivate dal server, con debounce
  const statsKey = CODES.map((k) => w.stats[k]).join(",");
  useEffect(() => {
    if (w.step < 3) return;
    setStale(true);
    const t = window.setTimeout(() => {
      const stats: StatRow[] = CODES.map((code) => ({
        code, name: STAT_INFO[code].name, kind: "base", iniziale: C.base, creazione: w.stats[code] - C.base,
        investiti: 0, levelup: 0, altro: 0, titoli: 0, note: null, total: w.stats[code],
      }));
      api.preview({ stats })
        .then((r) => { setPreview(r.derived); setPreviewErr(null); })
        .catch((e) => setPreviewErr(errorText(e)))
        .finally(() => setStale(false));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsKey, w.step >= 3]);

  const pd = useMemo(() => Object.fromEntries((preview ?? []).map((d) => [d.key, d])), [preview]);

  function setStat(code: Code, delta: number) {
    const v = w.stats[code] + delta;
    if (delta > 0 && remaining <= 0) return;
    if (v < C.min) return;
    upd({ stats: { ...w.stats, [code]: v } });
  }
  function randomize() {
    const s: Record<Code, number> = { STR: C.base, DEX: C.base, VIT: C.base, INT: C.base };
    for (let i = 0; i < C.bonus_points; i++) s[CODES[Math.floor(Math.random() * CODES.length)]]++;
    upd({ stats: s });
  }

  async function confirm() {
    if (!valid(4) || !cls || !kingdom) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const c = await api.createCharacter({ name: w.name.trim(), classe_id: cls.id, stats: { ...w.stats }, regno_id: kingdom.id });
      saved = null;
      await refreshChars();
      toast("SISTEMA", [`Benvenuto in Aethermoor, ${c.name}.`], { gold: true });
      navigate(`/personaggi/${c.id}`);
    } catch (e) {
      setSubmitErr(errorText(e));
      setSubmitting(false);
    }
  }

  const foot = (
    <div className="cr-foot">
      <button type="button" className="btn ghost" disabled={w.step === 1} onClick={() => goStep(w.step - 1)}>← Indietro</button>
      {w.step === 4
        ? <button type="button" className="btn primary" disabled={!valid(4) || submitting} onClick={confirm}>{submitting ? "Registrazione…" : "[CONFERMA]"}</button>
        : <button type="button" className="btn primary" disabled={!valid(w.step)} onClick={() => goStep(w.step + 1)}>Avanti →</button>}
    </div>
  );

  const previewGrid = (
    <div className={`cr-dgrid${stale ? " stale" : ""}`} aria-busy={stale}>
      {PREVIEW_KEYS.map((k) => {
        const d = pd[k];
        return (
          <div className="kv" key={k}>
            <span className="label">{d?.label ?? k}</span>
            <span className="v">{d ? fmt(d.value, d.fmt) : "…"}</span>
            {d && <span className="xs muted mono">{d.formula}</span>}
          </div>
        );
      })}
    </div>
  );

  let body: JSX.Element;
  if (w.step === 1) {
    body = (
      <Win title="Passo 1 · Nome dell'Immortale">
        <SysMsg lines={["Connessione neurale stabilita.", "Inserisci il nome con cui gli abitanti di Aethermoor ti conosceranno."]} />
        <div className="field">
          <label className="label" htmlFor="cr-name">Nome del personaggio</label>
          <input className="input" id="cr-name" type="text" autoComplete="off" spellCheck={false} autoCapitalize="off" autoFocus
            value={w.name} placeholder="Es. Kaelen" aria-describedby="cr-name-hint cr-name-note"
            onChange={(e) => upd({ name: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (valid(1)) goStep(2); } }} />
          <span className={`hint ${"empty" in nameCheck ? "" : nameCheck.ok ? "good" : "bad"}`} id="cr-name-hint" role="status">{nameCheck.msg}</span>
          <span className="footnote" id="cr-name-note">Il nome è unico sul server e non potrà essere modificato.</span>
        </div>
        {foot}
      </Win>
    );
  } else if (w.step === 2) {
    body = (
      <Win title="Passo 2 · Classe">
        <p className="small muted">La classe determina l'abilità e l'equipaggiamento di partenza. Le statistiche si distribuiscono al passo successivo.</p>
        <div className="grid-2">
          {rules.classes.map((c) => (
            <button key={c.id} type="button" className="pick cr-pick" aria-pressed={c.id === w.classId} onClick={() => upd({ classId: c.id })}>
              <h3>{c.name}</h3>
              <div className="stack" style={{ gap: 2 }}>
                <span className="label">Abilità iniziale</span>
                <span><b>{c.skill}</b></span>
                <span className="small muted">{c.cost} · {c.skill_text} · cooldown {c.cooldown} {c.cooldown === 1 ? "turno" : "turni"}</span>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <span className="label">Equipaggiamento</span>
                <ul className="small">{c.equip.map((e, i) => <li key={i}>{e.name} <span className="muted xs">· {e.type}, {n(e.weight)} kg</span></li>)}</ul>
              </div>
            </button>
          ))}
        </div>
        {foot}
      </Win>
    );
  } else if (w.step === 3) {
    const cnt = remaining === 0 ? "ok" : remaining > C.bonus_points ? "over" : "";
    body = (
      <Win title="Passo 3 · Statistiche">
        <div className="grid-2">
          <div className="stack">
            <div className={`cr-counter ${cnt}`} aria-live="polite">Punti bonus: <b>{remaining}</b> / {C.bonus_points}</div>
            {remaining === 0
              ? <span className="hint good">Tutti i punti sono distribuiti.</span>
              : remaining > 0
                ? <span className="hint">Distribuisci ancora {remaining} {remaining === 1 ? "punto" : "punti"} per proseguire.</span>
                : <span className="hint bad">Hai speso {Math.abs(remaining)} punti di troppo.</span>}
            <p className="xs muted">Ogni statistica parte da {C.base}. Puoi scendere fino a {C.min} per ottenere punti extra, con penalità sotto {C.base}.</p>
            <div>
              {CODES.map((code) => {
                const v = w.stats[code];
                const delta = v - C.base;
                return (
                  <div className="cr-stat" key={code}>
                    <div className="stack" style={{ gap: 0 }}>
                      <span><span className="cr-code">{code}</span> <span className="small">{STAT_INFO[code].name}</span></span>
                      <span className="xs muted">{STAT_INFO[code].desc}</span>
                    </div>
                    <div className="cr-ctl">
                      <button type="button" className="btn icon" aria-label={`Diminuisci ${code}`} disabled={v <= C.min} onClick={() => setStat(code, -1)}>−</button>
                      <span className="cr-val" aria-live="polite">{v}</span>
                      <button type="button" className="btn icon" aria-label={`Aumenta ${code}`} disabled={remaining <= 0} onClick={() => setStat(code, 1)}>+</button>
                    </div>
                    <div className="cr-chips">
                      {delta !== 0 && <span className={`chip ${delta > 0 ? "good" : "muted"}`}>{delta > 0 ? "+" : "−"}{Math.abs(delta)} creazione</span>}
                      {v < C.base && <span className="chip warn">Sotto la base: penalità</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={randomize}>Distribuzione casuale</button>
              <button type="button" className="btn ghost" onClick={() => upd({ stats: { STR: C.base, DEX: C.base, VIT: C.base, INT: C.base } })}>Azzera</button>
            </div>
          </div>
          <div className="stack">
            <span className="label">Anteprima derivate</span>
            {previewGrid}
            {previewErr ? <p className="hint bad" role="alert">{previewErr}</p>
              : <p className="footnote">Valori calcolati dal server sulle statistiche di creazione.</p>}
          </div>
        </div>
        {foot}
      </Win>
    );
  } else {
    const issues: { step: number; text: string }[] = [];
    if (!valid(1)) issues.push({ step: 1, text: "Nome non valido" });
    if (!valid(2)) issues.push({ step: 2, text: "Classe non scelta" });
    if (!valid(3)) issues.push({ step: 3, text: "Punti bonus non distribuiti" });
    const line = (k: string, v: string) => <span><span className="cr-k">{k}:</span> {v}</span>;
    const res = pd.hp && pd.mp && pd.sp ? `HP ${fmt(pd.hp.value, pd.hp.fmt)} · MP ${fmt(pd.mp.value, pd.mp.fmt)} · SP ${fmt(pd.sp.value, pd.sp.fmt)}` : "…";
    body = (
      <Win title="Passo 4 · Riepilogo" gold>
        <div className="sysmsg gold cr-tele">
          <span className="tag">[SISTEMA] Registrazione Immortale</span>
          {line("Nome", w.name.trim() || "—")}
          {line("Classe", cls ? cls.name : "—")}
          {line("Statistiche", CODES.map((k) => `${k} ${w.stats[k]}`).join(" · "))}
          {line("Risorse", res)}
          {line("Abilità iniziale", cls ? `${cls.skill} (${cls.cost} · ${cls.skill_text} · cooldown ${cls.cooldown})` : "—")}
          {line("Equipaggiamento", cls ? cls.equip.map((e) => e.name).join(" · ") : "—")}
          {line("Regno di partenza", kingdom?.name ?? "—")}
        </div>
        <div className="field">
          <label className="label" htmlFor="cr-regno">Regno di partenza</label>
          <select className="input" id="cr-regno" value={w.regno} onChange={(e) => upd({ regno: e.target.value })}>
            {rules.kingdoms.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          <span className="hint">{kingdom?.text}</span>
        </div>
        <SysMsg tag="[AVVISO]" lines={["Dopo la conferma nome e statistiche non sono modificabili."]} />
        {issues.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="hint bad">Prima di confermare correggi:</span>
            <ul className="cr-issues small">{issues.map((i) => (
              <li key={i.step}><button type="button" className="cr-linkbtn" onClick={() => goStep(i.step)}>{i.text}</button></li>
            ))}</ul>
          </div>
        )}
        {submitErr && <div className="sysmsg bad" role="alert"><span className="tag">[SISTEMA]</span><span>{submitErr}</span></div>}
        {foot}
      </Win>
    );
  }

  return (
    <div className="stack anim-in" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Creazione guidata</h1>
        <p className="muted small">Il System registra un nuovo Immortale. Quattro passaggi, poi il tuo nome sarà inciso nei registri di Aethermoor.</p>
      </div>
      <ol className="cr-steps" aria-label="Passaggi della creazione">
        {STEPS.map((label, i) => {
          const k = i + 1;
          const cur = k === w.step;
          const done = !cur && k < 4 && valid(k);
          return (
            <li key={k}>
              <button type="button" className={`cr-step${done ? " done" : ""}`} aria-current={cur ? "step" : undefined}
                disabled={!cur && !canReach(k)} onClick={() => goStep(k)}>
                <span className="cr-n">{done ? "✓" : k}</span><span className="cr-sl">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {body}
    </div>
  );
}
