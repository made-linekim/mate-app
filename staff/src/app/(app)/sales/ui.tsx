"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import {
  canSee, won, dur, when, todayKST, downloadCsv, SALES_CSV_HEAD, salesCsvRow, type Sale,
} from "@/lib/sales";

/* ── 조회기간 ─────────────────────────────────────────────── */
export type Range = { from: string; to: string };
export type Mode = "month" | "day" | "range";
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
export const monthRange = (y: number, m: number): Range => ({ from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` });
export const md = (d: string | null | undefined) => (d ? `${+d.slice(5, 7)}.${d.slice(8, 10)}` : "-");
/* 올해면 11.16, 다른 해면 25.11.16 */
export const mdy = (d: string | null | undefined) => (!d ? "-" : d.slice(0, 4) === todayKST().slice(0, 4) ? md(d) : `${d.slice(2, 4)}.${md(d)}`);

/* ── 매출 화면 공용 상태 (지점 · 조회기간 · 엑셀) : layout 이 갖고 있어요 ── */
type Exporter = (() => void | Promise<void>) | null;
type Ctx = {
  branch: string | null; setBranch: (b: string | null) => void;
  range: Range; setRange: (r: Range) => void;
  mode: Mode; setMode: (m: Mode) => void;
  setExport: (f: Exporter) => void;
};
export const SalesCtx = createContext<Ctx | null>(null);
export const useSales = () => useContext(SalesCtx)!;

export function useSalesState() {
  const me = useMe();
  const t = todayKST();
  const [branch, setBranch] = useState<string | null>(me.tier === "owner" ? null : me.branch);
  const [range, setRange] = useState<Range>(monthRange(+t.slice(0, 4), +t.slice(5, 7)));
  const [mode, setMode] = useState<Mode>("month");
  const [exporter, setExporter] = useState<Exporter>(null);
  const ctx: Ctx = useMemo(() => ({
    branch, setBranch, range, setRange, mode, setMode,
    setExport: (f: Exporter) => setExporter(() => f),
  }), [branch, range, mode]);
  return { ctx, exporter };
}

/* 화면이 헤더의 엑셀 다운 버튼에 내려받기 함수를 걸어요 */
export function useExport(fn: Exporter) {
  const { setExport } = useSales();
  const ref = useRef(fn);
  ref.current = fn;
  const has = !!fn;
  useEffect(() => {
    setExport(has ? () => ref.current?.() : null);
    return () => setExport(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [has]);
}

export function periodLabel(range: Range, mode: Mode) {
  if (mode === "month") return `${+range.from.slice(5, 7)}월 · 월별`;
  if (mode === "day") return `${md(range.from)} · 날짜별`;
  return `${md(range.from)} ~ ${md(range.to)} · 기간별`;
}

export function PeriodPicker() {
  const { range, setRange, mode, setMode } = useSales();
  const t = todayKST();
  const y = +range.from.slice(0, 4), m = +range.from.slice(5, 7);
  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => +t.slice(0, 4) - i), [t]);
  return (
    <div className="sl-row">
      <div className="seg">
        {([["month", "월별"], ["day", "날짜별"], ["range", "기간별"]] as const).map(([k, l]) => (
          <button key={k} className={mode === k ? "on" : ""} onClick={() => {
            setMode(k);
            if (k === "month") setRange(monthRange(y, m));
            if (k === "day") setRange({ from: t, to: t });
          }}>{l}</button>
        ))}
      </div>
      {mode === "month" && (
        <>
          <select className="sel" style={{ width: 110 }} value={y} onChange={(e) => setRange(monthRange(+e.target.value, m))}>
            {years.map((v) => <option key={v} value={v}>{v}년</option>)}
          </select>
          <select className="sel" style={{ width: 90 }} value={m} onChange={(e) => setRange(monthRange(y, +e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}월</option>)}
          </select>
        </>
      )}
      {mode === "day" && (
        <input type="date" className="inp" style={{ width: 160 }} value={range.from} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: e.target.value })} />
      )}
      {mode === "range" && (
        <>
          <input type="date" className="inp" style={{ width: 160 }} value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
          <span style={{ color: "var(--ink-3)" }}>~</span>
          <input type="date" className="inp" style={{ width: 160 }} value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

/* 헤더의 지점 고르기: 대표관리자만 바꿀 수 있어요 */
export function BranchSelect() {
  const me = useMe();
  const { branch, setBranch } = useSales();
  if (me.tier !== "owner") {
    return <select className="sel sl-sel-b" disabled value={me.branch}><option>{me.branch}</option></select>;
  }
  return (
    <select className="sel sl-sel-b" aria-label="지점" value={branch ?? ""} onChange={(e) => setBranch(e.target.value || null)}>
      <option value="">전 지점</option>
      {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
}

/* 헤더의 월 고르기 (조건 바꾸기에서 날짜별·기간별도 가능) */
export function MonthSelect({ disabled }: { disabled?: boolean }) {
  const { range, setRange, mode, setMode } = useSales();
  const t = todayKST();
  const months = useMemo(() => {
    const out: string[] = [];
    let y = +t.slice(0, 4), m = +t.slice(5, 7);
    for (let i = 0; i < 24; i++) { out.push(`${y}-${pad(m)}`); m--; if (!m) { m = 12; y--; } }
    return out;
  }, [t]);
  const cur = mode === "month" ? range.from.slice(0, 7) : "custom";
  return (
    <select className="sel sl-sel-m" aria-label="조회 월" disabled={disabled} value={cur} onChange={(e) => {
      const v = e.target.value;
      if (v === "custom") return;
      setMode("month");
      setRange(monthRange(+v.slice(0, 4), +v.slice(5, 7)));
    }}>
      {mode !== "month" && <option value="custom">기간 지정</option>}
      {!months.includes(cur) && mode === "month" && <option value={cur}>{cur.slice(0, 4)}년 {+cur.slice(5, 7)}월</option>}
      {months.map((v) => <option key={v} value={v}>{v.slice(0, 4)}년 {+v.slice(5, 7)}월</option>)}
    </select>
  );
}

/* 조회 조건 한 줄 + 펼치면 상세 조건 */
export function CondBar({ summary, extra, children }: { summary: string; extra?: React.ReactNode; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sl-cond">
      <div className="sl-cond-bar">
        <b>조회</b>
        <span className="sl-cond-sum">{summary}</span>
        <span className="sl-cond-act">
          {extra}
          {children && <button className="btn sm" onClick={() => setOpen(!open)}>{open ? "접기" : "조건 바꾸기"}</button>}
        </span>
      </div>
      {open && <div className="sl-cond-panel">{children}</div>}
    </div>
  );
}
export function Cond({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="frow" style={{ alignItems: "center" }}>
      <div className="sl-cond-label">{label}</div>
      <div>{children}</div>
    </div>
  );
}

/* KPI 카드 */
export function Kpi({ label, value, unit, sub, em }: { label: string; value: React.ReactNode; unit?: string; sub?: string; em?: boolean }) {
  return (
    <div className="sl-kpi">
      <div className="l">{label}</div>
      <div className={`v ${em ? "em" : ""}`}>{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/* 0 은 흐리게 */
export const Z = ({ n }: { n: number | null | undefined }) => (n ? <>{won(n)}</> : <span className="sl-z">0</span>);

/* ── 매출 원장 표 (탭 공용) ─────────────────────────────────── */
export type Col = "when" | "day" | "customer" | "staff" | "kind" | "mkind" | "acct" | "content" | "prog" | "use" | "method" | "memo" | "time"
  | "amount" | "card" | "cash" | "account" | "npay" | "unpaid" | "settled" | "discount" | "point" | "sessions" | "branch";
type Ext = { colors: Record<string, string> };
const KIND_SHORT: Record<string, string> = {
  회차회원권: "회차권", 기간회원권: "기간권", 제품판매: "제품", 기타수입: "기타 수입", "미수금 정산": "미수 정산",
};
const kindLabel = (k: string | null) => (k ? KIND_SHORT[k] ?? k : "-");
const sessionsN = (s: string | null) => (s ? (s.match(/\d+/g) ?? []).reduce((a, x) => a + Number(x), 0) : 0);
const methodOf = (s: Sale) => [s.card && "카드", s.cash && "현금", s.account && "계좌이체", s.npay && "NPay"].filter(Boolean).join(" · ") || "-";
const hm = (s: Sale) => { const w = when(s); return w.length > 10 ? `${md(w.slice(0, 10))} ${w.slice(11)}` : md(w); };

function KindBadge({ s }: { s: Sale }) {
  const k = s.kind || "-";
  if (s.is_refund) return <span className="badge em">{kindLabel(k)} 환불</span>;
  return <span className={`badge ${k === "노쇼" ? "warn" : ""}`}>{kindLabel(k)}</span>;
}
function ProgTag({ name, colors }: { name: string | null; colors: Record<string, string> }) {
  const n = name || "-";
  const key = Object.keys(colors).sort((a, b) => b.length - a.length).find((p) => n.startsWith(p));
  const c = key ? colors[key] : "#8A8A8A";
  return <span className="sl-prog" style={{ borderLeftColor: c, color: c, background: `${c}1F` }}>{n}</span>;
}
function Clip({ children, w, muted }: { children: React.ReactNode; w: number; muted?: boolean }) {
  return <span className={`sl-clip ${muted ? "mute" : ""}`} style={{ maxWidth: w }} title={typeof children === "string" ? children : undefined}>{children}</span>;
}

const COL: Record<Col, { h: string; n?: boolean; v: (s: Sale, x: Ext) => React.ReactNode; sum?: (s: Sale) => number | null; nm?: boolean }> = {
  when: { h: "매출 일시", v: (s) => hm(s) },
  day: { h: "판매일", v: (s) => md(s.day) },
  branch: { h: "지점", v: (s) => s.branch },
  customer: { h: "고객", nm: true, v: (s) => s.customer_name },
  staff: { h: "담당자", v: (s) => s.staff_name || "-" },
  kind: { h: "구분", v: (s) => <KindBadge s={s} /> },
  mkind: { h: "종류", v: (s) => <KindBadge s={s} /> },
  acct: { h: "계정", v: (s) => <KindBadge s={s} /> },
  content: { h: "내용", v: (s) => <Clip w={180}>{s.content || "-"}</Clip> },
  prog: { h: "관리", v: (s, x) => s.kind === "노쇼" ? <span className="badge warn">노쇼 · {s.content || "-"}</span> : <ProgTag name={s.content} colors={x.colors} /> },
  use: { h: "사용 방법", v: (s) => (s.sessions ? "회원권" : "단건") },
  method: { h: "수단", v: (s) => methodOf(s) },
  memo: { h: "메모", v: (s) => <Clip w={120} muted>{s.memo || ""}</Clip> },
  time: { h: "시간", v: (s) => dur(s.duration_min) },
  amount: { h: "결제 금액", n: true, v: (s) => <Z n={s.amount} />, sum: (s) => s.sum_amount },
  card: { h: "카드", n: true, v: (s) => <Z n={s.card} />, sum: (s) => s.sum_card },
  cash: { h: "현금", n: true, v: (s) => <Z n={s.cash} />, sum: (s) => s.sum_cash },
  account: { h: "계좌이체", n: true, v: (s) => <Z n={s.account} />, sum: (s) => s.sum_account },
  npay: { h: "NPay", n: true, v: (s) => <Z n={s.npay} />, sum: (s) => s.sum_npay },
  unpaid: { h: "미수 발생", n: true, v: (s) => <Z n={s.unpaid} />, sum: (s) => s.sum_unpaid },
  settled: { h: "미수 정산", n: true, v: (s) => <Z n={s.unpaid_settled} />, sum: (s) => s.sum_settled },
  discount: { h: "할인", n: true, v: (s) => <Z n={s.discount} />, sum: (s) => s.sum_discount },
  point: { h: "포인트", n: true, v: (s) => <Z n={s.point} />, sum: (s) => s.sum_point },
  sessions: { h: "회차 차감", v: (s) => s.sessions || <span className="sl-z">0</span> },
};

export type Query = {
  tab: "all" | "customer" | "membership" | "service" | "product" | "other" | "receivable";
  range: Range; branch?: string | null; staff?: string | null; q?: string | null;
  customer_key?: string | null; kinds?: string[] | null;
};
const PAGE = 100;
export const salesArgs = (q: Query, limit: number, offset: number) => ({
  p_tab: q.tab, p_from: q.range.from, p_to: q.range.to, p_branch: q.branch ?? null, p_staff: q.staff ?? null,
  p_q: q.q || null, p_customer_key: q.customer_key ?? null, p_kinds: q.kinds?.length ? q.kinds : null,
  p_limit: limit, p_offset: offset,
});
/* 조건에 맞는 매출 전부 (엑셀·고객별 묶기용, 500건씩) */
export async function fetchAllSales(query: Query, cap = 20000): Promise<{ rows: Sale[]; err: string }> {
  const all: Sale[] = [];
  for (let off = 0; off < cap; off += 500) {
    const { data, error } = await sb.rpc("sales_list", salesArgs(query, 500, off));
    if (error) return { rows: all, err: friendly(error.message) };
    all.push(...((data ?? []) as Sale[]));
    if (!data || data.length < 500) break;
  }
  return { rows: all, err: "" };
}

/* 프로그램 색 (관리 탭 태그) */
function useProgColors(branch: string | null, on: boolean) {
  const me = useMe();
  const [colors, setColors] = useState<Record<string, string>>({});
  const b = branch ?? me.branch;
  useEffect(() => {
    if (!on) return;
    sb.rpc("rsv_program_list", { p_branch: b }).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const p of (data ?? []) as { name: string; short?: string; color: string | null }[]) {
        if (!p.color) continue;
        m[p.name] = p.color;
        if (p.short) m[p.short] = p.color;
      }
      setColors(m);
    });
  }, [b, on]);
  return colors;
}

export type ColSpec = Col | [Col, string];
export function SalesTable({ query, cols, opt = [], csvName, inline }: {
  query: Query; cols: ColSpec[]; opt?: Col[]; csvName: string; inline?: boolean;
}) {
  const me = useMe();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Sale[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(query);
  const plain = cols.map((c) => (Array.isArray(c) ? c[0] : c));
  const colors = useProgColors(query.branch ?? null, plain.includes("prog"));

  useEffect(() => setPage(0), [key]);
  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("sales_list", salesArgs(query, PAGE, page * PAGE)).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Sale[]);
      setLoading(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  const head = rows[0];
  const total = head?.total ?? 0;

  async function exportCsv() {
    setBusy(true);
    const { rows: all, err } = await fetchAllSales(query);
    if (err) setErr(err);
    downloadCsv(`${csvName}_${query.range.from}_${query.range.to}.csv`, SALES_CSV_HEAD, all.map(salesCsvRow));
    setBusy(false);
  }
  useExport(!inline && total ? exportCsv : null);

  // 전 지점 보기면 지점 칸, 금액이 하나도 없는 선택 칸(NPay 등)은 숨김
  const specs = (me.tier === "owner" && !query.branch && !query.customer_key ? (["branch", ...cols] as ColSpec[]) : cols)
    .filter((c) => { const k = Array.isArray(c) ? c[0] : c; return !opt.includes(k) || (head && Number(COL[k].sum?.(head) ?? 0) !== 0); });
  const cs = specs.map((c) => (Array.isArray(c) ? { k: c[0], h: c[1] } : { k: c, h: COL[c].h }));
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const sessSum = total <= PAGE ? rows.reduce((a, s) => a + sessionsN(s.sessions), 0) : null;
  const ext: Ext = { colors };

  const sumRow = head && (
    <tr className="sum">
      {cs.map(({ k }, i) => {
        const c = COL[k];
        const v = i === 0 ? "합계" : c.sum ? won(c.sum(head)) : k === "sessions" && sessSum != null ? `${sessSum}회` : "";
        return <td key={k} className={c.n ? "r" : undefined}>{v}</td>;
      })}
    </tr>
  );

  return (
    <>
      {inline && (
        <div className="sl-row" style={{ marginTop: 16 }}>
          <span className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{loading ? "불러오는 중" : `${total.toLocaleString()}건`}</span>
          {canSee(me, "export.excel") && (
            <button className="btn sm" style={{ marginLeft: "auto" }} disabled={busy || !total} onClick={exportCsv}>{busy ? "준비 중" : "엑셀 다운"}</button>
          )}
        </div>
      )}
      {err && <p className="sl-err">{err}</p>}
      <div className="sl-card">
        <div className="sl-scroll">
          <table className="sl-t">
            <thead>
              <tr>{cs.map(({ k, h }) => <th key={k} className={COL[k].n ? "r" : undefined}>{h}</th>)}</tr>
              {sumRow}
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.dedup_key}>
                  {cs.map(({ k }) => {
                    const c = COL[k];
                    return <td key={k} className={c.n ? "r" : c.nm ? "nm" : undefined}>{c.v(s, ext)}</td>;
                  })}
                </tr>
              ))}
              {!loading && rows.length === 0 && !err && (
                <tr><td colSpan={cs.length} className="sl-empty">이 기간에 매출 기록이 없어요</td></tr>
              )}
              {loading && rows.length === 0 && <tr><td colSpan={cs.length} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
            {rows.length > 0 && <tfoot>{sumRow}</tfoot>}
          </table>
        </div>
      </div>
      {total > PAGE && <Pager page={page} pages={pages} onChange={setPage} />}
    </>
  );
}

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  const from = Math.max(0, Math.min(page - 3, pages - 7));
  const list = Array.from({ length: Math.min(7, pages) }, (_, i) => from + i);
  return (
    <div className="sl-pager num">
      <button disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="이전">‹</button>
      {list.map((p) => <button key={p} className={p === page ? "on" : ""} onClick={() => onChange(p)}>{p + 1}</button>)}
      <button disabled={page + 1 >= pages} onClick={() => onChange(page + 1)} aria-label="다음">›</button>
    </div>
  );
}

export const friendly = (m: string) =>
  /function .* does not exist|Could not find the function/i.test(m)
    ? "매출 서버 기능이 아직 준비 중이에요. (DB 적용 대기)"
    : m;

/* ── 담당자 목록 (직원 계정 이름) ───────────────────────────── */
export function useStaffNames() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    sb.from("staff_accounts").select("name,status").order("name").then(({ data }) => {
      setNames(((data ?? []) as { name: string; status: string }[]).filter((r) => r.status !== "resigned").map((r) => r.name));
    });
  }, []);
  return names;
}

/* ── 검색 조건 (조건 바꾸기 안쪽) ─────────────────────────── */
export type Filters = { staff: string | null; kind: string[]; q: string };
export function useFilters() {
  const [f, setF] = useState<Filters>({ staff: null, kind: [], q: "" });
  return [f, setF] as const;
}
export function FilterRows({ f, setF, kinds }: { f: Filters; setF: (f: Filters) => void; kinds?: { k: string; l: string; ks?: string[] }[] }) {
  const me = useMe();
  const names = useStaffNames();
  const [q, setQ] = useState(f.q);
  const seeOthers = canSee(me, "sales.others");
  return (
    <>
      <Cond label="조회기간"><PeriodPicker /></Cond>
      <BranchCond />
      <Cond label="고객 검색">
        <form className="sl-row" onSubmit={(e) => { e.preventDefault(); setF({ ...f, q: q.trim() }); }}>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="이름 또는 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm">검색</button>
          {f.q && <button type="button" className="btn t sm" onClick={() => { setQ(""); setF({ ...f, q: "" }); }}>지우기</button>}
        </form>
      </Cond>
      <Cond label="담당자">
        {seeOthers ? (
          <select className="sel" style={{ width: 160 }} value={f.staff ?? ""} onChange={(e) => setF({ ...f, staff: e.target.value || null })}>
            <option value="">전체 직원</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : <span className="badge">본인 매출만 보여요</span>}
      </Cond>
      {kinds && (
        <Cond label="구분">
          <div className="sl-row">
            <button className={`chip ${f.kind.length === 0 ? "on" : ""}`} onClick={() => setF({ ...f, kind: [] })}>전체</button>
            {kinds.map((o) => (
              <button key={o.k} className={`chip ${f.kind.includes(o.k) ? "on" : ""}`}
                onClick={() => setF({ ...f, kind: f.kind.includes(o.k) ? f.kind.filter((x) => x !== o.k) : [...f.kind, o.k] })}>{o.l}</button>
            ))}
          </div>
        </Cond>
      )}
    </>
  );
}
export function filterSummary(range: Range, mode: Mode, f: Filters, kinds?: { k: string; l: string }[]) {
  const k = f.kind.length ? f.kind.map((x) => kinds?.find((o) => o.k === x)?.l ?? x).join("·") : "전체";
  return [periodLabel(range, mode), kinds ? `구분 ${k}` : null, f.staff ? `담당 ${f.staff}` : null, `고객 ${f.q || "전체"}`].filter(Boolean).join(" · ");
}

/* ── v3 확정 시안 (U-PC-SALES-1~6): 위 한 줄 도구 + 기본 8열 원장 + 열 설정 ───────── */
/* 조회 요약 한 줄: 11.01 – 11.18 · 의정부점 · 조회됨 */
export function rangeHelp(range: Range, branch: string | null, done = true) {
  const t = todayKST();
  const to = range.to > t && range.from <= t ? t : range.to;
  const p = range.from === to ? md(range.from) : `${md(range.from)} – ${md(to)}`;
  return [p, branch ?? "전 지점", done ? "조회됨" : null].filter(Boolean).join(" · ");
}

/* 원장 위 도구 줄: 왼쪽 요약 + 조건 바꾸기, 오른쪽 버튼 */
export function SlTool({ help, cond, right, textCond }: { help: string; cond?: React.ReactNode; right?: React.ReactNode; textCond?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sl3-tool">
        {textCond && cond
          ? <button className="sl3-help sl3-helpb" title="눌러서 기간 바꾸기" aria-expanded={open} onClick={() => setOpen(!open)}>{help}</button>
          : <span className="sl3-help">{help}</span>}
        {cond && !textCond && <button className={`btn sm ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "조건 접기" : "조건 바꾸기"}</button>}
        <span className="sl3-sp" />
        {right}
      </div>
      {open && cond && <div className="sl3-cond">{cond}</div>}
    </>
  );
}

/* 지점 고르기 (조건 바꾸기 안, 대표관리자만) */
export function BranchCond() {
  const me = useMe();
  const { branch, setBranch } = useSales();
  if (me.tier !== "owner") return null;
  return (
    <Cond label="지점">
      <div className="sl-row">
        <button className={`chip ${!branch ? "on" : ""}`} onClick={() => setBranch(null)}>전 지점</button>
        {BRANCHES.map((b) => <button key={b} className={`chip ${branch === b ? "on" : ""}`} onClick={() => setBranch(b)}>{b}</button>)}
      </div>
    </Cond>
  );
}

type LK = "date" | "customer" | "content" | "amount" | "method" | "staff" | "status" | "memo"
  | "branch" | "kind" | "card" | "cash" | "account" | "npay" | "unpaid" | "settled" | "discount" | "point" | "sessions" | "time";
const DASH = <span className="sl-z">—</span>;
const method3 = (s: Sale) => [s.card && "카드", s.cash && "현금", s.account && "계좌이체", s.npay && "NPay"].filter(Boolean).join(" · ");
function Status({ s }: { s: Sale }) {
  if (s.is_refund || (s.amount ?? 0) < 0) return <span className="badge">환불</span>;
  if ((s.unpaid ?? 0) > 0) return <span className="badge warn">미수</span>;
  return <span className="badge ok">완료</span>;
}
const money = (n: number | null | undefined) => (n ? won(n) : <span className="sl-z">0</span>);
export const LCOLS: { k: LK; h: string; def?: boolean; n?: boolean; v: (s: Sale) => React.ReactNode; csv: (s: Sale) => string | number }[] = [
  { k: "date", h: "날짜", def: true, v: (s) => md(s.day), csv: (s) => s.day },
  { k: "customer", h: "고객", def: true, v: (s) => s.customer_name || DASH, csv: (s) => s.customer_name },
  { k: "content", h: "상품", def: true, v: (s) => s.content || DASH, csv: (s) => s.content ?? "" },
  { k: "amount", h: "금액", def: true, n: true, v: (s) => money(s.amount), csv: (s) => s.amount ?? 0 },
  { k: "method", h: "결제수단", def: true, v: (s) => method3(s) || DASH, csv: (s) => method3(s) },
  { k: "staff", h: "담당", def: true, v: (s) => s.staff_name || DASH, csv: (s) => s.staff_name ?? "" },
  { k: "status", h: "상태", def: true, v: (s) => <Status s={s} />, csv: (s) => (s.is_refund || (s.amount ?? 0) < 0 ? "환불" : (s.unpaid ?? 0) > 0 ? "미수" : "완료") },
  { k: "memo", h: "메모", def: true, v: (s) => (s.memo ? <span className="sl-clip" style={{ maxWidth: 200 }} title={s.memo}>{s.memo}</span> : DASH), csv: (s) => s.memo ?? "" },
  { k: "kind", h: "구분", v: (s) => kindLabel(s.kind), csv: (s) => s.kind ?? "" },
  { k: "card", h: "카드", n: true, v: (s) => money(s.card), csv: (s) => s.card ?? 0 },
  { k: "cash", h: "현금", n: true, v: (s) => money(s.cash), csv: (s) => s.cash ?? 0 },
  { k: "account", h: "계좌이체", n: true, v: (s) => money(s.account), csv: (s) => s.account ?? 0 },
  { k: "unpaid", h: "미수 발생", n: true, v: (s) => money(s.unpaid), csv: (s) => s.unpaid ?? 0 },
  { k: "settled", h: "미수 정산", n: true, v: (s) => money(s.unpaid_settled), csv: (s) => s.unpaid_settled ?? 0 },
  { k: "npay", h: "NPay", n: true, v: (s) => money(s.npay), csv: (s) => s.npay ?? 0 },
  { k: "discount", h: "할인", n: true, v: (s) => money(s.discount), csv: (s) => s.discount ?? 0 },
  { k: "point", h: "포인트", n: true, v: (s) => money(s.point), csv: (s) => s.point ?? 0 },
  { k: "sessions", h: "회차 차감", v: (s) => s.sessions || DASH, csv: (s) => s.sessions ?? "" },
  { k: "time", h: "시간", v: (s) => dur(s.duration_min), csv: (s) => dur(s.duration_min) },
  { k: "branch", h: "지점", v: (s) => s.branch, csv: (s) => s.branch },
];
const DEF_COLS = LCOLS.filter((c) => c.def).map((c) => c.k);

/* 열 설정은 사람마다 저장 (이 기기 · 계정별) */
function useCols() {
  const me = useMe();
  const key = `sales:cols:${me.id}`;
  const [cols, setCols] = useState<LK[]>(DEF_COLS);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(key) || "null"); if (Array.isArray(v) && v.length) setCols(v.filter((k) => LCOLS.some((c) => c.k === k))); } catch {}
  }, [key]);
  const save = (v: LK[]) => { setCols(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
  return [cols, save] as const;
}

export function ColDrawer({ cols, onSave, onClose }: { cols: LK[]; onSave: (v: LK[]) => void; onClose: () => void }) {
  const [v, setV] = useState<LK[]>(cols);
  const order = (x: LK[]) => LCOLS.map((c) => c.k).filter((k) => x.includes(k));
  return (
    <>
      <div className="dim" style={{ zIndex: 60 }} onClick={onClose} />
      <div className="drawer sl3-cols" role="dialog" aria-label="열 설정">
        <div className="sl3-dh"><b>열 설정</b><button className="btn sm" onClick={onClose}>닫기</button></div>
        <div className="sl3-db">
          <div className="sl3-info"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>열 설정은 사람마다 저장돼요. 다른 사람 화면은 바뀌지 않아요.</div>
          {LCOLS.map((c) => (
            <label key={c.k} className="sl3-ck">
              <input type="checkbox" checked={v.includes(c.k)} onChange={() => setV(v.includes(c.k) ? v.filter((x) => x !== c.k) : order([...v, c.k]))} />
              {c.h}{c.def && <small>기본</small>}
            </label>
          ))}
        </div>
        <div className="sl3-pv">
          <span>미리보기</span>
          <div>{order(v).map((k) => <em key={k}>{LCOLS.find((c) => c.k === k)!.h}</em>)}</div>
        </div>
        <div className="sl3-df">
          <button className="btn" onClick={() => setV(DEF_COLS)}>기본값으로</button>
          <button className="btn p" disabled={!v.length} onClick={() => { onSave(order(v)); onClose(); }}>저장</button>
        </div>
      </div>
    </>
  );
}

function ExcelBtn({ onClick, busy, disabled }: { onClick: () => void; busy?: boolean; disabled?: boolean }) {
  const me = useMe();
  if (!canSee(me, "export.excel")) return null;
  return <button className="btn sm" disabled={busy || disabled} onClick={onClick}>{busy ? "준비 중" : "엑셀 다운"}</button>;
}
export { ExcelBtn };

/* ── 전체·회원권·관리·제품·기타 탭 공용 화면 ─────────────────── */
export function LedgerScreen({ tab, kinds, csvName }: {
  tab: Query["tab"]; kinds?: { k: string; l: string; ks?: string[] }[]; csvName: string;
}) {
  const { range, branch } = useSales();
  const [f, setF] = useFilters();
  const [cols, setCols] = useCols();
  const [edit, setEdit] = useState(false);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Sale[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const query: Query = {
    tab, range, branch, staff: f.staff, q: f.q,
    kinds: f.kind.length ? f.kind.flatMap((x) => kinds?.find((o) => o.k === x)?.ks ?? [x]) : null,
  };
  const key = JSON.stringify(query);
  useEffect(() => setPage(0), [key]);
  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("sales_list", salesArgs(query, PAGE, page * PAGE)).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Sale[]);
      setLoading(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);
  const total = rows[0]?.total ?? 0;
  const cs = cols.map((k) => LCOLS.find((c) => c.k === k)!).filter(Boolean);

  async function exportCsv() {
    setBusy(true);
    const { rows: all, err } = await fetchAllSales(query);
    if (err) setErr(err);
    downloadCsv(`${csvName}_${range.from}_${range.to}.csv`, cs.map((c) => c.h), all.map((s) => cs.map((c) => c.csv(s))));
    setBusy(false);
  }

  return (
    <div className="sl3-led">
      <SlTool help={rangeHelp(range, branch, !loading)}
        cond={<><FilterRows f={f} setF={setF} kinds={kinds} /></>}
        right={<><button className="btn sm" onClick={() => setEdit(true)}>열 설정</button><ExcelBtn onClick={exportCsv} busy={busy} disabled={!total} /></>} />
      {err && <p className="sl-err">{err}</p>}
      <div className="sl3-card">
        <div className="sl-scroll">
          <table className="sl3-t">
            <thead><tr>{cs.map((c) => <th key={c.k} className={c.n ? "r" : undefined}>{c.h}</th>)}</tr></thead>
            <tbody>
              {rows.map((s) => <tr key={s.dedup_key}>{cs.map((c) => <td key={c.k} className={c.n ? "r" : undefined}>{c.v(s)}</td>)}</tr>)}
              {!loading && rows.length === 0 && !err && <tr><td colSpan={cs.length} className="sl-empty">이 기간에 매출 기록이 없어요</td></tr>}
              {loading && rows.length === 0 && <tr><td colSpan={cs.length} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {total > PAGE && <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE))} onChange={setPage} />}
      {edit && <ColDrawer cols={cols} onSave={setCols} onClose={() => setEdit(false)} />}
    </div>
  );
}

/* 확인 창 (돈이 나가거나 되돌릴 수 없는 일만, v3 C 원칙) */
export function Confirm({ title, lines, ok, onOk, onClose, busy }: { title: string; lines: React.ReactNode[]; ok: string; onOk: () => void; onClose: () => void; busy?: boolean }) {
  return (
    <>
      <div className="dim" style={{ zIndex: 60 }} onClick={onClose} />
      <div className="sl3-modal" role="dialog" aria-label={title}>
        <b>{title}</b>
        {lines.map((l, i) => <p key={i}>{l}</p>)}
        <div className="sl3-mf"><button className="btn" onClick={onClose}>닫기</button><button className="btn p" disabled={busy} onClick={onOk}>{ok}</button></div>
      </div>
    </>
  );
}

export { BRANCHES };
