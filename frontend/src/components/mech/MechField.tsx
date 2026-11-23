// Campo «Meccanica» dell'editor della scheda (Master): riepilogo compatto e pop-up con l'editor completo.
// Il vocabolario arriva da /forge/meta, caricato solo quando si apre l'editor.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { errorText } from "../../api/client";
import { forgeApi } from "../../api/forge";
import type { Mech, MechVocabulary } from "../../api/mech";
import { MechEditor, type MechKindHint } from "./MechEditor";
import { mechSummary } from "./summary";

let vocabP: Promise<{ vocab: MechVocabulary | null; stats: string[] }> | null = null;
function loadVocab() {
  vocabP ??= forgeApi.meta().then((m) => ({ vocab: m.mech ?? null, stats: m.stat_codes ?? [] }));
  vocabP.catch(() => { vocabP = null; });
  return vocabP;
}

export function MechField({ value, onChange, kindHint, name }: {
  value: Mech | null | undefined; onChange: (m: Mech | null) => void; kindHint: MechKindHint; name: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Mech | null>(value ?? null);
  const [voc, setVoc] = useState<{ vocab: MechVocabulary | null; stats: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const sum = mechSummary(value);

  useEffect(() => {
    if (!open) return;
    const d = ref.current;
    if (d && !d.open) d.showModal();
    if (!voc) loadVocab().then(setVoc).catch((e) => setErr(errorText(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { setDraft(value ? JSON.parse(JSON.stringify(value)) as Mech : null); setErr(null); setOpen(true); };
  const close = () => { ref.current?.close(); setOpen(false); };

  return (
    <span className="mc-field">
      <span className="mc-fsum small" title={sum.lines.join("\n") || undefined}>
        {value ? <><span className="chip violet">meccanica</span> {sum.short}</> : <span className="muted">Solo testo</span>}
      </span>
      <button type="button" className="btn ghost mc-fbtn" onClick={start}>{value ? "Modifica" : "Aggiungi"}</button>
      {open && createPortal(
        <dialog ref={ref} className="mc-dlg" aria-label={`Meccanica di ${name || "abilità"}`}
          onCancel={(e) => { e.preventDefault(); close(); }}>
          <div className="mc-dlgh">
            <h3 className="mc-dlgt">Meccanica · {name || "(senza nome)"}</h3>
            <button type="button" className="btn icon ghost" aria-label="Chiudi senza applicare" onClick={close}>✕</button>
          </div>
          <div className="mc-dlgb">
            {err ? <p className="hint bad" role="alert">Vocabolario non disponibile: {err}</p>
              : !voc ? <p className="small muted">Caricamento…</p>
                : !voc.vocab ? <p className="small muted">La meccanica strutturata non è disponibile in questa modalità.</p>
                  : <MechEditor value={draft} onChange={setDraft} vocab={voc.vocab} kindHint={kindHint} statKeys={voc.stats} />}
          </div>
          <div className="row mc-dlgf">
            <span className="xs muted">Il server verifica la meccanica al salvataggio della sezione.</span>
            <button type="button" className="btn" onClick={close}>Annulla</button>
            <button type="button" className="btn primary" disabled={!voc?.vocab}
              onClick={() => { onChange(draft); close(); }}>Applica</button>
          </div>
        </dialog>,
        document.body,
      )}
    </span>
  );
}
