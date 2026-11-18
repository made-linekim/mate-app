"use client";
import { useEffect, useMemo, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import {
  canSee, won, dur, when, todayKST, downloadCsv, SALES_CSV_HEAD, salesCsvRow, type Sale,
} from "@/lib/sales";

/* ── 조회기간: 월별 · 날짜별 · 기간별 ─────────────────────────── */
export type Range = { from: string; to: string };
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");
export const monthRange = (y: number, m: number): Range => ({ from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` });

export function PeriodPicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const t = todayKST();
  const [mode, setMode] = useState<"month" | "day" | "range">("month");
  const [y, setY] = useState(+t.slice(0, 4));
  const [m, setM] = useState(+t.slice(5, 7));
  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => +t.slice(0, 4) - i), [t]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div className="seg">
        {([["month", "월별"], ["day", "날짜별"], ["range", "기간별"]] as const).map(([k, l]) => (
          <button key={k} className={mode === k ? "on" : ""} onClick={() => {
            setMode(k);
            if (k === "month") onChange(monthRange(y, m));
            if (k === "day") onChange({ from: t, to: t });
          }}>{l}</button>
        ))}
      </div>
      {mode === "month" && (
        <>
          <select className="sel" style={{ width: 110 }} value={y} onChange={(e) => { setY(+e.target.value); onChange(monthRange(+e.target.value, m)); }}>
            {years.map((v) => <option key={v} value={v}>{v}년</option>)}
          </select>
          <select className="sel" style={{ width: 90 }} value={m} onChange={(e) => { setM(+e.target.value); onChange(monthRange(y, +e.target.value)); }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => <option key={v} value={v}>{v}월</option>)}
          </select>
        </>
      )}
      {mode === "day" && (
        <input type="date" className="inp" style={{ width: 160 }} value={value.from} onChange={(e) => e.target.value && onChange({ from: e.target.value, to: e.target.value })} />
      )}
      {mode === "range" && (
        <>
          <input type="date" className="inp" style={{ width: 160 }} value={value.from} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span style={{ color: "var(--ink-3)" }}>~</span>
          <input type="date" className="inp" style={{ width: 160 }} value={value.to} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function BranchSeg({ value, onChange }: { value: string | null; onChange: (b: string | null) => void }) {
  const me = useMe();
  if (me.tier !== "owner") return null;
  return (
    <div className="seg">
      {[null, ...BRANCHES].map((b) => (
        <button key={b ?? "all"} className={value === b ? "on" : ""} onClick={() => onChange(b)}>{b ?? "전 지점"}</button>
      ))}
    </div>
  );
}

/* 검색 조건 한 줄 (뷰티사랑넷 조회 조건 표 구조) */
export function Cond({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="frow" style={{ alignItems: "center", padding: "12px 0" }}>
      <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-2)" }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

/* ── 매출 원장 표 (탭 공용) ─────────────────────────────────── */
export type Col = "when" | "customer" | "staff" | "kind" | "content" | "memo" | "time" | "amount" | "card" | "cash" | "account"
  | "npay" | "unpaid" | "settled" | "discount" | "point" | "sessions" | "branch";
const COL: Record<Col, { h: string; n?: boolean; v: (s: Sale) => React.ReactNode; sum?: (s: Sale) => React.ReactNode }> = {
  when: { h: "매출일시", v: (s) => <span className="num">{when(s)}</span> },
  branch: { h: "지점", v: (s) => s.branch },
  customer: { h: "고객명", v: (s) => <span style={{ fontWeight: 600 }}>{s.customer_name}</span> },
  staff: { h: "담당자", v: (s) => s.staff_name || "-" },
  kind: { h: "구분", v: (s) => <KindBadge s={s} /> },
  content: { h: "내용", v: (s) => <Clip w={240}>{s.content || "-"}</Clip> },
  memo: { h: "메모", v: (s) => <Clip w={200} muted>{s.memo || "-"}</Clip> },
  time: { h: "시간", v: (s) => dur(s.duration_min), sum: (s) => dur(s.sum_minutes) },
  amount: { h: "결제금액", n: true, v: (s) => <b>{won(s.amount)}</b>, sum: (s) => <b>{won(s.sum_amount)}</b> },
  card: { h: "카드", n: true, v: (s) => won(s.card), sum: (s) => won(s.sum_card) },
  cash: { h: "현금", n: true, v: (s) => won(s.cash), sum: (s) => won(s.sum_cash) },
  account: { h: "계좌", n: true, v: (s) => won(s.account), sum: (s) => won(s.sum_account) },
  npay: { h: "NPay", n: true, v: (s) => won(s.npay), sum: (s) => won(s.sum_npay) },
  unpaid: { h: "미수발생", n: true, v: (s) => won(s.unpaid), sum: (s) => won(s.sum_unpaid) },
  settled: { h: "미수정산", n: true, v: (s) => won(s.unpaid_settled), sum: (s) => won(s.sum_settled) },
  discount: { h: "할인", n: true, v: (s) => won(s.discount), sum: (s) => won(s.sum_discount) },
  point: { h: "포인트", n: true, v: (s) => won(s.point), sum: (s) => won(s.sum_point) },
  sessions: { h: "회차 차감", v: (s) => <Clip w={180}>{s.sessions || "-"}</Clip> },
};

function KindBadge({ s }: { s: Sale }) {
  const k = s.kind || "-";
  const cls = s.is_refund ? "em" : k === "노쇼" ? "warn" : k.includes("회원권") ? "ok" : "";
  return <span className={`badge ${cls}`}>{s.is_refund ? `${k} 환불` : k}</span>;
}
function Clip({ children, w, muted }: { children: React.ReactNode; w: number; muted?: boolean }) {
  return (
    <div title={typeof children === "string" ? children : undefined}
      style={{ maxWidth: w, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: muted ? "var(--ink-3)" : undefined }}>
      {children}
    </div>
  );
}

export type Query = {
  tab: "all" | "customer" | "membership" | "service" | "product" | "other" | "receivable";
  range: Range; branch?: string | null; staff?: string | null; q?: string | null;
  customer_key?: string | null; kinds?: string[] | null;
};
const PAGE = 100;
const args = (q: Query, limit: number, offset: number) => ({
  p_tab: q.tab, p_from: q.range.from, p_to: q.range.to, p_branch: q.branch ?? null, p_staff: q.staff ?? null,
  p_q: q.q || null, p_customer_key: q.customer_key ?? null, p_kinds: q.kinds?.length ? q.kinds : null,
  p_limit: limit, p_offset: offset,
});

export function SalesTable({ query, cols, csvName }: { query: Query; cols: Col[]; csvName: string }) {
  const me = useMe();
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Sale[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(query);

  useEffect(() => setPage(0), [key]);
  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("sales_list", args(query, PAGE, page * PAGE)).then(({ data, error }) => {
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
  const cs = me.tier === "owner" ? (["branch", ...cols] as Col[]) : cols;

  async function exportCsv() {
    setBusy(true);
    const all: Sale[] = [];
    for (let off = 0; ; off += 500) {
      const { data, error } = await sb.rpc("sales_list", args(query, 500, off));
      if (error) { setErr(friendly(error.message)); break; }
      all.push(...((data ?? []) as Sale[]));
      if (!data || data.length < 500) break;
    }
    downloadCsv(`${csvName}_${query.range.from}_${query.range.to}.csv`, SALES_CSV_HEAD, all.map(salesCsvRow));
    setBusy(false);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
        <span className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{loading ? "불러오는 중" : `${total.toLocaleString()}건`}</span>
        {canSee(me, "export.excel") && (
          <button className="btn sm" style={{ marginLeft: "auto" }} disabled={busy || !total} onClick={exportCsv}>
            {busy ? "준비 중" : "엑셀 내려받기"}
          </button>
        )}
      </div>
      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr>{cs.map((c) => <th key={c} style={COL[c].n ? { textAlign: "right" } : undefined}>{COL[c].h}</th>)}</tr>
          </thead>
          <tbody>
            {head && (
              <tr>
                {cs.map((c, i) => (
                  <td key={c} className={COL[c].n ? "num" : undefined}
                    style={{ background: "var(--bg-soft)", fontWeight: 600, textAlign: COL[c].n ? "right" : undefined }}>
                    {i === 0 ? "합계" : COL[c].sum ? COL[c].sum!(head) : ""}
                  </td>
                ))}
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.dedup_key}>
                {cs.map((c) => (
                  <td key={c} className={COL[c].n ? "num" : undefined} style={COL[c].n ? { textAlign: "right" } : { whiteSpace: "nowrap" }}>
                    {COL[c].v(s)}
                  </td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td colSpan={cs.length} style={{ textAlign: "center", color: "var(--ink-3)" }}>이 기간에 매출 기록이 없어요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, alignItems: "center" }}>
          <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button>
          <span className="num" style={{ fontSize: 13, color: "var(--ink-3)" }}>{page + 1} / {Math.ceil(total / PAGE)}</span>
          <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>다음</button>
        </div>
      )}
    </>
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

/* ── 전체·회원권·관리·제품·기타 탭 공용 화면 ─────────────────── */
export function LedgerScreen({ tab, cols, kinds, csvName }: {
  tab: Query["tab"]; cols: Col[]; kinds?: { k: string; l: string; ks?: string[] }[]; csvName: string;
}) {
  const me = useMe();
  const t = todayKST();
  const [range, setRange] = useState<Range>(monthRange(+t.slice(0, 4), +t.slice(5, 7)));
  const [branch, setBranch] = useState<string | null>(null);
  const [staff, setStaff] = useState<string | null>(null);
  const [kind, setKind] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const names = useStaffNames();
  const seeOthers = canSee(me, "sales.others");

  return (
    <>
      <div className="card" style={{ padding: "4px 20px" }}>
        <Cond label="조회기간"><PeriodPicker value={range} onChange={setRange} /></Cond>
        <Cond label="고객검색">
          <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
            <input className="inp" style={{ maxWidth: 280 }} placeholder="이름 또는 연락처 뒤 4자리 (비우면 전체)" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn">검색</button>
            {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); }}>지우기</button>}
          </form>
        </Cond>
        <Cond label="구분 상세">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {seeOthers ? (
              <select className="sel" style={{ width: 150 }} value={staff ?? ""} onChange={(e) => setStaff(e.target.value || null)}>
                <option value="">전체 직원</option>
                {names.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <span className="badge">본인 매출만 보여요</span>
            )}
            {kinds && (
              <>
                <button className={`chip ${kind.length === 0 ? "on" : ""}`} onClick={() => setKind([])}>전체</button>
                {kinds.map((o) => (
                  <button key={o.k} className={`chip ${kind.includes(o.k) ? "on" : ""}`}
                    onClick={() => setKind(kind.includes(o.k) ? kind.filter((x) => x !== o.k) : [...kind, o.k])}>{o.l}</button>
                ))}
              </>
            )}
            <span style={{ marginLeft: "auto" }}><BranchSeg value={branch} onChange={setBranch} /></span>
          </div>
        </Cond>
      </div>
      <SalesTable csvName={csvName} cols={cols}
        query={{ tab, range, branch, staff, q: query, kinds: kind.length ? kind.flatMap((x) => kinds?.find((o) => o.k === x)?.ks ?? [x]) : null }} />
    </>
  );
}
