import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface ToastMsg { id: number; tag: string; lines: string[]; gold?: boolean; bad?: boolean }
type Show = (tag: string, lines: string[], opts?: { gold?: boolean; bad?: boolean }) => void;

const Ctx = createContext<Show>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<Show>((tag, lines, opts) => {
    window.clearTimeout(timer.current);
    setMsg({ id: Date.now(), tag, lines, gold: opts?.gold, bad: opts?.bad });
    timer.current = window.setTimeout(() => setMsg(null), opts?.bad ? 6000 : 4000);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast" aria-live="polite">
        {msg && (
          <div key={msg.id} className={`sysmsg anim-in${msg.gold ? " gold" : ""}${msg.bad ? " bad" : ""}`} role="status">
            <span className="tag">[{msg.tag}]</span>
            {msg.lines.map((l, i) => <span key={i}>{l}</span>)}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): Show {
  return useContext(Ctx);
}
