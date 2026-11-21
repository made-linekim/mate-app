"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { todayKST } from "@/lib/sales";
import { dot, errText, monthRange, thisMonth, type Col, type Row } from "@/lib/stats";
import { monthOptions, useStats, ymLabel } from "../ui";

/* 뷰티사랑넷 집계 조건 흐름: 조회방법(월·날짜·기간) → 직원 → 항목 → 구분 → 고객 검색 → 조회
   v3 C2: 조건은 늘 펼친 한 줄 카드(직원 · 항목 · 구분 체크) + 조회 버튼. 직원 권한은 '나(본인)'로 고정 */

export const ITEMS: { k: string; l: string; t: "won" | "min" | "num" }[] = [
  { k: "amount", l: "결제 금액", t: "won" }, { k: "service", l: "관리 금액", t: "won" },
  { k: "card", l: "카드", t: "won" }, { k: "cash", l: "현금", t: "won" }, { k: "account", l: "계좌", t: "won" }, { k: "npay", l: "NPay", t: "won" },
  { k: "unpaid", l: "미수", t: "won" }, { k: "settled", l: "미수 정산", t: "won" }, { k: "discount", l: "할인", t: "won" }, { k: "point", l: "포인트", t: "won" },
  { k: "minutes", l: "시간", t: "min" }, { k: "n_ticket", l: "회차권", t: "num" },
];
export const KINDS = ["관리", "노쇼", "회차회원권", "기간회원권", "제품판매", "미수금 정산", "기타수입"];
const KIND_LABEL: Record<string, string> = { 제품판매: "제품", 기타수입: "기타 수입", "미수금 정산": "미수 정산", 회차회원권: "회차권", 기간회원권: "기간권" };

export type SumQuery = { from: string; to: string; label: string; staff: string[] | null; items: string[]; kinds: string[] | null; q: string };
type Mode = "month" | "day" | "range";

export function useSum(by: "day" | "staff") {
  const { branch } = useStats();
  const [query, setQuery] = useState<SumQuery>(() => {
    const r = monthRange(thisMonth());
    return { ...r, label: ymLabel(thisMonth()), staff: null, items: ["amount"], kinds: null, q: "" };
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [money, setMoney] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    setErr("");
    sb.rpc("stats_sum", { p_by: by, p_branch: branch, p_from: query.from, p_to: query.to, p_staff: query.staff, p_kinds: query.kinds, p_q: query.q || null })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(errText(error)); setRows([]); return; }
        const d = data as { rows: Row[]; money: boolean };
        setRows(d.rows); setMoney(d.money);
      });
    return () => { live = false; };
  }, [by, branch, query]);
  return { query, setQuery, rows, money, err };
}

/* 고른 항목 → 표 칸 */
export function itemCols(items: string[], money: boolean): Col[] {
  return ITEMS.filter((i) => items.includes(i.k) && (money || i.t !== "won")).map((i) => [i.k, i.l, i.t]);
}

export function SumFilter({ query, onApply, staffCount }: { query: SumQuery; onApply: (q: SumQuery) => void; staffCount?: number }) {
  const { branch } = useStats();
  const t = todayKST();
  const me = useMe();
  const [mode, setMode] = useState<Mode>("month");
  const [ym, setYm] = useState(thisMonth());
  const [day, setDay] = useState(t);
  const [from, setFrom] = useState(`${t.slice(0, 8)}01`);
  const [to, setTo] = useState(t);
  const [names, setNames] = useState<string[]>([]);
  const [staff, setStaff] = useState<string[] | null>(query.staff);
  const [items, setItems] = useState<string[]>(query.items);
  const [kinds, setKinds] = useState<string[] | null>(query.kinds);
  const [q, setQ] = useState(query.q);

  useEffect(() => {
    sb.rpc("stats_staff_names", { p_branch: branch }).then(({ data }) => setNames((data as string[]) ?? []));
  }, [branch]);

  function apply() {
    let r = monthRange(ym), label = ymLabel(ym);
    if (mode === "day") { r = { from: day, to: day }; label = dot(day); }
    if (mode === "range") { r = { from, to }; label = `${dot(from)} ~ ${dot(to)}`; }
    onApply({ ...r, label, staff: me.tier === "staff" ? [me.name] : staff, items, kinds, q: q.trim() });
  }
  const togg = (list: string[] | null, all: string[], v: string) => {
    const cur = list ?? all;
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return next.length === all.length ? null : next;
  };

  const own = me.tier === "staff";
  const Ck = ({ on, label, onClick, lock }: { on: boolean; label: string; onClick?: () => void; lock?: boolean }) => (
    <button type="button" className={`st-ck2 ${on ? "on" : ""} ${lock ? "lock" : ""}`} aria-pressed={on} onClick={onClick} disabled={lock}><i aria-hidden />{label}</button>
  );

  return (
    <div className="st-cond st-noprint">
      <div className="st-c2-top">
        <div className="seg" role="tablist" aria-label="조회 방법">
          {([["month", "월"], ["day", "날짜"], ["range", "기간"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        {mode === "month" && (
          <select className="sel st-sel" aria-label="월" value={ym} onChange={(e) => setYm(e.target.value)}>
            {monthOptions().map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
          </select>
        )}
        {mode === "day" && <input className="inp st-date" type="date" aria-label="날짜" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />}
        {mode === "range" && (
          <span className="st-range">
            <input className="inp" type="date" aria-label="시작일" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            <span>~</span>
            <input className="inp" type="date" aria-label="종료일" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
          </span>
        )}
        <input className="inp st-c2-q" placeholder="고객 이름 · 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
        {staffCount != null && <span className="st-c2-n">{staffCount}명 조회됨</span>}
      </div>
      <div className="st-c2">
        <span className="st-c2-l">직원</span>
        {own ? (
          <><Ck on lock label={`나 (본인)`} /><span className="st-c2-h">직원 권한은 본인 기록만</span></>
        ) : (
          <>
            <Ck on={staff === null} label="전체" onClick={() => setStaff(null)} />
            {names.map((n) => <Ck key={n} on={staff !== null && staff.includes(n)} label={n} onClick={() => setStaff(togg(staff ?? [], names, n) ?? null)} />)}
          </>
        )}
        <span className="st-c2-sep" />
        <span className="st-c2-l">항목</span>
        {ITEMS.slice(0, 7).map((i) => (
          <Ck key={i.k} on={items.includes(i.k)} label={i.l}
            onClick={() => setItems(items.includes(i.k) ? (items.length > 1 ? items.filter((x) => x !== i.k) : items) : ITEMS.map((x) => x.k).filter((k) => k === i.k || items.includes(k)))} />
        ))}
        <span className="st-c2-sep" />
        <span className="st-c2-l">구분</span>
        {KINDS.map((k) => <Ck key={k} on={kinds === null || kinds.includes(k)} label={KIND_LABEL[k] ?? k} onClick={() => setKinds(togg(kinds, KINDS, k))} />)}
        <button className="btn st-c2-go" onClick={apply}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>조회</button>
      </div>
    </div>
  );
}

export const kindCountCols: Col[] = [["n_svc", "관리", "num"], ["n_mem", "회원권", "num"], ["n_prod", "제품", "num"], ["n_etc", "기타", "num"]];
export { errText };
