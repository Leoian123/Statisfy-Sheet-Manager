/* Vassoio del d100 (porting di mockup/screens/plancia.js): due d10 SVG, decine (oro, 00–90) e unità (viola, 0–9),
   che rotolano con fisica 2.5D: rimbalzi sulle sponde, urto tra i dadi, facce che cambiano mentre girano,
   assestamento finale e suono WebAudio disattivabile. Si lancia col pulsante o trascinando e lasciando andare.
   Il risultato NON si decide qui: lo genera il server e il vassoio anima i dadi fino a quei valori (`throwTo`).
   La fisica è quella del mockup, a passi fissi che recuperano il tempo reale; `tick` usa rAF più un timer di
   riserva (in un pannello nascosto rAF può non arrivare). Con prefers-reduced-motion il tiro è breve.
   Posizioni e facce si scrivono direttamente sul DOM (non nello stato React), così un nuovo render non le rimette al centro. */
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";

const DIE = 64; // lato del dado in px
const REDUCED = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const SOUND_KEY = "statisfy-dice-sound";
const FAST_KEY = "statisfy-fast-roll";

/** `instant`: Tiro veloce, i dadi mostrano subito le facce uscite senza animazione. */
export interface ThrowOpts { x?: number; y?: number; vx?: number; vy?: number; instant?: boolean }
export interface DiceTrayHandle {
  /** Anima i dadi fino a decine/unità date (dal server); si risolve quando si fermano. */
  throwTo: (tens: number, units: number, opts?: ThrowOpts) => Promise<void>;
  isRolling: () => boolean;
}

type Kind = "tens" | "units";
interface DieState {
  el: HTMLSpanElement; sh: HTMLSpanElement; kind: Kind; num: SVGTextElement; ul: SVGLineElement;
  final: number; val: number;
  x: number; y: number; z: number; vx: number; vy: number; vz: number; a: number; va: number; swap: number;
}

/** Etichetta di una faccia: decine 00–90, unità 0–9. */
export const faceLabel = (kind: Kind, v: number) => (kind === "tens" ? (v === 0 ? "00" : `${v}0`) : String(v));

/** Casuale solo per le facce che girano durante l'animazione (il risultato vero arriva dal server). */
function rand10(): number {
  const a = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(a); if (a[0] < 4294967290) return a[0] % 10; }
}

function setFace(d: Pick<DieState, "kind" | "num" | "ul"> & { val?: number }, v: number) {
  d.val = v;
  d.num.textContent = faceLabel(d.kind, v);
  d.ul.style.display = d.kind === "units" && (v === 6 || v === 9) ? "" : "none";
}

function place(d: Pick<DieState, "el" | "sh">, x: number, y: number, z: number, a: number) {
  const s = 1 + z * 0.0028;
  d.el.style.transform = `translate(${x - DIE / 2}px, ${y - DIE / 2 - z * 0.55}px) rotate(${a}deg) scale(${s})`;
  d.sh.style.transform = `translate(${x - DIE / 2 + z * 0.25}px, ${y - DIE / 2 + 6 + z * 0.1}px) scale(${1 + z * 0.004})`;
  d.sh.style.opacity = String(Math.max(0.15, 0.55 - z * 0.004));
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/* rAF e, come riserva, un timer: parte il primo che arriva (in un pannello nascosto rAF può non arrivare mai) */
function tick(f: (t: number) => void) {
  let done = false;
  const go = (t?: number) => { if (done) return; done = true; f(typeof t === "number" ? t : performance.now()); };
  requestAnimationFrame(go);
  setTimeout(() => go(performance.now()), 34);
}

/* ---------- Suono: "clack" sintetizzato con WebAudio, disattivabile ---------- */
let sound = (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })();
let audio: AudioContext | null = null;
const soundListeners = new Set<(on: boolean) => void>();

function clack(power: number) {
  if (!sound) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = audio || new AC();
    const t = audio.currentTime;
    const len = 0.05;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 4);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800 + Math.random() * 1400;
    bp.Q.value = 3;
    const g = audio.createGain();
    g.gain.value = Math.min(0.5, 0.05 + power * 0.45);
    src.connect(bp).connect(g).connect(audio.destination);
    src.start(t);
  } catch { /* audio non disponibile: si tira in silenzio */ }
}

/** Suono dei dadi sì/no, condiviso da tutti i vassoi e ricordato nel browser. */
export function useDiceSound(): [boolean, () => void] {
  const [on, setOn] = useState(sound);
  useEffect(() => {
    soundListeners.add(setOn);
    return () => { soundListeners.delete(setOn); };
  }, []);
  const toggle = useCallback(() => {
    sound = !sound;
    try { localStorage.setItem(SOUND_KEY, sound ? "on" : "off"); } catch { /* facoltativo */ }
    soundListeners.forEach((fn) => fn(sound));
  }, []);
  return [on, toggle];
}

/* ---------- Tiro veloce: risultato subito, senza animazione (preferenza del browser) ---------- */
let fast = (() => { try { return localStorage.getItem(FAST_KEY) === "on"; } catch { return false; } })();
const fastListeners = new Set<(on: boolean) => void>();

/** Tiro veloce sì/no, condiviso da tutti i vassoi e ricordato nel browser. */
export function useFastRoll(): [boolean, () => void] {
  const [on, setOn] = useState(fast);
  useEffect(() => {
    fastListeners.add(setOn);
    return () => { fastListeners.delete(setOn); };
  }, []);
  const toggle = useCallback(() => {
    fast = !fast;
    try { localStorage.setItem(FAST_KEY, fast ? "on" : "off"); } catch { /* facoltativo */ }
    fastListeners.forEach((fn) => fn(fast));
  }, []);
  return [on, toggle];
}

/* ---------- Un dado SVG ---------- */
function DieSvg({ gid }: { gid: string }) {
  return (
    <svg viewBox="0 0 100 100" width={DIE} height={DIE} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={gid} cx="38%" cy="30%" r="80%">
          <stop offset="0" className="dt-g1" /><stop offset="1" className="dt-g2" />
        </radialGradient>
      </defs>
      <polygon className="dt-side" points="50,2 96,38 82,80 50,98 18,80 4,38" />
      <polygon className="dt-facet" points="50,2 96,38 80,42" />
      <polygon className="dt-facet" points="50,2 4,38 20,42" />
      <polygon className="dt-facet dt-facet-d" points="80,42 96,38 82,80 50,86" />
      <polygon className="dt-facet dt-facet-d" points="20,42 4,38 18,80 50,86" />
      <polygon className="dt-face" fill={`url(#${gid})`} points="50,8 80,42 50,86 20,42" />
      <text className="dt-num" x="50" y="56" textAnchor="middle" />
      <line className="dt-ul" x1="40" y1="64" x2="60" y2="64" />
    </svg>
  );
}

interface Props {
  /** Il trascinamento è stato abbastanza veloce da lanciare: chi usa il vassoio chiede il tiro al server. */
  onFling: (opts: ThrowOpts) => void;
  /** Mostra il suggerimento "Trascina e lascia andare". */
  hint?: boolean;
  /** Niente lancio a trascinamento (es. richiesta in corso). */
  disabled?: boolean;
}

export const DiceTray = forwardRef<DiceTrayHandle, Props>(function DiceTray({ onFling, hint = true, disabled = false }, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const trayRef = useRef<HTMLDivElement>(null);
  const dieRefs = useRef<(HTMLSpanElement | null)[]>([null, null]);
  const shRefs = useRef<(HTMLSpanElement | null)[]>([null, null]);
  const rolling = useRef(false);
  const [isRolling, setIsRolling] = useState(false);
  const [aiming, setAiming] = useState(false);
  const drag = useRef<{ pts: { x: number; y: number; t: number }[]; id: number } | null>(null);

  const parts = useCallback((i: number) => {
    const el = dieRefs.current[i]!;
    return { el, sh: shRefs.current[i]!, kind: (i ? "units" : "tens") as Kind,
      num: el.querySelector<SVGTextElement>(".dt-num")!, ul: el.querySelector<SVGLineElement>(".dt-ul")! };
  }, []);

  // Posizione iniziale: i due dadi al centro, su 00 e 0
  useLayoutEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;
    const W = tray.clientWidth || 320, H = tray.clientHeight || 220;
    [0, 1].forEach((i) => {
      const d = parts(i);
      setFace(d, 0);
      place(d, W / 2 + (i ? 46 : -46), H / 2, 0, i ? 8 : -10);
    });
    // Il vassoio cambia larghezza (rotazione del telefono, sezione nascosta e poi mostrata): da fermi i dadi tornano
    // al centro con la faccia che hanno, così non restano fuori dal bordo.
    if (typeof ResizeObserver !== "function") return;
    let w0 = W, h0 = H;
    const ro = new ResizeObserver(() => {
      const w = tray.clientWidth, h = tray.clientHeight;
      if (!w || !h || (w === w0 && h === h0) || rolling.current) return;
      w0 = w; h0 = h;
      [0, 1].forEach((i) => place(parts(i), w / 2 + (i ? 46 : -46), h / 2, 0, i ? 8 : -10));
    });
    ro.observe(tray);
    return () => ro.disconnect();
  }, [parts]);

  const throwTo = useCallback((tens: number, units: number, opts: ThrowOpts = {}) => new Promise<void>((resolve) => {
    const tray = trayRef.current;
    if (!tray || rolling.current) { resolve(); return; }
    const finals = [tens, units];
    const dice: DieState[] = [0, 1].map((i) => ({ ...parts(i), final: finals[i], val: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, va: 0, swap: 0 }));
    const W = tray.clientWidth, H = tray.clientHeight, r = DIE / 2;
    rolling.current = true;
    setIsRolling(true);
    const finish = () => {
      for (const d of dice) {
        setFace(d, d.final);
        d.el.classList.remove("dt-land");
        void d.el.offsetWidth; // riavvia l'animazione di atterraggio
        d.el.classList.add("dt-land");
      }
      rolling.current = false;
      setIsRolling(false);
      resolve();
    };
    if (opts.instant || REDUCED()) {
      dice.forEach((d, i) => { place(d, W / 2 + (i ? 44 : -44), H / 2, 0, i ? 6 : -8); setFace(d, d.final); });
      if (opts.instant) finish(); else setTimeout(finish, 250);
      return;
    }
    const sx = opts.x ?? 40, sy = opts.y ?? H - 40;
    dice.forEach((d, i) => {
      d.x = Math.max(r, Math.min(W - r, sx + (i ? 26 : -6)));
      d.y = Math.max(r, Math.min(H - r, sy + (i ? -14 : 12)));
      d.z = 60 + Math.random() * 30;
      d.vx = (opts.vx ?? 520 + Math.random() * 260) * (0.85 + Math.random() * 0.3);
      d.vy = (opts.vy ?? -(160 + Math.random() * 220)) * (0.85 + Math.random() * 0.3);
      d.vz = 180 + Math.random() * 160;
      d.a = Math.random() * 360;
      d.va = (Math.random() < 0.5 ? -1 : 1) * (900 + Math.random() * 900);
      d.swap = 0;
      d.el.classList.remove("dt-land");
      setFace(d, rand10());
    });
    let last = performance.now(), elapsed = 0, settling = 0, moving = true;
    /* Fisica a passi fissi di 1/120 s recuperando il tempo reale: il tiro dura uguale anche se i fotogrammi sono pochi */
    const phys = (dt: number) => {
      moving = false;
      for (const d of dice) {
        d.vz -= 1500 * dt;
        d.z += d.vz * dt;
        if (d.z <= 0) {
          d.z = 0;
          if (Math.abs(d.vz) > 60) { clack(Math.min(1, Math.abs(d.vz) / 500)); d.va *= 0.75; d.vx *= 0.82; d.vy *= 0.82; }
          d.vz = Math.abs(d.vz) > 60 ? -d.vz * 0.42 : 0;
        }
        const grounded = d.z === 0 && d.vz === 0;
        if (grounded) { d.vx *= 0.955; d.vy *= 0.955; d.va *= 0.93; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < r) { d.x = r; d.vx = Math.abs(d.vx) * 0.6; clack(Math.min(1, Math.abs(d.vx) / 600)); }
        if (d.x > W - r) { d.x = W - r; d.vx = -Math.abs(d.vx) * 0.6; clack(Math.min(1, Math.abs(d.vx) / 600)); }
        if (d.y < r) { d.y = r; d.vy = Math.abs(d.vy) * 0.6; clack(Math.min(1, Math.abs(d.vy) / 600)); }
        if (d.y > H - r) { d.y = H - r; d.vy = -Math.abs(d.vy) * 0.6; clack(Math.min(1, Math.abs(d.vy) / 600)); }
        d.a += d.va * dt;
        d.swap += Math.abs(d.va) * dt + Math.hypot(d.vx, d.vy) * dt * 0.4;
        if (d.swap > 70) { d.swap = 0; setFace(d, rand10()); }
        if (Math.hypot(d.vx, d.vy) > 12 || Math.abs(d.va) > 40 || d.z > 0) moving = true;
      }
      // urto tra i due dadi
      const [p, q] = dice;
      const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < DIE * 0.9 && p.z < 20 && q.z < 20) {
        const nx = dx / dist, ny = dy / dist, push = (DIE * 0.9 - dist) / 2;
        p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
        const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if (rel > 0) {
          p.vx -= rel * nx; p.vy -= rel * ny; q.vx += rel * nx; q.vy += rel * ny;
          p.va += (Math.random() - 0.5) * 600; q.va += (Math.random() - 0.5) * 600;
          clack(Math.min(1, rel / 500));
        }
      }
    };
    const step = (now: number) => {
      let left = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!settling) {
        while (left > 0) { const dt = Math.min(1 / 120, left); phys(dt); elapsed += dt; left -= dt; }
        for (const d of dice) place(d, d.x, d.y, d.z, d.a);
      }
      if ((!moving || elapsed > 3.4) && !settling) settling = now;
      if (settling) {
        // gli ultimi 260 ms: il dado si raddrizza e mostra la faccia uscita
        const k = Math.min(1, (now - settling) / 260);
        for (const d of dice) {
          if (k > 0.3 && d.val !== d.final) setFace(d, d.final);
          const target = Math.round(d.a / 360) * 360 + (d.kind === "tens" ? -8 : 6);
          place(d, d.x, d.y, 0, d.a + (target - d.a) * easeOut(k));
          if (k === 1) d.a = target;
        }
        if (k === 1) { finish(); return; }
      }
      tick(step);
    };
    tick(step);
  }), [parts]);

  useImperativeHandle(ref, () => ({ throwTo, isRolling: () => rolling.current }), [throwTo]);

  /* Lancio trascinando: la velocità del gesto diventa la velocità dei dadi */
  const local = (e: RPointerEvent) => {
    const b = trayRef.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() };
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (rolling.current || disabled || e.button !== 0) return;
    drag.current = { pts: [local(e)], id: e.pointerId };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* puntatore già rilasciato */ }
    setAiming(true);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.id) return;
    dr.pts.push(local(e));
    if (dr.pts.length > 12) dr.pts.shift();
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.id) return;
    setAiming(false);
    drag.current = null;
    const pts = dr.pts;
    const now = performance.now();
    const a = pts.find((p) => now - p.t < 120) || pts[0], z = pts[pts.length - 1];
    const dt = Math.max(0.016, (z.t - a.t) / 1000);
    const vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
    const sp = Math.hypot(vx, vy);
    if (sp < 250) return; // un clic o un trascinamento lento non lancia
    const k = Math.min(1, 1600 / sp);
    onFling({ x: z.x, y: z.y, vx: vx * k, vy: vy * k });
  };
  const onCancel = () => { drag.current = null; setAiming(false); };

  return (
    <div
      ref={trayRef}
      className={`dt-tray${isRolling ? " is-rolling" : ""}${aiming ? " is-aiming" : ""}`}
      role="img"
      aria-label="Vassoio dei dadi: d100 con un dado delle decine e uno delle unità"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
    >
      <div className="dt-felt" aria-hidden="true" />
      <span className="dt-shadow" ref={(el) => { shRefs.current[0] = el; }} />
      <span className="dt-shadow" ref={(el) => { shRefs.current[1] = el; }} />
      <span className="dt-die dt-tens" ref={(el) => { dieRefs.current[0] = el; }}><DieSvg gid={`${uid}-tens`} /></span>
      <span className="dt-die dt-units" ref={(el) => { dieRefs.current[1] = el; }}><DieSvg gid={`${uid}-units`} /></span>
      {hint && <span className="dt-hint xs">Trascina e lascia andare per lanciare, oppure usa il pulsante</span>}
    </div>
  );
});
