"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { dot, errText, monthRange, thisMonth, type Col, type Row } from "@/lib/stats";
import { monthOptions, useStats, ymLabel } from "../ui";

/* 뷰티사랑넷 집계 조건 흐름: 조회방법(월·날짜·기간) → 직원 → 항목 → 구분 → 고객 검색 → 조회
   조회하면 조건은 한 줄 요약으로 접혀요 (시안 STAT-4 '조건 바꾸기') */

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
  const [open, setOpen] = useState(false);
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
    onApply({ ...r, label, staff, items, kinds, q: q.trim() });
    setOpen(false);
  }
  const togg = (list: string[] | null, all: string[], v: string) => {
    const cur = list ?? all;
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return next.length === all.length ? null : next;
  };

  const sumText = [
    query.label,
    branch ?? "전 지점",
    query.staff ? `직원 ${query.staff.length}명` : "직원 전체",
    query.kinds ? `구분 ${query.kinds.length}개` : "구분 전체",
    query.q ? `‘${query.q}’` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="st-cond st-noprint">
      <div className="st-cond-bar">
        <span className="st-cond-sum">{sumText}{staffCount != null ? ` · ${staffCount}명 조회됨` : ""}</span>
        <button className={`btn sm ${open ? "" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기" : "조건 바꾸기"}</button>
      </div>
      {open && (
        <div className="st-cond-panel">
          <div className="st-frow">
            <span className="st-flabel">조회 방법</span>
            <div className="st-fval">
              <div className="seg" role="tablist">
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
            </div>
          </div>
          <div className="st-frow">
            <span className="st-flabel">직원</span>
            <div className="st-fval st-chips">
              <button className={`chip ${staff === null ? "on" : ""}`} onClick={() => setStaff(null)}>전체</button>
              {names.map((n) => (
                <button key={n} className={`chip ${staff === null || staff.includes(n) ? "on" : ""}`} onClick={() => setStaff(togg(staff, names, n))}>{n}</button>
              ))}
            </div>
          </div>
          <div className="st-frow">
            <span className="st-flabel">항목</span>
            <div className="st-fval st-chips">
              {ITEMS.map((i) => (
                <button key={i.k} className={`chip ${items.includes(i.k) ? "on" : ""}`}
                  onClick={() => setItems(items.includes(i.k) ? items.filter((x) => x !== i.k) : ITEMS.map((x) => x.k).filter((k) => k === i.k || items.includes(k)))}>{i.l}</button>
              ))}
            </div>
          </div>
          <div className="st-frow">
            <span className="st-flabel">구분</span>
            <div className="st-fval st-chips">
              <button className={`chip ${kinds === null ? "on" : ""}`} onClick={() => setKinds(null)}>전체</button>
              {KINDS.map((k) => (
                <button key={k} className={`chip ${kinds === null || kinds.includes(k) ? "on" : ""}`} onClick={() => setKinds(togg(kinds, KINDS, k))}>{KIND_LABEL[k] ?? k}</button>
              ))}
            </div>
          </div>
          <div className="st-frow">
            <span className="st-flabel">고객 검색</span>
            <div className="st-fval">
              <input className="inp" placeholder="이름 또는 전화번호 4자리 이상" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
            </div>
          </div>
          <div className="st-cond-go">
            <button className="btn" onClick={() => setOpen(false)}>닫기</button>
            <button className="btn p" onClick={apply}>조회</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const kindCountCols: Col[] = [["n_svc", "관리", "num"], ["n_mem", "회원권", "num"], ["n_prod", "제품", "num"], ["n_etc", "기타", "num"]];
export { errText };
