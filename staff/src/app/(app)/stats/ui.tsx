"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, downloadCsv } from "@/lib/sales";
import { fmt, isNumCol, tableCsv, thisMonth, thisYear, type Col, type ColType, type Row } from "@/lib/stats";

/* ── 지점 (대표관리자만 고름) ── */
type Ctx = { branch: string | null; setBranch: (b: string | null) => void };
export const StatsCtx = createContext<Ctx>({ branch: null, setBranch: () => {} });
export const useStats = () => useContext(StatsCtx);

export function BranchSelect() {
  const me = useMe();
  const { branch, setBranch } = useStats();
  if (me.tier !== "owner") return <span className="st-pill">{me.branch}</span>;
  return (
    <select className="sel st-sel" aria-label="지점" value={branch ?? ""} onChange={(e) => setBranch(e.target.value || null)}>
      <option value="">전 지점</option>
      {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
}

/* ── ⓘ 설명 (눌러야 펼침) ── */
export function Info({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  return (
    <span className="st-info">
      <button type="button" className={on ? "on" : ""} aria-label="설명 보기" aria-expanded={on} onClick={() => setOn(!on)}>i</button>
      {on && <span className="st-info-pop" role="note">{text}</span>}
    </span>
  );
}

/* ── 인쇄 · 엑셀 (대표관리자 또는 export.excel 권한) ── */
export function ExportBtns({ name, cols, rows, disabled }: { name: string; cols: Col[]; rows: Row[]; disabled?: boolean }) {
  const me = useMe();
  if (!canSee(me, "export.excel")) return null;
  return (
    <div className="st-exp st-noprint">
      <button className="btn sm" disabled={disabled} onClick={() => window.print()}>인쇄</button>
      <button className="btn sm" disabled={disabled} onClick={() => { const t = tableCsv(cols, rows); downloadCsv(`${name}.csv`, t.head, t.body); }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
        엑셀 다운
      </button>
    </div>
  );
}

/* ── 막대 차트 : 진한 막대(기준) + 연한 막대(비교) 2단, 범례, 마우스 올리면 숫자 ── */
export function BarChart({ rows, x, bars, names, unit }: { rows: Row[]; x: string; bars: string[]; names: string[]; unit: ColType }) {
  const [hov, setHov] = useState<number | null>(null);
  const max = useMemo(() => Math.max(1, ...rows.flatMap((r) => bars.map((b) => Math.max(0, Number(r[b] ?? 0))))), [rows, bars]);
  const every = rows.length > 16 ? Math.ceil(rows.length / 8) : 1; // 라벨이 겹치지 않게 건너뛰기
  const u = unit === "won" ? "원" : unit === "min" ? "분" : unit === "pct" ? "%" : "건";
  return (
    <div className="st-chart" onMouseLeave={() => setHov(null)}>
      <div className="st-legend">
        {bars.length > 1 && bars.map((b, i) => <span key={b}><i className={`s${i}`} />{names[i]}</span>)}
        <em>단위 {u}</em>
      </div>
      <div className="st-plot" role="img" aria-label={`${names.join(", ")} 막대 차트`}>
        {rows.map((r, i) => (
          <div key={i} className={`st-col ${hov === i ? "hov" : ""}`} onMouseEnter={() => setHov(i)} onClick={() => setHov(hov === i ? null : i)}>
            <div className="st-bars">
              {bars.map((b, j) => {
                const v = Math.max(0, Number(r[b] ?? 0));
                return <span key={b} className={`s${j}`} style={{ height: v ? `max(3px, ${(v / max) * 100}%)` : 0 }} />;
              })}
            </div>
            <div className="st-x">{i % every === 0 ? String(r[x] ?? "") : ""}</div>
            {hov === i && (
              <div className={`st-tip ${i > rows.length / 2 ? "l" : ""}`}>
                <b>{String(r[x] ?? "")}</b>
                {bars.map((b, j) => <div key={b}><i className={`s${j}`} />{names[j]}<span>{fmt(r[b], unit)}</span></div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 표 (모바일에서는 레이아웃이 자동으로 카드 줄로 바꿔요: .sl-scroll) ── */
const BADGE: Record<string, string> = { "임박": "warn", "사용 중": "ok" };
export function DataTable({ cols, rows, total = true, totalLabel = "합계", noSum = [] }: { cols: Col[]; rows: Row[]; total?: boolean; totalLabel?: string; noSum?: string[] }) {
  const sums = useMemo(() => {
    const s: Record<string, number> = {};
    cols.forEach(([k, , t]) => { if (isNumCol(t) && !noSum.includes(k)) s[k] = rows.reduce((a, r) => a + Number(r[k] ?? 0), 0); });
    return s;
  }, [cols, rows, noSum]);
  return (
    <div className="sl-scroll st-table">
      <table className="t">
        <thead><tr>{cols.map(([k, l, t]) => <th key={k} className={t === "text" ? "" : "r"}>{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map(([k, , t]) => {
                const v = r[k];
                const neg = t !== "text" && Number(v) < 0;
                const zero = t !== "text" && !Number(v);
                return <td key={k} className={`${t === "text" ? "" : "r num"} ${neg ? "neg" : ""} ${zero ? "zero" : ""}`}>{typeof v === "string" && BADGE[v] ? <span className={`badge ${BADGE[v]}`}>{v}</span> : fmt(v, t)}</td>;
              })}
            </tr>
          ))}
        </tbody>
        {total && rows.length > 1 && (
          <tfoot>
            <tr>
              {cols.map(([k, , t], i) => (
                <td key={k} className={t === "text" ? "" : "r num"}>{i === 0 ? totalLabel : isNumCol(t) && !noSum.includes(k) ? fmt(sums[k], t) : ""}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/* ── 기간 고르기 ── */
export type Period = { from: string; to: string; label: string };
export function yearOptions() {
  const y = thisYear();
  return [y, y - 1, y - 2, y - 3];
}
export function monthOptions(n = 24) {
  const out: string[] = [];
  let [y, m] = thisMonth().split("-").map(Number);
  for (let i = 0; i < n; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); m--; if (!m) { m = 12; y--; } }
  return out;
}
export const ymLabel = (ym: string) => `${ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;

export function Empty({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="st-empty">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      <div><b>{text}</b>{sub && <span>{sub}</span>}</div>
    </div>
  );
}
