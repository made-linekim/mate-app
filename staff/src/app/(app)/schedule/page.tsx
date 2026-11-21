"use client";
// 예약 (메라 시안 P01): 왼쪽 현황보드 + 오른쪽 예약표(일간=담당자 열)
import { has } from "@/lib/perm";
import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import {
  type Program, type Rsv, type Holiday,
  STEP, ROW_H, toMin, todayKST, addDays, dow, DOW, weekStart, lanes,
} from "@/lib/schedule";
import RsvDrawer, { type Draft } from "./RsvDrawer";
import Panel, { Ico } from "./Panel";
import "./rsv3.css";
import { useTopBranch } from "@/lib/branch";
import Filter from "./Filter";

type View = "day" | "week" | "mbrief" | "month" | "list";
const VIEWS: { k: View; l: string }[] = [
  { k: "day", l: "일간" }, { k: "week", l: "주간" }, { k: "mbrief", l: "월" }, { k: "list", l: "목록" },
];
type Col = { id: string; name: string; sub: string };
type Hours = { days: { d: number; open: boolean; s: string; e: string }[] } | null;
const NO_STAFF = "__none";
const ymd = (d: string) => `${d} (${DOW[dow(d)]})`;
const monthEnd = (d: string) => addDays(`${addDays(`${d.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const nowMin = () => { const d = new Date(Date.now() + 9 * 36e5); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, #fff)`;
const manw = (n: number) => (Math.abs(n) >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : n.toLocaleString());
const STATUS_TXT: Record<string, string> = { 완료: "결제 완료", 노쇼: "노쇼", 취소: "취소" };

export default function SchedulePage() {
  const me = useMe();
  const router = useRouter();
  const [branch, setBranch] = useTopBranch(me);
  const [view, setView] = useState<View>("mbrief");
  const [day, setDay] = useState(todayKST());
  const [programs, setPrograms] = useState<Program[]>([]);
  const [staff, setStaff] = useState<Col[]>([]);
  const [rows, setRows] = useState<Rsv[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [hours, setHours] = useState<Hours>(null);
  const [soon, setSoon] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [fSt, setFSt] = useState<string[]>([]);
  const [fStaff, setFStaff] = useState<string[]>([]);
  const [fProg, setFProg] = useState<string[]>([]);
  // 현황보드 열고 닫기 (기억해 둬요)
  const [panel, setPanel] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("rsv.panel") === "1") setPanel(true); } catch {} }, []);
  // 월 칸에 마우스를 올리면 뜨는 예약 정보
  const [hov, setHov] = useState<{ r: Rsv; x: number; y: number } | null>(null);
  const togglePanel = () => { setPanel((v) => { try { localStorage.setItem("rsv.panel", v ? "0" : "1"); } catch {} return !v; }); };
  const [now, setNow] = useState(nowMin());
  // 예약 | 매출 보기 (시안 오른쪽 위). 매출을 못 보면 daySales = null
  const [mode, setMode] = useState<"rsv" | "sales">("rsv");
  const [salesRows, setSalesRows] = useState<{ day: string; customer_name: string; kind: string | null; amount: number }[] | null>(null);
  const daySales = useMemo(() => {
    if (!salesRows) return null;
    const m = new Map<string, number>();
    salesRows.forEach((s) => m.set(s.day, (m.get(s.day) ?? 0) + Number(s.amount ?? 0)));
    return m;
  }, [salesRows]);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => { setMobile(mq.matches); if (mq.matches) setView((v) => (v === "day" || v === "list" ? "week" : v)); };
    f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f);
  }, []);

  const canWrite = has(me, "schedule.reserve", false);
  const today = todayKST();
  const [from, to] = useMemo<[string, string]>(() => {
    if (view === "day") return [day, day];
    if (view === "week") return [weekStart(day), addDays(weekStart(day), 6)];
    return [`${day.slice(0, 8)}01`, monthEnd(day)];
  }, [view, day]);

  useEffect(() => { const t = setInterval(() => setNow(nowMin()), 60e3); return () => clearInterval(t); }, []);

  useEffect(() => {
    let on = true;
    Promise.all([
      sb.rpc("rsv_program_list", { p_branch: branch }),
      sb.from("staff_accounts").select("id,name,title,status").eq("branch", branch).eq("status", "active").order("name"),
      sb.rpc("settings_get", { p_branch: branch }),
      sb.rpc("membership_holdings", { p_branch: branch, p_filter: "soon" }),
    ]).then(([p, s, h, m]) => {
      if (!on) return;
      setPrograms((p.data ?? []) as Program[]);
      setStaff(((s.data ?? []) as { id: string; name: string; title: string | null }[]).map((x) => ({ id: x.id, name: x.name, sub: x.title ?? "" })));
      setHours((h.data as { hours: Hours } | null)?.hours ?? null);
      setSoon(new Set(((m.data?.rows ?? []) as { customer_key: string }[]).map((r) => r.customer_key)));
    });
    return () => { on = false; };
  }, [branch]);

  const load = useCallback(async () => {
    setLoading(true);
    const [b, h] = await Promise.all([
      sb.rpc("rsv_board", { p_branch: branch, p_from: from, p_to: to }),
      sb.rpc("rsv_holiday_list", { p_branch: branch, p_from: from, p_to: to }),
    ]);
    setErr(b.error?.message ?? h.error?.message ?? "");
    setRows((b.data ?? []) as Rsv[]);
    setHolidays((h.data ?? []) as Holiday[]);
    setLoading(false);
  }, [branch, from, to]);
  useEffect(() => { load(); }, [load]);
  // 날짜 칸의 'N건 · 117만' 매출 (sales_list, 권한 없으면 숨김)
  useEffect(() => {
    if (mobile) return;
    let on = true;
    const f = `${day.slice(0, 8)}01`;
    sb.rpc("sales_list", { p_tab: "all", p_from: f, p_to: monthEnd(day), p_branch: branch, p_staff: null, p_q: null, p_customer_key: null, p_kinds: null, p_limit: 2000, p_offset: 0 })
      .then(({ data, error }) => { if (on) setSalesRows(error ? null : ((data ?? []) as { day: string; customer_name: string; kind: string | null; amount: number }[]).filter((x) => x.day)); });
    return () => { on = false; };
  }, [branch, day.slice(0, 7), mobile]); // eslint-disable-line react-hooks/exhaustive-deps

  const progMap = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
  const staffName = useCallback((id: string) => staff.find((s) => s.id === id)?.name
    ?? rows.find((r) => r.staff_id === id)?.staff_name ?? "담당 미정", [staff, rows]);
  const holidayOf = (d: string) => holidays.find((h) => h.day === d);
  const dayRows = useMemo(() => rows.filter((r) => r.day === day), [rows, day]);
  const shown = useMemo(() => rows.filter((r) => (!fSt.length || fSt.includes(r.status))
    && (!fStaff.length || fStaff.includes(r.staff_id || NO_STAFF)) && (!fProg.length || fProg.includes(r.program_id ?? "")))
    .sort((a, b) => a.day.localeCompare(b.day) || a.start_time.localeCompare(b.start_time)), [rows, fSt, fStaff, fProg]);

  // 영업시간: 설정 › 업무시간 (없으면 09~21시)
  const [dStart, dEnd] = useMemo(() => {
    const ds = hours?.days?.filter((x) => x.open && (view !== "day" || x.d === dow(day))) ?? [];
    let s = ds.length ? Math.min(...ds.map((x) => toMin(x.s))) : 9 * 60;
    let e = ds.length ? Math.max(...ds.map((x) => toMin(x.e))) : 21 * 60;
    rows.forEach((r) => { const m = toMin(r.start_time); s = Math.min(s, m); e = Math.max(e, m + r.minutes); });
    return [Math.floor(s / 60) * 60, Math.ceil(e / 60) * 60];
  }, [hours, view, day, rows]);
  const slots = useMemo(() => Array.from({ length: (dEnd - dStart) / STEP }, (_, i) => dStart + i * STEP), [dStart, dEnd]);

  // 일간 열 = 담당자 (예약에만 있는 담당자, 담당 미정도 열로)
  const staffCols = useMemo(() => {
    const cols = [...staff];
    dayRows.forEach((r) => {
      const id = r.staff_id || NO_STAFF;
      if (!cols.some((c) => c.id === id)) cols.push({ id, name: id === NO_STAFF ? "담당 미정" : r.staff_name ?? "담당자", sub: "" });
    });
    const out = cols.length ? cols : [{ id: NO_STAFF, name: "담당 미정", sub: "" }];
    return !fStaff.length ? out : out.filter((c) => fStaff.includes(c.id));
  }, [staff, dayRows, fStaff]);


  const openNew = (d: string, start: number, staffId?: string) => {
    if (!canWrite) return;
    setDraft({ day: d, start_time: hhmm(start), program_id: "", staff_id: staffId && staffId !== NO_STAFF ? staffId : undefined });
  };
  // 상단 메뉴 '+ 새 예약' (시안 1120): 다른 화면에서 오면 ?new=1, 예약 화면에 있으면 이벤트로 열어요
  const newRef = useRef(openNew); newRef.current = () => openNew(today, Math.max(dStart, Math.ceil(now / 30) * 30));
  useEffect(() => {
    const go = () => (newRef.current as () => void)();
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      // 해피콜 '예약 잡음'에서 오면 고객을 미리 골라 둬요
      let pre: { customer_key?: string; customer_name?: string } | null = null;
      try { pre = JSON.parse(sessionStorage.getItem("rsv:prefill") || "null"); sessionStorage.removeItem("rsv:prefill"); } catch { pre = null; }
      setTimeout(() => {
        go();
        if (pre?.customer_key) setDraft((d) => d && { ...d, customer_key: pre!.customer_key, customer_name: pre!.customer_name ?? "" });
      }, 0);
      window.history.replaceState(null, "", "/schedule");
    }
    window.addEventListener("rsv:new", go);
    return () => window.removeEventListener("rsv:new", go);
  }, []);
  useEffect(() => {
    if (!draft) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDraft(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [draft]);
  const move = (n: number) => {
    if (view === "day") return setDay(addDays(day, n));
    if (view === "week") return setDay(addDays(day, n * 7));
    const x = new Date(`${day.slice(0, 8)}01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n);
    setDay(x.toISOString().slice(0, 10));
  };
  const title = view === "day" ? ymd(day) : view === "week" ? `${from} ~ ${to.slice(5)}` : `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월`;
  const search = () => q.trim() && router.push(`/customers?q=${encodeURIComponent(q.trim())}`);

  // 예약 블록
  const block = (r: Rsv, top: number, h: number, lane: number, n: number, showStaff: boolean) => {
    const p = progMap.get(r.program_id ?? "");
    const c = p?.color ?? "#8A8A8A";
    const name = r.kind === "고객" ? r.customer_name : r.title || p?.name || r.kind;
    const cancel = r.status === "취소", noshow = r.status === "노쇼", done = r.status === "완료";
    const sel = draft?.id === r.id;
    return (
      <button key={r.id} className="rv" onClick={(e) => { e.stopPropagation(); setDraft({ ...r }); }}
        title={`${r.start_time} ${name} · ${p?.name ?? ""}${r.staff_name ? ` · 담당 ${r.staff_name}` : ""}${r.memo ? `\n${r.memo}` : ""}`}
        style={{
          top: top + 2, height: h, left: `calc(${(lane / n) * 100}% + 4px)`, width: `calc(${100 / n}% - 8px)`,
          background: cancel ? "#fff" : tint(c, 13),
          border: cancel ? "1px dashed var(--st-cancel-line)" : "0", borderLeft: `3px solid ${cancel ? "var(--st-cancel-line)" : c}`,
          outline: sel ? "2px solid var(--ink)" : undefined, outlineOffset: -2, opacity: done ? "var(--st-done-opacity)" as unknown as number : undefined,
        }}>
        <div className="l1 num" style={{ paddingRight: noshow || cancel ? 40 : 0 }}><b>{r.start_time.slice(0, 5)} {name}</b>{done && <span> · 완료</span>}{h < 40 && <span> {p?.short || p?.name}</span>}</div>
        {h >= 40 && <div className="l2">{p?.short || p?.name || r.kind} {r.minutes}분{showStaff && r.staff_name ? ` · ${r.staff_name}` : ""}</div>}
        {(noshow || cancel) && <span className={`tag ${noshow ? "ns" : "cc"}`}>{STATUS_TXT[r.status]}</span>}
        {!noshow && !cancel && r.customer_key && soon.has(r.customer_key) && <i className="dot" title="회원권 만료 예정" />}
      </button>
    );
  };

  // 시간 격자 (일간: 담당자 열 / 주간: 요일 열)
  const grid = () => {
    const cols = view === "day"
      ? staffCols.map((c) => ({ key: c.id, day, head: c.name, sub: c.sub, staffId: c.id }))
      : Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => ({
        key: d, day: d, head: `${Number(d.slice(8))} ${DOW[dow(d)]}`, sub: `예약 ${rows.filter((r) => r.day === d && (r.status === "예약" || r.status === "완료")).length}`, staffId: undefined as string | undefined,
      }));
    const gridH = slots.length * ROW_H;
    return (
      <div className="tg" style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(${view === "day" ? 120 : 110}px, 1fr))` }}>
        <div className="tg-h tg-corner" />
        {cols.map((c) => {
          const hol = holidayOf(c.day);
          return (
            <div key={c.key} className="tg-h">
              <b style={{ color: view === "week" && (hol || c.day === today) ? "var(--red)" : undefined }}>{c.head}</b>
              <span>{hol && view === "week" ? "휴무" : c.sub || " "}</span>
            </div>
          );
        })}
        <div className="tg-axis" style={{ height: gridH }}>
          {slots.filter((m) => m % 60 === 0).map((m) => (
            <div key={m} className="num" style={{ top: ((m - dStart) / STEP) * ROW_H }}>{hhmm(m)}</div>
          ))}
        </div>
        {cols.map((c) => {
          const off = !!holidayOf(c.day);
          const items = shown.filter((r) => r.day === c.day && (view === "week" || (r.staff_id || NO_STAFF) === c.staffId));
          const placed = lanes(items.map((r) => ({ r, start: toMin(r.start_time), minutes: r.minutes })));
          const showNow = c.day === today && now >= dStart && now <= dEnd;
          return (
            <div key={c.key} className="tg-col" style={{ height: gridH, background: off ? "var(--bg-sub)" : undefined }}>
              {slots.map((m) => (
                <div key={m} className={`tg-slot ${m % 60 ? "half" : ""}`} style={{ top: ((m - dStart) / STEP) * ROW_H, cursor: canWrite && !off ? "pointer" : "default" }}
                  onClick={() => !off && openNew(c.day, m, c.staffId)} title={canWrite && !off ? `${hhmm(m)} 예약 등록` : undefined} />
              ))}
              {showNow && <div className="tg-now" style={{ top: ((now - dStart) / STEP) * ROW_H }} />}
              {placed.map(({ r, start, minutes, lane, lanes: n }) => {
                const top = ((start - dStart) / STEP) * ROW_H;
                const h = Math.max((minutes / STEP) * ROW_H - 4, 26);
                // 주간에서 3개 이상 겹치면 칸이 너무 좁아져요: 2칸까지만 나누고 나머지는 +N 으로
                if (view === "week" && n > 2) {
                  if (lane > 1) return null;
                  const more = lane === 1 ? placed.filter((x) => x.lane > 1 && x.start < start + minutes && x.start + x.minutes > start).length : 0;
                  return <div key={r.id}>{block(r, top, h, lane, 2, true)}{more > 0 && <span className="rv-more num" style={{ top: top + h - 16 }}>+{more}</span>}</div>;
                }
                return block(r, top, h, lane, n, view === "week");
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // 월 / 월 간략
  const month = (brief = true) => {
    const first = `${day.slice(0, 8)}01`;
    const start = addDays(first, -dow(first));
    const last = monthEnd(day);
    const weeks = Math.ceil((dow(first) + Number(last.slice(8))) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    return (
      <div className="mg">
        {["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"].map((d, i) => <div key={d} className={`mg-h ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>{mobile ? d[0] : d}</div>)}
        {cells.map((d) => {
          const inM = d.slice(0, 7) === day.slice(0, 7);
          const list = shown.filter((r) => r.day === d);
          const act = list.filter((r) => r.status === "예약" || r.status === "완료");
          const hol = holidayOf(d);
          return (
            <div key={d} className={`mg-c ${inM ? "" : "out"} ${d === today ? "td" : ""} ${draft && !draft.id && draft.day === d ? "pick" : ""}`} onClick={() => { if (!inM || hol) return; openNew(d, Math.max(dStart, 10 * 60)); }} title={inM && !hol && canWrite ? "이 날짜로 새 예약" : undefined}>
              <div className="mg-d num" style={{ color: hol || dow(d) === 0 ? "var(--red)" : dow(d) === 6 ? "var(--blue, #2463d1)" : undefined }}>
                <i>{Number(d.slice(8))}</i>{hol && <span className="mg-hol">휴무</span>}
                {inM && !mobile && act.length > 0 && <span className="mg-cnt">{act.length}건</span>}
              </div>
              {inM && brief && mobile && (
                <div className="mg-chips num">
                  {list.map((r) => {
                    const p = progMap.get(r.program_id ?? "");
                    const off = r.status === "취소" || r.status === "노쇼";
                    return <div key={r.id} style={{ background: off ? "var(--bg-sub)" : tint(p?.color ?? "#8A8A8A", 22), color: off ? "var(--ink-4)" : undefined }}>{r.start_time.slice(0, 5)} {r.kind === "고객" ? r.customer_name : r.title || p?.short}</div>;
                  })}
                </div>
              )}
              {inM && !mobile && (
                <div className="mg-list num">
                  {list.map((r) => {
                    const p = progMap.get(r.program_id ?? "");
                    const c = p?.color ?? "#8A8A8A";
                    const off = r.status === "취소" || r.status === "노쇼";
                    const done = r.status === "완료";
                    const nm = r.kind === "고객" ? r.customer_name : r.title || p?.name;
                    return (
                      <div key={r.id} className={`mg-row ${off ? "off" : ""} ${done ? "done" : ""}`}
                        style={off ? undefined : { background: tint(c, done ? 16 : 50), borderLeftColor: c }}
                        onClick={(e) => { e.stopPropagation(); setHov(null); setDraft({ ...r }); }}
                        onMouseEnter={(e) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setHov({ r, x: b.left, y: b.bottom }); }}
                        onMouseLeave={() => setHov(null)}>
                        {off && <span className={`tag ${r.status === "노쇼" ? "ns" : "cc"}`}>{r.status}</span>}
                        <b>{r.start_time.slice(0, 5)}</b> {nm}{r.kind === "고객" && p ? `(${p.short || p.name})` : ""}{done ? " ✓" : ""}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── PC (v3 확정 시안 U-PC-RSV-1_예약표대표) ──
  const nameOf = (r: Rsv) => (r.kind === "고객" ? r.customer_name : r.title || progMap.get(r.program_id ?? "")?.name || r.kind);
  const pname = (r: Rsv) => { const p = progMap.get(r.program_id ?? ""); return p?.short || p?.name || ""; };

  // 월 간략 / 월: 하루 예약을 전부 보여요 (대표님 결정: "+N건 더보기" 없음)
  const month3 = (two: boolean) => {
    const first = `${day.slice(0, 8)}01`;
    const start = addDays(first, -((dow(first) + 6) % 7)); // 월요일 시작
    const last = monthEnd(day);
    const weeks = Math.ceil((((dow(first) + 6) % 7) + Number(last.slice(8))) / 7);
    const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
    return (
      <div className="mg3">
        {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => <div key={d} className={`mh ${i === 5 ? "sat" : i === 6 ? "sun" : ""}`}>{d}</div>)}
        {cells.map((d) => {
          const inM = d.slice(0, 7) === day.slice(0, 7);
          const hol = holidayOf(d);
          const list = shown.filter((r) => r.day === d);
          const won = daySales?.get(d) ?? 0;
          if (!inM) return <div key={d} className="dc dim"><div className="dh"><span className="dn num">{Number(d.slice(8))}</span></div></div>;
          return (
            <div key={d} className={`dc ${d === today ? "today" : ""} ${draft && !draft.id && draft.day === d ? "pick" : ""}`}
              onClick={() => { if (!hol) openNew(d, Math.max(dStart, 10 * 60)); }}>
              <div className="dh">
                <span className="dn num">{Number(d.slice(8))}</span>
                {hol ? <span className="sm"><span className="bdg">{Ico.off}휴무</span></span>
                  : (list.length > 0 || won > 0) && <span className="sm num">{list.length}건{daySales && won ? ` · ${manw(won)}` : ""}</span>}
              </div>
              {mode === "sales" ? (salesRows ?? []).filter((s) => s.day === d).map((s, i) => (
                <div key={i} className="blk sale num"><span>{s.customer_name || s.kind || "매출"}</span><b>{manw(s.amount)}</b></div>
              )) : list.map((r) => {
                const p = progMap.get(r.program_id ?? "");
                const c = p?.color ?? "#8A8A8A";
                const off = r.status === "취소" || r.status === "노쇼";
                const past = r.status === "완료" || d < today;
                const open = (e: React.MouseEvent) => { e.stopPropagation(); setHov(null); setDraft({ ...r }); };
                const hover = (e: React.MouseEvent) => { const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setHov({ r, x: b.left, y: b.bottom }); };
                if (off) return (
                  <button key={r.id} className="blk cx num" onClick={open} onMouseEnter={hover} onMouseLeave={() => setHov(null)}>
                    <span className={`bt ${r.status === "노쇼" ? "ns" : "cc"}`}>{r.status}</span>{r.start_time.slice(0, 5)} {nameOf(r)}
                  </button>
                );
                const st = { background: past ? tint(c, 25) : c, color: past ? "#292929" : "#fff" };
                return two ? (
                  <button key={r.id} className="blk two num" style={st} onClick={open} onMouseEnter={hover} onMouseLeave={() => setHov(null)}>
                    <span>{r.start_time.slice(0, 5)} {nameOf(r)}</span><span>{pname(r)}{r.staff_name ? ` · ${r.staff_name}` : ""}</span>
                  </button>
                ) : (
                  <button key={r.id} className="blk num" style={st} onClick={open} onMouseEnter={hover} onMouseLeave={() => setHov(null)}>
                    {r.start_time.slice(0, 5)} {nameOf(r)} {r.kind === "고객" ? pname(r) : ""}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // 일간(직원별) / 주간(요일별) 시간표 — 시안 업무메모 화면의 표 (흰 블록·회색 테두리). 40분 관리도 두 줄이 보이게 1시간 = 72px
  const HOUR = 72;
  const timeGrid = () => {
    const days7 = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    const cols = view === "day"
      ? staffCols.map((c) => ({ key: c.id, day, head: c.name, sub: `${dayRows.filter((r) => (r.staff_id || NO_STAFF) === c.id && r.status !== "취소").length}건`, staffId: c.id as string | undefined }))
      : days7.map((d) => ({ key: d, day: d, head: `${Number(d.slice(8))} (${DOW[dow(d)]})`, sub: holidayOf(d) ? "휴무" : `${rows.filter((r) => r.day === d && r.status !== "취소").length}건`, staffId: undefined as string | undefined }));
    const hours = Array.from({ length: (dEnd - dStart) / 60 }, (_, i) => dStart + i * 60);
    const H = hours.length * HOUR;
    const y = (m: number) => ((m - dStart) / 60) * HOUR;
    return (
      <div className="dg" style={{ gridTemplateColumns: `78px repeat(${cols.length}, minmax(${view === "day" ? 140 : 110}px, 1fr))` }}>
        <div className="dg-h" style={{ borderLeft: 0 }} />
        {cols.map((c) => <div key={c.key} className="dg-h" style={{ color: view === "week" && (c.day === today) ? "var(--red)" : undefined }}>{c.head}<span>{c.sub}</span></div>)}
        <div className="dg-axis" style={{ height: H }}>{hours.map((m) => <div key={m} className="num" style={{ top: y(m) }}>{hhmm(m)}</div>)}</div>
        {cols.map((c) => {
          const off = !!holidayOf(c.day);
          const items = shown.filter((r) => r.day === c.day && (view === "week" || (r.staff_id || NO_STAFF) === c.staffId));
          const placed = lanes(items.map((r) => ({ r, start: toMin(r.start_time), minutes: r.minutes })));
          return (
            <div key={c.key} className="dg-col" style={{ height: H, background: off ? "#ECECEF" : undefined }}>
              {hours.map((m) => [m, m + 30]).flat().map((m) => (
                <div key={m} className={`dg-slot ${m % 60 ? "half" : ""}`} style={{ top: y(m), height: HOUR / 2, cursor: canWrite && !off ? "pointer" : "default" }}
                  onClick={() => !off && openNew(c.day, m, c.staffId)} title={canWrite && !off ? `${hhmm(m)} 예약 등록` : undefined} />
              ))}
              {placed.map(({ r, start, minutes, lane, lanes: n }) => {
                const off2 = r.status === "취소" || r.status === "노쇼";
                const done = r.status === "완료";
                const sub = [pname(r) || r.kind, done ? "완료" : off2 ? r.status : view === "week" ? r.staff_name : ""].filter(Boolean).join(" · ");
                return (
                  <button key={r.id} className={`rb ${done ? "done" : ""} ${off2 ? "off" : ""} ${draft?.id === r.id ? "sel" : ""}`}
                    style={{ top: y(start) + 2, height: Math.max((minutes / 60) * HOUR - 4, 42), left: `calc(${(lane / n) * 100}% + 6px)`, width: `calc(${100 / n}% - 12px)` }}
                    onClick={(e) => { e.stopPropagation(); setDraft({ ...r }); }}
                    title={`${r.start_time.slice(0, 5)} ${nameOf(r)} · ${pname(r)}${r.staff_name ? ` · 담당 ${r.staff_name}` : ""}${r.memo ? `\n${r.memo}` : ""}`}>
                    <b className="num">{r.start_time.slice(0, 5)} {nameOf(r)}</b><span>{sub}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const listView = () => (
    <table className="lt">
      <thead><tr><th>날짜</th><th>시간</th><th>고객 · 내용</th><th>관리</th><th>담당</th><th>상태</th></tr></thead>
      <tbody>
        {shown.map((r) => {
          const p = progMap.get(r.program_id ?? "");
          return (
            <tr key={r.id} onClick={() => setDraft({ ...r })}>
              <td className="num">{Number(r.day.slice(5, 7))}.{r.day.slice(8)} ({DOW[dow(r.day)]})</td>
              <td className="num">{r.start_time.slice(0, 5)}</td>
              <td><b>{nameOf(r)}</b></td>
              <td><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 4, marginRight: 6, background: p?.color ?? "#8A8A8A" }} />{p?.name ?? "-"} <span className="cap">{r.minutes}분</span></td>
              <td>{r.staff_name ?? "-"}</td>
              <td><span className={`bdg ${r.status === "완료" ? "grn" : r.status === "취소" ? "red" : ""}`} style={r.status === "노쇼" ? { background: "var(--ns-bg)", color: "var(--ns-ink)" } : undefined}>{STATUS_TXT[r.status] ?? "예약"}</span></td>
            </tr>
          );
        })}
        {shown.length === 0 && !loading && <tr><td colSpan={6} className="cap" style={{ textAlign: "center" }}>이 기간 예약이 없어요</td></tr>}
      </tbody>
    </table>
  );

  // 모바일 (시안 M11 7차 후): 주간 칸 목록
  const wkNo = (d: string) => { const f = `${d.slice(0, 8)}01`; return Math.ceil((Number(d.slice(8)) + ((dow(f) + 6) % 7)) / 7); };
  const mweek = () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
    return (
      <div className="mw">
        {days.map((d) => {
          const hol = holidayOf(d);
          const list = shown.filter((r) => r.day === d);
          return (
            <div key={d} className={`mw-col ${d === today ? "td" : ""}`} onClick={() => canWrite && !hol && openNew(d, Math.max(dStart, 10 * 60))}>
              <div className="mw-h"><span>{DOW[dow(d)]}</span><b className="num">{Number(d.slice(8))}</b><span>{hol ? "휴무" : `${list.filter((r) => r.status === "예약" || r.status === "완료").length}건`}</span></div>
              {hol && <div className="mw-off">휴무</div>}
              {list.map((r) => {
                const p = progMap.get(r.program_id ?? "");
                const off = r.status === "취소" || r.status === "노쇼";
                const past = r.status === "완료" || d < today;
                return (
                  <button key={r.id} className={`mw-it num ${off ? "off" : ""}`} onClick={(e) => { e.stopPropagation(); setDraft({ ...r }); }}
                    style={off ? undefined : { background: tint(p?.color ?? "#8A8A8A", past ? 22 : 100), color: past ? "var(--ink)" : "#fff" }}>
                    {off && <span className={`tag ${r.status === "노쇼" ? "ns" : "cc"}`}>{r.status}</span>}
                    <span>{r.start_time.slice(0, 5)}</span>
                    <span>{r.kind === "고객" ? r.customer_name : r.title || p?.short}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };
  if (mobile) {
    return (
      <div className="rsv-m">
        <header className="top">
          <h1>예약</h1>
          <div style={{ flex: 1 }} />
          <select className="sel" style={{ width: 112 }} value={branch} disabled={me.tier !== "owner"} onChange={(e) => setBranch(e.target.value)}>
            {(me.tier === "owner" ? BRANCHES : [me.branch]).map((b) => <option key={b}>{b}</option>)}
          </select>
          {canWrite && <button className="btn p sm" onClick={() => openNew(today, Math.max(dStart, Math.ceil(now / 30) * 30))}>+ 예약</button>}
        </header>
        <div className="rm-bar">
          <button className="btn t sm" onClick={() => move(-1)} aria-label="이전">‹</button>
          <b className="num">{view === "week" ? `${Number(from.slice(5, 7))}월 ${wkNo(from)}주` : `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월`}</b>
          <button className="btn t sm" onClick={() => move(1)} aria-label="다음">›</button>
          <div style={{ flex: 1 }} />
          <button className="btn t sm" onClick={() => setDay(today)}>오늘</button>
        </div>
        <div className="rm-bar">
          <div className="seg">
            <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>주간</button>
            <button className={view === "mbrief" ? "on" : ""} onClick={() => setView("mbrief")}>월</button>
          </div>
          <Filter label="직원" value={fStaff} onChange={setFStaff} opts={staff.map((x) => ({ v: x.id, l: x.name }))} />
        </div>
        {err && <p style={{ color: "var(--red)", padding: "0 16px" }}>{err}</p>}
        {view === "week" ? mweek() : month(true)}
        {draft && (
          <RsvDrawer branch={branch} draft={draft} programs={programs} rows={rows} canWrite={canWrite}
            onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
        )}
      </div>
    );
  }

  const PCV: { k: View; l: string }[] = [{ k: "mbrief", l: "월 간략" }, { k: "month", l: "월" }, { k: "week", l: "주간" }, { k: "day", l: "일간" }, { k: "list", l: "목록" }];
  const isMonth = view === "mbrief" || view === "month";
  return (
    <div className="rv3">
      <header className="rv3-sub">
        <h1>예약</h1>
        <div className="sg">{PCV.map((v) => <button key={v.k} className={view === v.k ? "on" : ""} onClick={() => setView(v.k)}>{v.l}</button>)}</div>
        <div className="r">
          <Sel icon={Ico.user} label="직원" value={fStaff} onChange={setFStaff} opts={[...staff.map((x) => ({ v: x.id, l: x.name })), { v: NO_STAFF, l: "담당 미정" }]} />
          <Sel icon={Ico.filter} label="상태" value={fSt} onChange={setFSt} opts={[{ v: "예약", l: "예약" }, { v: "완료", l: "방문 완료" }, { v: "노쇼", l: "노쇼" }, { v: "취소", l: "취소" }]} />
          <div className="sg">
            <button className={mode === "rsv" ? "on" : ""} onClick={() => setMode("rsv")}>예약</button>
            <button className={mode === "sales" ? "on" : ""} onClick={() => setMode("sales")} disabled={daySales === null} title={daySales === null ? "매출을 볼 권한이 없어요" : undefined}>매출</button>
          </div>
        </div>
      </header>
      <div className="rv3-page">
        <div className={`rv3-wrap ${draft ? "dock" : ""}`}>
          <Panel branch={branch} day={view === "day" ? day : today} dayRows={view === "day" ? dayRows : rows.filter((r) => r.day === today)} staffName={staffName} />
          <section className="card rv3-cal">
            <div className="tool">
              {view === "day" ? (
                <>
                  <button className="ib" onClick={() => move(-1)} aria-label="이전">{Ico.left}</button>
                  <span className="d num">{Number(day.slice(5, 7))}.{day.slice(8)} ({DOW[dow(day)]})</span>
                  <button className="ib" onClick={() => move(1)} aria-label="다음">{Ico.chev}</button>
                </>
              ) : (
                <>
                  <button className="ib" onClick={() => move(-1)} aria-label="이전">{Ico.left}</button>
                  <h2 className="num">{view === "week" ? `${Number(from.slice(5, 7))}.${from.slice(8)} – ${Number(to.slice(5, 7))}.${to.slice(8)}` : `${day.slice(0, 4)}년 ${Number(day.slice(5, 7))}월`}</h2>
                  <button className="ib" onClick={() => move(1)} aria-label="다음">{Ico.chev}</button>
                </>
              )}
              <button className="btn3 sm" onClick={() => setDay(today)}>오늘</button>
              {view === "day" && holidayOf(day) && <span className="bdg">{Ico.off}지점 휴무일</span>}
              <span style={{ marginLeft: "auto" }} className="cap">빈 곳 클릭 = 새 예약 · 예약 클릭 = 수정</span>
            </div>
            {isMonth && (
              <div className="leg">
                {programs.filter((p) => !p.parent_id).map((p) => <span key={p.id}><i style={{ background: p.color ?? "#8A8A8A" }} />{p.short || p.name}</span>)}
                <span style={{ marginLeft: "auto" }}>연한 색 = 지난 예약 · 방문 완료</span>
                <span><span className="bdg">취소 · 노쇼</span></span>
              </div>
            )}
            {err && <p style={{ color: "var(--red)", padding: "8px 16px" }}>{err}</p>}
            {view === "mbrief" && month3(false)}
            {view === "month" && month3(true)}
            {(view === "day" || view === "week") && timeGrid()}
            {view === "list" && listView()}
          </section>
          {draft && (
            <aside className="rsv-dock">
              <RsvDrawer key={`${draft.id ?? "new"}-${draft.day}-${draft.start_time}-${draft.staff_id ?? ""}`}
                docked branch={branch} draft={draft}
                programs={programs} rows={rows} canWrite={canWrite}
                onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
            </aside>
          )}
        </div>
      </div>
      {hov && (
        <div className="mg-pop" style={{ left: Math.min(hov.x, (typeof window !== "undefined" ? window.innerWidth : 1600) - 300), top: hov.y + 4 }}>
          <b>{hov.r.kind === "고객" ? `${hov.r.customer_name}님 예약` : hov.r.title || "일정"}</b>
          <dl>
            <dt>시간</dt><dd className="num">{hov.r.day.slice(5).replace("-", ".")} ({DOW[dow(hov.r.day)]}) {hov.r.start_time.slice(0, 5)} · {hov.r.minutes}분</dd>
            <dt>관리</dt><dd>{progMap.get(hov.r.program_id ?? "")?.name ?? "-"}</dd>
            <dt>담당</dt><dd>{hov.r.staff_name ?? "담당 미정"}</dd>
            <dt>상태</dt><dd>{STATUS_TXT[hov.r.status] ?? "예약"}</dd>
            {hov.r.memo && <><dt>메모</dt><dd>{hov.r.memo}</dd></>}
          </dl>
        </div>
      )}
    </div>
  );
}

// 시안의 '직원 전체 ▾' · '상태 전체 ▾' 버튼 (여러 개 고르기)
function Sel({ icon, label, opts, value, onChange, single }: { icon: React.ReactNode; label: string; opts: { v: string; l: string }[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const names = opts.filter((o) => value.includes(o.v)).map((o) => o.l);
  const text = single ? label : !names.length ? `${label} 전체` : names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}`;
  return (
    <div className="rsel" ref={ref}>
      <button className={!single && names.length ? "on" : ""} onClick={() => setOpen(!open)} aria-expanded={open}>{icon}{text}{Ico.chevD}</button>
      {open && (
        <div className="pop">
          {!single && <label><input type="checkbox" checked={!names.length} onChange={() => onChange([])} />전체</label>}
          {opts.map((o) => (
            <label key={o.v}>
              <input type={single ? "radio" : "checkbox"} checked={value.includes(o.v)}
                onChange={() => { if (single) { onChange([o.v]); setOpen(false); } else onChange(value.includes(o.v) ? value.filter((x) => x !== o.v) : [...value, o.v]); }} />{o.l}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
