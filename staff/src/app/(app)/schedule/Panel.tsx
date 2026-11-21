"use client";
// 예약 화면 왼쪽 패널 (v3 확정 시안 U-PC-RSV-1_예약표대표 / 업무메모): 현황 위젯 카드 · 업무 메모 · 문자 · 네이버
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import WorkMemo from "./WorkMemo";
import { BOARD, BOARD_DEFAULT, BoardWidget, type WKey } from "./Widgets";
import { type Rsv, todayKST, addDays } from "@/lib/schedule";

const monthEnd = (d: string) => addDays(`${addDays(`${d.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
const man = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : n.toLocaleString());
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Ico = {
  cal: <svg className="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" {...P} /><path d="M16 2v4M8 2v4M3 10h18" {...P} /></svg>,
  won: <svg className="i" viewBox="0 0 24 24"><path d="M4 7l4 10 4-10 4 10 4-10M3 11h18" {...P} /></svg>,
  warn: <svg className="i" viewBox="0 0 24 24"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" {...P} /><path d="M12 9v4M12 17h.01" {...P} /></svg>,
  clock: <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...P} /><path d="M12 7v5l3 2" {...P} /></svg>,
  users: <svg className="i" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...P} /><circle cx="9" cy="7" r="4" {...P} /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...P} /></svg>,
  user: <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" {...P} /><path d="M4 21a8 8 0 0 1 16 0" {...P} /></svg>,
  chev: <svg className="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" {...P} /></svg>,
  chevD: <svg className="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" {...P} /></svg>,
  left: <svg className="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" {...P} /></svg>,
  plus: <svg className="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" {...P} /></svg>,
  info: <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...P} /><path d="M12 11v5M12 8h.01" {...P} /></svg>,
  filter: <svg className="i" viewBox="0 0 24 24"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" {...P} /></svg>,
  home: <svg className="i" viewBox="0 0 24 24"><path d="M3 21h18M5 21V8l7-5 7 5v13" {...P} /><path d="M10 21v-5h4v5" {...P} /></svg>,
  off: <svg className="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" {...P} /><path d="M3 10h18M9 14l6 5M15 14l-6 5" {...P} /></svg>,
};

// 우리만 있는 위젯(챙길 일 · 매출 목표) + 뷰티사랑넷 현황보드 위젯(Widgets.tsx)
type Own = "check" | "goal";
type Key = Own | WKey;
const OWN: { k: Own; cat: "기타"; l: string; d: string }[] = [
  { k: "check", cat: "기타", l: "챙길 일", d: "해피콜 마감 지남, 재등록 미연락, 미수금" },
  { k: "goal", cat: "기타", l: "이번 달 매출 목표", d: "이번 달 매출과 목표 달성률" },
];
const ALL: { k: Key; cat: string; l: string; d: string }[] = [...BOARD, ...OWN];
const CATS = ["전체", "예약", "매출", "고객", "회원권", "기타"] as const;
const DEF: Key[] = ["check", ...BOARD_DEFAULT];
const STORE = "rsv.widgets.v2";
const TABS = ["현황", "업무 메모", "문자", "네이버"] as const;

export default function Panel({ branch, onFold }: { branch: string; day?: string; dayRows?: Rsv[]; staffName?: (id: string) => string; onFold?: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("현황");
  const [list, setList] = useState<Key[]>(DEF);
  const [edit, setEdit] = useState(false);
  const [add, setAdd] = useState(false);
  const [cat, setCat] = useState<(typeof CATS)[number]>("전체");
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(STORE) || "null"); if (Array.isArray(v)) setList(v.filter((k: Key) => ALL.some((w) => w.k === k))); } catch {} }, []);
  const save = (n: Key[]) => { setList(n); try { localStorage.setItem(STORE, JSON.stringify(n)); } catch {} };
  const move = (i: number, d: number) => { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; save(n); };
  const name = (k: Key) => ALL.find((w) => w.k === k)?.l ?? k;
  return (
    <aside className="rv3-side">
      {onFold && <button className="rv3-fold" onClick={onFold} aria-label="왼쪽 패널 닫아두기">{Ico.left}닫아두기</button>}
      <div className="sg">
        {TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === "현황" ? (
        <>
          {list.map((k, i) => (
            <div key={k} className={edit ? "wedit" : undefined}>
              {edit && (
                <div className="wbar"><b>{name(k)}</b>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="아래로">↓</button>
                  <button className="del" onClick={() => save(list.filter((x) => x !== k))} aria-label="빼기">빼기</button>
                </div>
              )}
              {k === "check" ? <CheckW branch={branch} /> : k === "goal" ? <SalesW branch={branch} /> : <BoardWidget k={k} branch={branch} />}
            </div>
          ))}
          {list.length === 0 && <div className="card mempty">위젯 추가를 눌러 보고 싶은 항목을 골라 주세요.</div>}
          <div className="wbtns">
            <button className="btn3 sm" onClick={() => { setAdd(true); setEdit(false); }}>{Ico.plus}위젯 추가</button>
            <button className={`btn3 sm ${edit ? "p" : ""}`} onClick={() => { setEdit(!edit); setAdd(false); }}>{edit ? "편집 끝" : "편집"}</button>
          </div>
          {add && (
            <div className="wadd-dim" onClick={() => setAdd(false)}>
              <div className="wadd" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="위젯 추가">
                <div className="hd"><b>위젯 추가</b><button className="btn3 t sm" onClick={() => setAdd(false)}>닫기</button></div>
                <div className="wcats">{CATS.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>
                <div className="bd">
                  {ALL.filter((w) => cat === "전체" || w.cat === cat).map((w) => {
                    const used = list.includes(w.k);
                    return (
                      <button key={w.k} className={`wi ${used ? "used" : ""}`} onClick={() => save(used ? list.filter((x) => x !== w.k) : [...list, w.k])}>
                        <span className="tx"><b><span className="cap">[{w.cat}]</span> {w.l}</b><span className="cap">{w.d}</span></span>
                        <span className={`bdg ${used ? "grn" : ""}`}>{used ? "사용 중" : "추가"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : tab === "업무 메모" ? <WorkMemo branch={branch} /> : (
        <div className="card mempty">{tab} 화면은 준비 중이에요.</div>
      )}
    </aside>
  );
}

function SalesW({ branch }: { branch: string }) {
  const [s, setS] = useState<{ actual: number; target: number | null } | null | "no">(null);
  useEffect(() => {
    let on = true;
    const m = `${todayKST().slice(0, 8)}01`;
    sb.rpc("dash_goal", { p_branch: branch, p_month: m }).then(({ data, error }) => {
      if (!on) return;
      const g = (data as { branch?: { sales?: { actual: number; target: number | null } | null } } | null)?.branch?.sales;
      if (!error && g) return setS({ actual: Number(g.actual ?? 0), target: g.target == null ? null : Number(g.target) });
      // 목표를 볼 수 없으면 이번 달 매출 합계만
      sb.rpc("sales_list", { p_tab: "all", p_from: m, p_to: monthEnd(m), p_branch: branch, p_staff: null, p_q: null, p_customer_key: null, p_kinds: null, p_limit: 1, p_offset: 0 })
        .then(({ data: d, error: e }) => { if (on) setS(e ? "no" : { actual: Number((d as { sum_amount: number }[] | null)?.[0]?.sum_amount ?? 0), target: null }); });
    });
    return () => { on = false; };
  }, [branch]);
  if (s === "no") return null;
  const pct = s && s.target ? Math.round((100 * s.actual) / s.target) : null;
  return (
    <div className="card w">
      <div className="wt">{Ico.won}<b>이번 달 매출 목표</b><span className="r cap">{Number(todayKST().slice(5, 7))}월</span></div>
      <div className="big num">{s ? man(s.actual) : "-"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 4px" }}>
        <div className="bar6"><i style={{ width: `${Math.min(pct ?? 0, 100)}%` }} /></div>
        <span className="bdg">{pct == null ? "목표 없음" : `목표 ${pct}%`}</span>
      </div>
    </div>
  );
}

function CheckW({ branch }: { branch: string }) {
  const [v, setV] = useState<{ late: number | null; renew: number | null; unpaid: number | null }>({ late: null, renew: null, unpaid: null });
  useEffect(() => {
    let on = true;
    Promise.all([
      sb.rpc("happycall_list", { p_branch: branch }),
      sb.rpc("receivable_list", { p_q: null, p_branch: branch }),
    ]).then(([h, r]) => {
      if (!on) return;
      const hl = (Array.isArray(h.data) ? h.data : []) as { kind: string; status: string; last_called_at: string | null }[];
      setV({
        late: h.error ? null : hl.filter((x) => x.status === "기한지남").length,
        renew: h.error ? null : hl.filter((x) => x.kind === "expiring" && !x.last_called_at).length,
        unpaid: r.error ? null : ((Array.isArray(r.data) ? r.data : []) as { balance: number }[]).filter((x) => Number(x.balance) > 0).length,
      });
    });
    return () => { on = false; };
  }, [branch]);
  const n = [v.late, v.renew, v.unpaid].filter((x) => (x ?? 0) > 0).length;
  const row = (l: string, x: number | null, href: string, c: string) => x !== null && (
    <Link href={href} className="wl">{l}<span className={`r bdg ${x ? c : ""}`}>{x}명</span></Link>
  );
  return (
    <div className="card w">
      <div className="wt">{Ico.warn}<b>챙길 일</b><span className="r"><span className={`cnt num ${n ? "red" : ""}`}>{n}</span></span></div>
      {row("해피콜 마감 지남", v.late, "/work?tab=happycall", "red")}
      {row("재등록 D-14 미연락", v.renew, "/work?tab=happycall", "amb")}
      {row("미수금", v.unpaid, "/sales/receivable", "amb")}
    </div>
  );
}

