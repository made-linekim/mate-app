"use client";
// 예약 (메라 시안 P01): 왼쪽 현황보드 + 오른쪽 예약표(일간=담당자 열)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import {
  type Program, type Rsv, type Holiday,
  STEP, ROW_H, toMin, todayKST, addDays, dow, DOW, weekStart, lanes,
} from "@/lib/schedule";
import RsvDrawer, { type Draft } from "./RsvDrawer";
import Panel from "./Panel";
import Filter from "./Filter";

type View = "day" | "week" | "mbrief" | "list";
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
const STATUS_TXT: Record<string, string> = { 완료: "결제 완료", 노쇼: "노쇼", 취소: "취소" };

export default function SchedulePage() {
  const me = useMe();
  const router = useRouter();
  const [branch, setBranch] = useState(me.branch);
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
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const f = () => { setMobile(mq.matches); if (mq.matches) setView((v) => (v === "day" || v === "list" ? "week" : v)); };
    f(); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f);
  }, []);

  const canWrite = me.tier !== "staff" || !!me.perms?.["schedule.reserve"];
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
                  {list.slice(0, 5).map((r) => {
                    const p = progMap.get(r.program_id ?? "");
                    const off = r.status === "취소" || r.status === "노쇼";
                    return <div key={r.id} style={{ background: off ? "var(--bg-sub)" : tint(p?.color ?? "#8A8A8A", 22), color: off ? "var(--ink-4)" : undefined }}>{r.start_time.slice(0, 5)} {r.kind === "고객" ? r.customer_name : r.title || p?.short}</div>;
                  })}
                  {list.length > 5 && <div className="mg-more">+{list.length - 5}</div>}
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

  const listView = () => (
    <table className="t">
      <thead><tr><th>날짜</th><th>시간</th><th>고객 · 내용</th><th>프로그램</th><th>담당</th><th>상태</th></tr></thead>
      <tbody>
        {shown.map((r) => {
          const p = progMap.get(r.program_id ?? "");
          return (
            <tr key={r.id} onClick={() => setDraft({ ...r })} style={{ cursor: "pointer" }}>
              <td className="num">{r.day.slice(5).replace("-", "/")} ({DOW[dow(r.day)]})</td>
              <td className="num">{r.start_time.slice(0, 5)}</td>
              <td><b>{r.kind === "고객" ? r.customer_name : r.title || r.kind}</b></td>
              <td><span className="lg-sw" style={{ background: p?.color ?? "var(--ink-4)" }} />{p?.name ?? "-"} <span style={{ color: "var(--ink-4)" }}>{r.minutes}분</span></td>
              <td>{r.staff_name ?? "-"}</td>
              <td><span className={`badge ${r.status === "완료" ? "ok" : r.status === "노쇼" ? "warn" : r.status === "취소" ? "em" : ""}`}>{STATUS_TXT[r.status] ?? "예약"}</span></td>
            </tr>
          );
        })}
        {shown.length === 0 && !loading && <tr><td colSpan={6} style={{ color: "var(--ink-3)", textAlign: "center" }}>이번 달 예약이 없어요</td></tr>}
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

  return (
    <div className="rsv">
      <header className="top">
        <h1>예약</h1>
        <span className="sub num">{ymd(today)}</span>
        <div style={{ flex: 1 }} />
        <select className="sel" style={{ width: 128 }} value={branch} disabled={me.tier !== "owner"} onChange={(e) => setBranch(e.target.value)}>
          {(me.tier === "owner" ? BRANCHES : [me.branch]).map((b) => <option key={b}>{b}</option>)}
        </select>
        <input className="inp" style={{ width: 240 }} placeholder="고객 이름 · 뒤 4자리" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        {canWrite && <button className="btn p" onClick={() => openNew(view === "day" ? day : today, Math.max(dStart, Math.ceil(now / 30) * 30))}>+ 새 예약</button>}
      </header>

      <div className={`rsv-body dock ${panel ? "" : "nopanel"}`}>
        {panel && <Panel branch={branch} dayRows={dayRows} staffName={staffName} onClose={togglePanel} />}
        <section className="rsv-main">
          <div className="rsv-bar">
            <button className={`btn sm pn-tg ${panel ? "on" : ""}`} onClick={togglePanel} title={panel ? "현황보드 닫기" : "현황보드 열기"} aria-pressed={panel}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.7" /></svg>
              현황보드 {panel ? "닫기" : "열기"}
            </button>
            <button className="btn sm" onClick={() => move(-1)} aria-label="이전">‹</button>
            <button className="btn sm" onClick={() => move(1)} aria-label="다음">›</button>
            <button className="btn sm" onClick={() => setDay(today)}>오늘</button>
            <div className="rsv-date num">{title}</div>
            <div className="seg" style={{ marginLeft: "auto" }}>
              {VIEWS.map((v) => <button key={v.k} className={view === v.k ? "on" : ""} onClick={() => setView(v.k)}>{v.l}</button>)}
            </div>
          </div>
          {view === "week" && (
            <div className="rsv-strip num">
              {Array.from({ length: Number(monthEnd(day).slice(8)) }, (_, i) => `${day.slice(0, 8)}${String(i + 1).padStart(2, "0")}`).map((d) => (
                <button key={d} onClick={() => setDay(d)}
                  className={`${d === day ? "on" : ""} ${dow(d) === 0 || holidayOf(d) ? "red" : ""} ${view === "week" && d >= from && d <= to && d !== day ? "wk" : ""}`}>
                  {Number(d.slice(8))}
                </button>
              ))}
            </div>
          )}
          <div className="rsv-filters">
            <Filter label="예약 상태" value={fSt} onChange={setFSt}
              opts={[{ v: "예약", l: "예약" }, { v: "완료", l: "결제 완료" }, { v: "노쇼", l: "노쇼" }, { v: "취소", l: "취소" }]} />
            <Filter label="직원" value={fStaff} onChange={setFStaff}
              opts={[...staff.map((x) => ({ v: x.id, l: x.name })), { v: NO_STAFF, l: "담당 미정" }]} />
            <Filter label="프로그램" value={fProg} onChange={setFProg}
              opts={programs.map((x) => ({ v: x.id, l: x.name, sw: x.color }))} />
            {(fSt.length + fStaff.length + fProg.length > 0) && (
              <button className="btn t sm flt-clear" onClick={() => { setFSt([]); setFStaff([]); setFProg([]); }}>
                필터 해제 · {shown.length}건 보는 중
              </button>
            )}
          </div>
          {err && <p style={{ color: "var(--red)", padding: "0 20px" }}>{err}</p>}
          {view === "day" && holidayOf(day) && (
            <div style={{ padding: "0 20px 8px" }}><span className="badge em">지점 휴무일{holidayOf(day)!.reason ? ` · ${holidayOf(day)!.reason}` : ""}</span></div>
          )}
          <div className="rsv-scroll">
            {(view === "day" || view === "week") && grid()}
            {view === "mbrief" && month()}
            {view === "list" && listView()}
          </div>
        </section>
        {/* 오른쪽 예약 입력 (뷰티처럼 늘 열려 있음): 날짜·빈 칸을 누르면 여기 채워져요 */}
        <aside className="rsv-dock">
          {canWrite || draft ? (
            <RsvDrawer key={draft ? `${draft.id ?? "new"}-${draft.day}-${draft.start_time}-${draft.staff_id ?? ""}` : `blank-${today}`}
              docked branch={branch} draft={draft ?? { day: today, start_time: hhmm(Math.max(dStart, Math.ceil(now / 30) * 30)), program_id: "" }}
              programs={programs} rows={rows} canWrite={canWrite}
              onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
          ) : <div className="rd-empty">예약을 누르면 여기에서 볼 수 있어요</div>}
        </aside>
      </div>
      {hov && (
        <div className="mg-pop" style={{ left: Math.min(hov.x, (typeof window !== "undefined" ? window.innerWidth : 1600) - 300), top: hov.y + 4 }}>
          <b>{hov.r.kind === "고객" ? `${hov.r.customer_name}님 예약` : hov.r.title || "일정"}</b>
          <dl>
            <dt>시간</dt><dd className="num">{hov.r.day.slice(5).replace("-", ".")} ({DOW[dow(hov.r.day)]}) {hov.r.start_time.slice(0, 5)} · {hov.r.minutes}분</dd>
            <dt>관리</dt><dd>{progMap.get(hov.r.program_id ?? "")?.name ?? "-"}</dd>
            <dt>담당</dt><dd>{hov.r.staff_name ?? "담당 미정"}</dd>
            <dt>상태</dt><dd><span className={`badge ${hov.r.status === "완료" ? "ok" : hov.r.status === "노쇼" ? "warn" : hov.r.status === "취소" ? "em" : ""}`}>{STATUS_TXT[hov.r.status] ?? "예약"}</span></dd>
            {hov.r.memo && <><dt>메모</dt><dd>{hov.r.memo}</dd></>}
          </dl>
        </div>
      )}
    </div>
  );
}
