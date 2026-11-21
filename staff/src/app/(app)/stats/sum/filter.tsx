"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { todayKST } from "@/lib/sales";
import { dot, errText, monthRange, thisMonth, type Col, type Row } from "@/lib/stats";
import { C2Card, Pop, monthOptions, useFilterReady, useStats, ymLabel, groupKinds, type C2Val } from "../ui";

/* 뷰티사랑넷 집계 조건 흐름: 조회방법(월·날짜·기간) → 직원 → 항목 → 구분 → 고객 검색 → 조회
   v3 C2 (시안 STAT-3·4): 조회 줄 + 늘 펼친 카드(직원 · 관리 · 구분 체크) + 조회. 직원 권한은 '나(본인)'로 고정 */

export const ITEMS: { k: string; l: string; t: "won" | "min" | "num" }[] = [
  { k: "amount", l: "결제 금액", t: "won" }, { k: "service", l: "관리 금액", t: "won" },
  { k: "card", l: "카드", t: "won" }, { k: "cash", l: "현금", t: "won" }, { k: "account", l: "계좌", t: "won" }, { k: "npay", l: "NPay", t: "won" },
  { k: "unpaid", l: "미수", t: "won" }, { k: "settled", l: "미수 정산", t: "won" }, { k: "discount", l: "할인", t: "won" }, { k: "point", l: "포인트", t: "won" },
  { k: "minutes", l: "시간", t: "min" }, { k: "n_ticket", l: "회차권", t: "num" },
];
export const KINDS = ["관리", "노쇼", "회차회원권", "기간회원권", "제품판매", "미수금 정산", "기타수입"];

export type SumQuery = { from: string; to: string; label: string; staff: string[] | null; items: string[]; kinds: string[] | null; q: string; progs: string[] | null; groups: string[] | null };
type Mode = "month" | "day" | "range";

export function useSum(by: "day" | "staff") {
  const { branch } = useStats();
  const ready = useFilterReady();
  const [query, setQuery] = useState<SumQuery>(() => {
    const r = monthRange(thisMonth());
    return { ...r, label: ymLabel(thisMonth()), staff: null, items: ["amount"], kinds: null, q: "", progs: null, groups: null };
  });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [money, setMoney] = useState(true);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (ready === null) return;
    let live = true;
    setErr("");
    const args: Record<string, unknown> = { p_by: by, p_branch: branch, p_from: query.from, p_to: query.to, p_staff: query.staff, p_kinds: groupKinds(query.groups), p_q: query.q || null };
    if (ready) args.p_progs = query.progs;
    sb.rpc("stats_sum", args)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(errText(error)); setRows([]); return; }
        const d = data as { rows: Row[]; money: boolean };
        setRows(d.rows); setMoney(d.money);
      });
    return () => { live = false; };
  }, [by, branch, query, ready]);
  return { query, setQuery, rows, money, err, ready };
}

/* 고른 항목 → 표 칸 */
export function itemCols(items: string[], money: boolean): Col[] {
  return ITEMS.filter((i) => items.includes(i.k) && (money || i.t !== "won")).map((i) => [i.k, i.l, i.t]);
}

/* 시안 v3 조회 줄
   full   : [월|날짜|기간] [2026.11] [직원 전체] [항목 전체] [조회]          … [엑셀 다운]   (날짜별)
   compact: 11월 · 의정부점 · 직원 4명 · 조회됨 [조건 바꾸기]               … [엑셀 다운]   (담당자별 · 인센티브)
   그 아래 C2 카드 (직원 · 관리 · 구분) */
export function SumFilter({ query, onApply, ready, compact, help, right, noC2, monthOnly }: {
  query: SumQuery; onApply: (q: SumQuery) => void; ready: boolean | null; compact?: boolean; help?: string; right?: React.ReactNode; noC2?: boolean; monthOnly?: boolean;
}) {
  const t = todayKST();
  const me = useMe();
  const { branch } = useStats();
  const [mode, setMode] = useState<Mode>("month");
  const [ym, setYm] = useState(thisMonth());
  const [day, setDay] = useState(t);
  const [from, setFrom] = useState(`${t.slice(0, 8)}01`);
  const [to, setTo] = useState(t);
  const [items, setItems] = useState<string[]>(query.items);
  const [q, setQ] = useState(query.q);
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const own = me.tier === "staff";
  useEffect(() => {
    if (own || compact) return;
    sb.rpc("stats_staff_names", { p_branch: branch }).then(({ data }) => setNames(((data as string[]) ?? []).filter((n) => n !== "미지정")));
  }, [branch, own, compact]);

  function period() {
    let r = monthRange(ym), label = ymLabel(ym);
    if (mode === "day") { r = { from: day, to: day }; label = dot(day); }
    if (mode === "range") { r = { from, to }; label = `${dot(from)} ~ ${dot(to)}`; }
    return { ...r, label };
  }
  const apply = (extra: Partial<SumQuery> = {}) => onApply({ ...query, ...period(), items, q: q.trim(), staff: own ? [me.name] : query.staff, ...extra });
  const c2: C2Val = { staff: query.staff, progs: query.progs, groups: query.groups };

  const periodCtl = (
    <>
      <div className="seg" role="tablist" aria-label="조회 방법">
        {(monthOnly ? [["month", "월"]] as const : ([["month", "월"], ["day", "날짜"], ["range", "기간"]] as const)).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k as Mode)}>{l}</button>
        ))}
      </div>
      {mode === "month" && (
        <select className="sel st3-ym" aria-label="월" value={ym} onChange={(e) => setYm(e.target.value)}>
          {monthOptions().map((m) => <option key={m} value={m}>{m.replace("-", ".")}</option>)}
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
    </>
  );

  return (
    <>
      <div className="st3-bar st-noprint">
        {compact ? (
          <>
            <span className="st3-help">{help}</span>
            <button className={`btn st3-box ${open ? "on" : ""}`} onClick={() => setOpen(!open)}>{open ? "조건 접기" : "조건 바꾸기"}</button>
            {open && <>{periodCtl}<button className="btn p st3-go" onClick={() => { apply(); setOpen(false); }}>조회</button></>}
          </>
        ) : (
          <>
            {periodCtl}
            {own ? <span className="btn st3-box st3-static">담당 {me.name}</span> : (
              <Pop label={query.staff === null ? "직원 전체" : `직원 ${query.staff.length}명`}>
                <div className="st3-pop-list">
                  <label className="ck"><input type="checkbox" checked={query.staff === null} onChange={() => apply({ staff: null })} />전체</label>
                  {names.map((n) => (
                    <label key={n} className="ck"><input type="checkbox" checked={query.staff?.includes(n) ?? false}
                      onChange={() => { const cur = query.staff ?? []; const nx = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]; apply({ staff: nx.length && nx.length < names.length ? nx : null }); }} />{n}</label>
                  ))}
                </div>
              </Pop>
            )}
            <Pop label={items.length === 1 && items[0] === "amount" ? "항목 전체" : `항목 ${items.length}개`}>
              <div className="st3-pop-list">
                <b>표에 보일 금액 칸</b>
                {ITEMS.slice(0, 10).map((i) => (
                  <label key={i.k} className="ck"><input type="checkbox" checked={items.includes(i.k)}
                    onChange={() => setItems(items.includes(i.k) ? (items.length > 1 ? items.filter((x) => x !== i.k) : items) : ITEMS.map((x) => x.k).filter((k) => k === i.k || items.includes(k)))} />{i.l}</label>
                ))}
                <b>고객 찾기</b>
                <input className="inp" placeholder="고객 이름 · 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && apply()} />
              </div>
            </Pop>
            <button className="btn p st3-go" onClick={() => apply()}>조회</button>
          </>
        )}
        <div className="st-sp" />
        {right}
      </div>
      {!noC2 && <C2Card value={c2} ready={ready} onGo={(v) => onApply({ ...query, staff: own ? [me.name] : v.staff, progs: v.progs, groups: v.groups })} />}
    </>
  );
}

export const kindCountCols: Col[] = [["n_svc", "관리", "num"], ["n_mem", "회원권", "num"], ["n_prod", "제품", "num"], ["n_etc", "기타", "num"]];
export { errText };
