/* «Definisci evoluzione» (Master): la skill arrivata al Grado X completa il ciclo, ottiene una passiva nuova
   (testo e, se vuoi, meccanica della Forgia) e può ricevere nuove caratteristiche (meccanica della skill stessa).
   La proposta del giocatore è nei messaggi della richiesta. */
import { useEffect, useState } from "react";
import { api, errorText } from "../api/client";
import type { Mech } from "../api/mech";
import { ticketsApi, type Ticket } from "../api/tickets";
import type { ActiveSkill, Skill } from "../api/types";
import { romanN } from "../lib/format";
import { MechField } from "./mech/MechField";
import { mechSummary } from "./mech/summary";

export function EvolutionForm({ t, busy, onDone, onError }: {
  t: Ticket; busy: boolean; onDone: (t: Ticket) => void; onError: (msg: string) => void;
}) {
  const meta = t.meta!;
  const tag = romanN(10 * meta.ciclo);
  const [name, setName] = useState(`${meta.skill} ${tag}`);
  const [effect, setEffect] = useState("");
  const [pMech, setPMech] = useState<Mech | null>(null);
  const [skill, setSkill] = useState<Skill | ActiveSkill | null>(null);
  const [changeSkill, setChangeSkill] = useState(false);
  const [sMech, setSMech] = useState<Mech | null>(null);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const proposal = t.messages.filter((m) => m.role !== "master").map((m) => m.text);

  useEffect(() => {
    if (t.char_id == null) return;
    api.character(t.char_id).then((c) => {
      const list = (meta.field === "skills" ? c.skills : c.active_skills) as (Skill | ActiveSkill)[];
      const sk = list.find((x) => x.name.trim().toLowerCase() === meta.skill.toLowerCase()) ?? null;
      setSkill(sk);
      setSMech((sk?.mech as Mech | undefined) ?? null);
    }).catch((e) => onError(errorText(e)));
  }, [t.char_id, meta.field, meta.skill]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setSending(true);
    try {
      const out = await ticketsApi.evolve(t.id, {
        version: t.version, passiva_nome: name.trim(), passiva_effetto: effect.trim(), passiva_mech: pMech,
        ...(changeSkill ? (sMech ? { skill_mech: sMech } : { togli_meccanica: true }) : {}), risposta: answer.trim(),
      });
      onDone(out);
    } catch (e) { onError(errorText(e)); } finally { setSending(false); }
  }

  const cur = skill ? `Grado X · ciclo ${meta.ciclo} → riparte dal Grado I (livello ${10 * meta.ciclo + 1})` : "";
  return (
    <div className="stack rq-evo">
      <span className="label">Definisci l'evoluzione</span>
      {proposal.length > 0 ? (
        <div className="rq-decision rq-dec-violet"><b>Proposta del giocatore:</b> <span className="rq-pre">{proposal[proposal.length - 1]}</span></div>
      ) : <p className="small muted">Il giocatore non ha ancora proposto nulla: puoi aspettarlo o definire subito.</p>}
      {cur && <p className="xs muted">{meta.skill}: {cur}</p>}
      <div className="field">
        <label className="label" htmlFor={`evo-n-${t.id}`}>Nome della passiva</label>
        <input className="input" id={`evo-n-${t.id}`} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`evo-e-${t.id}`}>Effetto della passiva</label>
        <textarea className="input" id={`evo-e-${t.id}`} rows={3} maxLength={2000} value={effect}
          placeholder="Es. Ogni incantesimo con traccia di Vis lancia anche un dardo." onChange={(e) => setEffect(e.target.value)} />
      </div>
      <div className="field">
        <span className="label">Meccanica della passiva</span>
        <MechField value={pMech} onChange={setPMech} kindHint="passiva" name={name || "Passiva"} />
        <span className="hint">Facoltativa: con la meccanica la passiva agisce in combattimento (es. effetto agganciato a #Vis).</span>
      </div>
      <label className="ms-check rq-check" htmlFor={`evo-s-${t.id}`}>
        <input type="checkbox" id={`evo-s-${t.id}`} checked={changeSkill} onChange={(e) => setChangeSkill(e.target.checked)} />
        Dai nuove caratteristiche anche a «{meta.skill}»
      </label>
      {changeSkill && (
        <div className="field">
          <span className="label">Meccanica di {meta.skill}</span>
          <MechField value={sMech} onChange={setSMech}
            kindHint={(skill as ActiveSkill | null)?.kind === "Miracolo" ? "miracolo" : (skill as ActiveSkill | null)?.kind === "Incantesimo" ? "incantesimo" : meta.field === "skills" ? "passiva" : "skill"}
            name={meta.skill} />
          <span className="hint">{skill?.mech ? `Ora: ${mechSummary(skill.mech as Mech).short || "meccanica presente"}. ` : "Ora non ha meccanica. "}
            Lasciala vuota per togliere la meccanica.</span>
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor={`evo-a-${t.id}`}>Risposta al giocatore</label>
        <textarea className="input" id={`evo-a-${t.id}`} rows={2} maxLength={5000} value={answer}
          placeholder="Facoltativa: se la lasci vuota la scrive il sistema." onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || sending || !name.trim()} onClick={submit}>Definisci evoluzione</button>
        <span className="hint">Aggiunge «{name.trim() || "…"}» alle skill del PG e chiude anche la comunicazione al giocatore.</span>
      </div>
    </div>
  );
}
