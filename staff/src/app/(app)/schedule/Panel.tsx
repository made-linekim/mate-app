"use client";
// 예약 화면 왼쪽 패널 (v3 확정 시안 U-PC-RSV-1_예약표대표 / 업무메모): 현황 위젯 카드 · 업무 메모 · 문자 · 네이버
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { type Rsv, todayKST, addDays, dow, DOW } from "@/lib/schedule";

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

type W = "rsv" | "sales" | "check" | "exp" | "cust" | "staff";
const WIDGETS: { k: W; l: string }[] = [
  { k: "rsv", l: "예약 현황" }, { k: "sales", l: "매출 현황" }, { k: "check", l: "챙길 일" },
  { k: "exp", l: "만료예정 회원권" }, { k: "cust", l: "고객 현황" }, { k: "staff", l: "담당자별 예약" },
];
const TABS = ["현황", "업무 메모", "문자", "네이버"] as const;

export default function Panel({ branch, day, dayRows, staffName }: { branch: string; day: string; dayRows: Rsv[]; staffName: (id: string) => string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("현황");
  const [hide, setHide] = useState<W[]>([]);
  const [edit, setEdit] = useState(false);
  useEffect(() => { try { setHide(JSON.parse(localStorage.getItem("rsv.widgets.hide") || "[]")); } catch {} }, []);
  const flip = (k: W) => setHide((h) => { const n = h.includes(k) ? h.filter((x) => x !== k) : [...h, k]; try { localStorage.setItem("rsv.widgets.hide", JSON.stringify(n)); } catch {} return n; });
  const on = (k: W) => !hide.includes(k);
  return (
    <aside className="rv3-side">
      <div className="sg">
        {TABS.map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === "현황" ? (
        <>
          {on("rsv") && <RsvW rows={dayRows} day={day} />}
          {on("sales") && <SalesW branch={branch} />}
          {on("check") && <CheckW branch={branch} />}
          {on("exp") && <ExpiringW branch={branch} />}
          {on("cust") && <CustomerW branch={branch} />}
          {on("staff") && <ByStaffW rows={dayRows} staffName={staffName} />}
          <button className="btn3 t" onClick={() => setEdit(!edit)}>{Ico.plus}위젯 추가 · 편집</button>
          {edit && (
            <div className="card w">
              {WIDGETS.map((w) => (
                <label key={w.k} className="wl" style={{ gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={on(w.k)} onChange={() => flip(w.k)} />{w.l}
                </label>
              ))}
            </div>
          )}
        </>
      ) : tab === "업무 메모" ? <MemoSide branch={branch} /> : (
        <div className="card mempty">{tab} 화면은 준비 중이에요.</div>
      )}
    </aside>
  );
}

function RsvW({ rows, day }: { rows: Rsv[]; day: string }) {
  const n = (f: (r: Rsv) => boolean) => rows.filter(f).length;
  return (
    <div className="card w">
      <div className="wt">{Ico.cal}<b>예약 현황</b><span className="r cap num">{Number(day.slice(5, 7))}.{day.slice(8)} ({DOW[dow(day)]})</span></div>
      <div className="w4 num">
        {([["예약", n((r) => r.status === "예약" || r.status === "완료")], ["방문", n((r) => r.status === "완료")], ["노쇼", n((r) => r.status === "노쇼")], ["취소", n((r) => r.status === "취소")]] as const).map(([l, v]) => (
          <div key={l}><div className="v">{v}</div><div className="l">{l}</div></div>
        ))}
      </div>
    </div>
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
      <div className="wt">{Ico.won}<b>매출 현황</b><span className="r cap">{Number(todayKST().slice(5, 7))}월</span></div>
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

function Fold({ icon, title, value, children, href }: { icon: React.ReactNode; title: string; value: string; children?: React.ReactNode; href?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button className="wc" onClick={() => setOpen(!open)} aria-expanded={open}>
        {icon}<b>{title}</b><span className="r"><b className="num">{value}</b>{open ? Ico.chevD : Ico.chev}</span>
      </button>
      {open && <div className="wfold">{children}{href && <Link href={href} className="wl" style={{ color: "var(--ink-3)", fontWeight: 600 }}>전체 보기<span className="r">{Ico.chev}</span></Link>}</div>}
    </div>
  );
}

function ExpiringW({ branch }: { branch: string }) {
  const [d, setD] = useState<{ n: number; rows: { customer: string; name: string; end_on: string | null; remain: number }[] } | null>(null);
  useEffect(() => {
    let on = true;
    sb.rpc("membership_holdings", { p_branch: branch, p_filter: "soon" }).then(({ data, error }) => {
      if (!on || error || !data) return setD(null);
      const rows = (data.rows ?? []) as { customer_key: string; customer: string; name: string; end_on: string | null; remain: number }[];
      setD({ n: new Set(rows.map((r) => r.customer_key)).size, rows });
    });
    return () => { on = false; };
  }, [branch]);
  return (
    <Fold icon={Ico.clock} title="만료예정 회원권" value={d ? `${d.n}명` : "-"} href="/membership">
      {d?.rows.slice(0, 5).map((r, i) => (
        <div key={i} className="wl"><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.customer} · {r.name}</span><span className="r cap num">{r.end_on ? r.end_on.slice(5).replace("-", ".") : `${r.remain}회`}</span></div>
      ))}
    </Fold>
  );
}

function CustomerW({ branch }: { branch: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    sb.rpc("customer_list", { p_q: null, p_branch: branch, p_filter: "all", p_limit: 1, p_offset: 0 }).then(({ data, error }) => {
      if (on) setN(error ? null : Number((data as { total: number }[] | null)?.[0]?.total ?? 0));
    });
    return () => { on = false; };
  }, [branch]);
  return <Fold icon={Ico.users} title="고객 현황" value={n === null ? "-" : `${n.toLocaleString()}명`} href="/customers" />;
}

function ByStaffW({ rows, staffName }: { rows: Rsv[]; staffName: (id: string) => string }) {
  const m = new Map<string, number>();
  rows.filter((r) => r.status === "예약" || r.status === "완료").forEach((r) => m.set(r.staff_id || "", (m.get(r.staff_id || "") ?? 0) + 1));
  const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Fold icon={Ico.user} title="담당자별 예약" value={`${list.filter(([k]) => k).length}명`}>
      {list.length === 0 && <div className="wl cap">이 날 예약이 없어요</div>}
      {list.map(([k, v]) => <div key={k} className="wl">{k ? staffName(k) : "담당 미정"}<span className="r cap num">{v}건</span></div>)}
    </Fold>
  );
}

// 업무 메모 (v3 시안 U-PC-RSV-1_업무메모 · 빈화면 · 월간 · 저장)
type Memo = { id: string; day: string; body: string; author: string; created_at: string };
function MemoSide({ branch }: { branch: string }) {
  const today = todayKST();
  const [day, setDay] = useState(today);
  const [mode, setMode] = useState<"d" | "m">("d");
  const [list, setList] = useState<Memo[] | null>(null);
  const [auto, setAuto] = useState<{ hc: number | null; idle: number | null }>({ hc: null, idle: null });
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const mFrom = `${day.slice(0, 8)}01`, mTo = monthEnd(day);
  const load = () => {
    setErr("");
    sb.rpc("rsv_work_memo_list", { p_branch: branch, p_from: mFrom, p_to: mTo }).then(({ data, error }) => {
      if (error) { setList([]); setErr(/function|schema cache/i.test(error.message) ? "업무 메모는 서버 준비 중이에요." : error.message); return; }
      setList((data ?? []) as Memo[]);
    });
  };
  useEffect(load, [branch, mFrom, mTo]); // eslint-disable-line react-hooks/exhaustive-deps
  // 자동 대상: 오늘만 (해피콜 대상 · 잔여 회차 있는데 오늘 예약 없는 고객)
  useEffect(() => {
    let on = true;
    Promise.all([
      sb.rpc("happycall_list", { p_branch: branch }),
      sb.rpc("membership_holdings", { p_branch: branch, p_filter: "active" }),
      sb.rpc("rsv_board", { p_branch: branch, p_from: today, p_to: today }),
    ]).then(([h, m, r]) => {
      if (!on) return;
      const booked = new Set(((r.data ?? []) as Rsv[]).filter((x) => x.status === "예약" || x.status === "완료").map((x) => x.customer_key));
      const hold = (m.data?.rows ?? []) as { customer_key: string; remain: number }[];
      setAuto({
        hc: h.error || !Array.isArray(h.data) ? null : h.data.length,
        idle: m.error || r.error ? null : new Set(hold.filter((x) => Number(x.remain) > 0 && !booked.has(x.customer_key)).map((x) => x.customer_key)).size,
      });
    });
    return () => { on = false; };
  }, [branch, today]);
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("rsv_work_memo_add", { p_branch: branch, p_day: day, p_body: text.trim() });
    setBusy(false);
    if (error) return setErr(/function|schema cache/i.test(error.message) ? "업무 메모는 서버 준비 중이에요." : error.message);
    setText(""); load(); setToast("업무 메모를 남겼어요."); setTimeout(() => setToast(""), 2500);
  };
  const stepM = (n: number) => setDay(`${addDays(`${day.slice(0, 8)}15`, n * 30).slice(0, 8)}01`);
  const tm = (t: string) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
  const when = (m: Memo) => `${m.author || "직원"} · ${m.day === today ? "오늘" : `${Number(m.day.slice(5, 7))}.${m.day.slice(8)}`} ${tm(m.created_at)}`;
  const shown = (list ?? []).filter((m) => m.day === day).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const memoDays = new Set((list ?? []).map((m) => m.day));
  const first = `${day.slice(0, 8)}01`;
  const cells = [...Array.from({ length: dow(first) }, () => ""), ...Array.from({ length: Number(mTo.slice(8)) }, (_, i) => `${day.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  const autoCard = day === today && (auto.hc !== null || auto.idle !== null) && (
    <div className="card mc">
      <div className="when">자동 · {mode === "d" ? "오늘" : `${Number(day.slice(5, 7))}.${day.slice(8)}`}</div>
      {auto.hc !== null && <div className="mtxt">해피콜 대상 {auto.hc}명</div>}
      {auto.idle !== null && <div className="mtxt">잔여 회차 있는데 {mode === "d" ? "오늘 " : ""}예약 없는 고객 {auto.idle}명</div>}
    </div>
  );
  return (
    <>
      <div className="mnav">
        <button className="ib" onClick={() => stepM(-1)} aria-label="이전 달">{Ico.left}</button>
        <b className="num" style={{ textAlign: "center" }}>{Number(day.slice(5, 7))}월 {day.slice(0, 4)}</b>
        <button className="ib" onClick={() => stepM(1)} aria-label="다음 달">{Ico.chev}</button>
      </div>
      <div className="sg">
        <button className={mode === "d" ? "on" : ""} onClick={() => setMode("d")} style={{ flex: "none" }}>일간</button>
        <button className={mode === "m" ? "on" : ""} onClick={() => setMode("m")} style={{ flex: "none" }}>월간</button>
      </div>
      <div className="card minfo">{Ico.info}그날 남긴 메모와 자동 대상(해피콜·상담일지, 잔여 회차·예약 없음)을 보여 줘요.</div>
      {mode === "m" && (
        <div className="card mcal num">
          {DOW.map((d) => <div key={d} className="hd">{d}</div>)}
          {cells.map((d, i) => d ? (
            <button key={d} className={d === day ? "on" : ""} onClick={() => setDay(d)}>{Number(d.slice(8))}{memoDays.has(d) && <i className="dot" />}</button>
          ) : <span key={`e${i}`} />)}
        </div>
      )}
      {list === null ? <div className="card mempty">불러오는 중…</div> : (
        <>
          {autoCard}
          {shown.map((m) => <div key={m.id} className="card mc"><div className="when num">{when(m)}</div><div className="mtxt">{m.body}</div></div>)}
          {!autoCard && shown.length === 0 && <div className="card mempty">{err || "이 날에 남긴 업무 메모가 없어요."}</div>}
        </>
      )}
      {mode === "d" && (
        <div className="card mwrite">
          <label htmlFor="rv3-memo">메모 쓰기</label>
          <textarea id="rv3-memo" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} />
          {err && list && list.length > 0 && <p className="cap" style={{ color: "var(--red)" }}>{err}</p>}
          <button className="btn3 sm p" disabled={busy || !text.trim()} onClick={add}>메모 저장</button>
        </div>
      )}
      {toast && <div className="rv3-toast">{toast}</div>}
    </>
  );
}

// 업무 메모 (시안 1120 U-PC-RSV-1): 날짜별로 남기는 지점 메모. 일간 / 월간
export function MemoTab({ branch }: { branch: string }) {
  const [day, setDay] = useState(todayKST());
  const [mode, setMode] = useState<"d" | "m">("d");
  const [list, setList] = useState<Memo[] | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const from = mode === "d" ? day : `${day.slice(0, 8)}01`;
  const to = mode === "d" ? day : monthEnd(day);
  const load = () => {
    setErr("");
    sb.rpc("rsv_work_memo_list", { p_branch: branch, p_from: from, p_to: to }).then(({ data, error }) => {
      if (error) { setList([]); setErr(/function|schema cache/i.test(error.message) ? "업무 메모는 서버 준비 중이에요." : error.message); return; }
      setList((data ?? []) as Memo[]);
    });
  };
  useEffect(load, [branch, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("rsv_work_memo_add", { p_branch: branch, p_day: day, p_body: text.trim() });
    setBusy(false);
    if (error) return setErr(/function|schema cache/i.test(error.message) ? "업무 메모는 서버 준비 중이에요." : error.message);
    setText(""); load();
  };
  const step = (n: number) => setDay(mode === "d" ? addDays(day, n) : `${addDays(`${day.slice(0, 8)}15`, n * 30).slice(0, 8)}01`);
  const label = mode === "d" ? `${Number(day.slice(5, 7))}.${day.slice(8)}` : `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월`;
  const tm = (t: string) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
  return (
    <div className="memo-tab">
      <div className="memo-nav">
        <button className="btn sm" onClick={() => step(-1)} aria-label="이전">‹</button>
        <b className="num">{label}</b>
        <button className="btn sm" onClick={() => step(1)} aria-label="다음">›</button>
        <div className="seg sm" style={{ marginLeft: "auto" }}>
          <button className={mode === "d" ? "on" : ""} onClick={() => setMode("d")}>일간</button>
          <button className={mode === "m" ? "on" : ""} onClick={() => setMode("m")}>월간</button>
        </div>
      </div>
      <div className="memo-list">
        {list === null ? <p className="memo-empty">불러오는 중…</p>
          : list.length === 0 ? <p className="memo-empty">{err || (mode === "d" ? "이날 남긴 메모가 없어요." : "이번 달 남긴 메모가 없어요.")}</p>
          : list.map((m) => (
            <div key={m.id} className="memo-it">
              <span>{m.author || "직원"} · {mode === "m" ? `${Number(m.day.slice(5, 7))}.${m.day.slice(8)} ` : ""}{tm(m.created_at)}</span>
              <p>{m.body}</p>
            </div>
          ))}
      </div>
      {mode === "d" && (
        <div className="memo-write">
          <label>메모 쓰기</label>
          <textarea className="inp" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 저녁 마감 때 2번실 소독이 남아 있어요." />
          {err && list && list.length > 0 && <p className="memo-err">{err}</p>}
          <button className="btn p sm" disabled={busy || !text.trim()} onClick={add}>메모 저장</button>
        </div>
      )}
    </div>
  );
}
