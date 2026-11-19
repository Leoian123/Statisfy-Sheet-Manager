import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  tabs: TabDef<K>[];
  active: K;
  onChange: (k: K) => void;
  label: string;
  children: ReactNode;
}

/** Barra di tab scorrevole (senza scrollbar visibile) con navigazione da tastiera. */
export function Tabs<K extends string>({ tabs, active, onChange, label, children }: Props<K>) {
  const base = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function focusTab(k: K) {
    onChange(k);
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${k}"]`);
      el?.focus();
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const keys = tabs.map((t) => t.key);
    let i = keys.indexOf(active);
    if (e.key === "ArrowRight") i = (i + 1) % keys.length;
    else if (e.key === "ArrowLeft") i = (i - 1 + keys.length) % keys.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = keys.length - 1;
    else return;
    e.preventDefault();
    focusTab(keys[i]);
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${base}-tab-${t.key}`}
            data-tab={t.key}
            aria-controls={`${base}-panel`}
            aria-selected={t.key === active}
            tabIndex={t.key === active ? 0 : -1}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} tabIndex={0}>
        {children}
      </div>
    </>
  );
}
