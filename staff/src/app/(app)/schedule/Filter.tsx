"use client";
// 예약표 필터 버튼: 누르면 체크 목록이 열리고, 고른 값이 버튼에 바로 보여요 (여러 개 선택)
import { useEffect, useRef, useState } from "react";

export type Opt = { v: string; l: string; sw?: string | null };

export default function Filter({ label, opts, value, onChange }: {
  label: string; opts: Opt[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const on = value.length > 0;
  const names = opts.filter((o) => value.includes(o.v)).map((o) => o.l);
  const summary = !on ? "전체" : names.length <= 2 ? names.join(", ") : `${names[0]} 외 ${names.length - 1}`;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flt" ref={ref}>
      <button className={`flt-btn ${on ? "on" : ""} ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <span className="flt-l">{label}</span>
        <b>{summary}</b>
        {on && <span className="flt-n num">{value.length}</span>}
        <i aria-hidden>▾</i>
      </button>
      {open && (
        <div className="flt-pop" role="listbox">
          <div className="flt-hd"><b>{label}</b>{on && <button onClick={() => onChange([])}>초기화</button>}</div>
          <label className="flt-it"><input type="checkbox" checked={!on} onChange={() => onChange([])} />전체</label>
          {opts.map((o) => (
            <label key={o.v} className="flt-it">
              <input type="checkbox" checked={value.includes(o.v)} onChange={() => toggle(o.v)} />
              {o.sw && <i className="lg-sw" style={{ background: o.sw }} />}{o.l}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
