"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import {
  type Program, type Rsv, type Holiday, type RStatus,
  SLOTS, DAY_START, DAY_END, STEP, ROW_H, toMin, slotLabel, todayKST, addDays, dow, DOW, weekStart, fmtDay,
  usedAt, lanes, STATUS_STYLE,
} from "@/lib/schedule";
import RsvDrawer, { type Draft } from "./RsvDrawer";

type View = "day" | "week";
const GROUPS = [
  { k: "all", l: "전체" }, { k: "시술", l: "시술" }, { k: "체험", l: "체험" }, { k: "상담", l: "상담" }, { k: "업무", l: "업무·행사" },
];
const ST_FILTERS: { k: "all" | RStatus; l: string }[] = [
  { k: "all", l: "전체" }, { k: "예약", l: "예약" }, { k: "완료", l: "결제완료" }, { k: "노쇼", l: "노쇼" }, { k: "취소", l: "취소" },
];
const WORK_COL = "__work";
const isWork = (p?: Program | null) => !!p && (p.grp === "업무" || p.grp === "행사");

export default function SchedulePage() {
  const me = useMe();
  const [branch, setBranch] = useState(me.branch);
  const [view, setView] = useState<View>("day");
  const [day, setDay] = useState(todayKST());
  const [grp, setGrp] = useState("all");
  const [st, setSt] = useState<"all" | RStatus>("all");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [rows, setRows] = useState<Rsv[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);

  const canWrite = me.tier !== "staff" || !!me.perms?.["schedule.reserve"];
  const from = view === "day" ? day : weekStart(day);
  const to = view === "day" ? day : addDays(from, 6);

  useEffect(() => {
    sb.rpc("rsv_program_list", { p_branch: branch }).then(({ data, error }) => {
      if (error) setErr(error.message);
      setPrograms((data ?? []) as Program[]);
    });
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
  const shown = useMemo(() => rows.filter((r) => st === "all" || r.status === st), [rows, st]);
  const holidayOf = (d: string) => holidays.find((h) => h.day === d);

  // 일간 보기 열 = 프로그램 (업무·행사는 한 열로)
  const columns = useMemo(() => {
    const list = programs.filter((p) => !isWork(p) && (grp === "all" || p.grp === grp))
      .map((p) => ({ id: p.id, label: p.short || p.name, full: p.name, cap: p.capacity, minutes: p.minutes, color: p.color }));
    if (grp === "all" || grp === "업무") list.push({ id: WORK_COL, label: "업무·행사", full: "업무·행사", cap: 0, minutes: 60, color: null });
    return list;
  }, [programs, grp]);

  const counts = useMemo(() => {
    const c = { 예약: 0, 완료: 0, 노쇼: 0, 취소: 0 } as Record<RStatus, number>;
    rows.forEach((r) => { c[r.status] += 1; });
    return c;
  }, [rows]);

  const openNew = (d: string, start: number, programId?: string) => {
    if (!canWrite) return;
    setDraft({ day: d, start_time: slotLabelValue(start), program_id: programId && programId !== WORK_COL ? programId : "" });
  };
  const openEdit = (r: Rsv) => setDraft({ ...r });

  const move = (n: number) => setDay(addDays(day, view === "day" ? n : n * 7));
  const monthDays = useMemo(() => {
    const first = `${day.slice(0, 8)}01`;
    const out: string[] = [];
    for (let d = first; d.slice(0, 7) === day.slice(0, 7); d = addDays(d, 1)) out.push(d);
    return out;
  }, [day]);
  const today = todayKST();
  const gridH = ((DAY_END - DAY_START) / STEP) * ROW_H;

  return (
    <>
      <header className="top" style={{ flexWrap: "wrap", height: "auto", minHeight: "var(--top-h)", rowGap: 8, paddingTop: 12, paddingBottom: 12 }}>
        <h1>예약표</h1>
        <span className="sub num">
          {loading ? "" : `예약 ${counts.예약} · 결제완료 ${counts.완료} · 노쇼 ${counts.노쇼} · 취소 ${counts.취소}`}
        </span>
        <div style={{ flex: 1 }} />
        {me.tier === "owner" && (
          <div className="seg">
            {BRANCHES.map((b) => <button key={b} className={branch === b ? "on" : ""} onClick={() => setBranch(b)}>{b}</button>)}
          </div>
        )}
        {canWrite && <button className="btn p" onClick={() => openNew(view === "day" ? day : today >= from && today <= to ? today : from, 10 * 60)}>예약 등록</button>}
      </header>

      <div className="page">
        {/* 날짜 이동 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <button className="btn sm" onClick={() => move(-1)} aria-label="이전">‹</button>
          <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700, minWidth: 150, textAlign: "center" }} className="num">
            {view === "day" ? fmtDay(day) : `${fmtDay(from)} ~ ${fmtDay(to).replace(/^\d+월 /, "")}`}
          </div>
          <button className="btn sm" onClick={() => move(1)} aria-label="다음">›</button>
          <button className="btn sm t" onClick={() => setDay(today)}>오늘</button>
          <input type="date" className="inp" style={{ width: 150, height: "var(--btn-h-sm)" }} value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)} />
          <div style={{ flex: 1 }} />
          <div className="seg">
            <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>일간</button>
            <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>주간</button>
          </div>
        </div>

        {/* 일간: 이번 달 날짜 띠 */}
        {view === "day" && (
          <div style={{ display: "flex", gap: 2, overflowX: "auto", marginBottom: 12, paddingBottom: 4 }}>
            {monthDays.map((d) => {
              const w = dow(d); const on = d === day;
              return (
                <button key={d} onClick={() => setDay(d)} className="num" style={{
                  minWidth: 34, height: 44, border: 0, borderRadius: "var(--r-ctl)", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", fontSize: "var(--fs-sm)", fontWeight: on ? 700 : 500,
                  background: on ? "var(--red)" : d === today ? "var(--red-50)" : "transparent",
                  color: on ? "#fff" : w === 0 || holidayOf(d) ? "var(--red)" : w === 6 ? "var(--ink-3)" : "var(--ink-2)",
                }}>
                  <span style={{ fontSize: 10, lineHeight: "12px" }}>{DOW[w]}</span>{Number(d.slice(8))}
                </button>
              );
            })}
          </div>
        )}

        {/* 필터 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {view === "day" && GROUPS.map((g) => (
            <button key={g.k} className={`chip ${grp === g.k ? "on" : ""}`} onClick={() => setGrp(g.k)}>{g.l}</button>
          ))}
          <div className="seg" style={{ marginLeft: "auto" }}>
            {ST_FILTERS.map((f) => <button key={f.k} className={st === f.k ? "on" : ""} onClick={() => setSt(f.k)}>{f.l}</button>)}
          </div>
        </div>

        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        {view === "day" && holidayOf(day) && (
          <p className="badge em" style={{ marginBottom: 12 }}>지점 휴무일 {holidayOf(day)!.reason ? `· ${holidayOf(day)!.reason}` : ""}</p>
        )}

        <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: "calc(100vh - 260px)" }}>
          {(() => {
            const cols = view === "day"
              ? columns.map((c) => ({ key: c.id, day, head: c.label, title: c.full, cap: c.cap, prog: c.id }))
              : Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => ({
                key: d, day: d, head: `${DOW[dow(d)]} ${Number(d.slice(8))}`, title: fmtDay(d), cap: 0, prog: undefined as string | undefined,
              }));
            const colMin = view === "day" ? 128 : 140;
            return (
              <div style={{ display: "grid", gridTemplateColumns: `76px repeat(${cols.length}, minmax(${colMin}px, 1fr))`, minWidth: 76 + cols.length * colMin }}>
                {/* 머리줄 */}
                <div style={headCell({ left: true })} />
                {cols.map((c) => {
                  const hol = view === "week" && holidayOf(c.day);
                  return (
                    <div key={c.key} title={c.title} style={headCell({})}>
                      <div style={{ fontWeight: 700, color: hol || (view === "week" && dow(c.day) === 0) ? "var(--red)" : c.day === today && view === "week" ? "var(--red)" : "var(--ink)" }}>
                        {c.head}
                      </div>
                      {view === "day" && c.cap > 0 && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontWeight: 500 }}>정원 {c.cap}명</div>}
                      {view === "week" && <div className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", fontWeight: 500 }}>
                        {rows.filter((r) => r.day === c.day && (r.status === "예약" || r.status === "완료")).length}건
                      </div>}
                      {hol && <div style={{ fontSize: "var(--fs-xs)", color: "var(--red)", fontWeight: 500 }}>휴무</div>}
                    </div>
                  );
                })}

                {/* 시간축 */}
                <div style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--bg)", borderRight: "1px solid var(--line)" }}>
                  {SLOTS.map((m) => (
                    <div key={m} className="num" style={{ height: ROW_H, fontSize: "var(--fs-xs)", color: m % 60 ? "transparent" : "var(--ink-3)", padding: "2px 8px", whiteSpace: "nowrap", borderTop: m % 60 ? "0" : "1px solid var(--line)" }}>
                      {slotLabel(m).replace(":00", "시")}
                    </div>
                  ))}
                </div>

                {/* 열 */}
                {cols.map((c) => {
                  const off = !!holidayOf(c.day);
                  const items = shown.filter((r) => r.day === c.day && (view === "week" || (c.prog === WORK_COL
                    ? isWork(progMap.get(r.program_id ?? ""))
                    : r.program_id === c.prog)));
                  const placed = lanes(items.map((r) => ({ r, start: toMin(r.start_time), minutes: r.minutes })));
                  return (
                    <div key={c.key} style={{ position: "relative", height: gridH, borderRight: "1px solid var(--line)", background: off ? "var(--bg-sub)" : "var(--bg)" }}>
                      {SLOTS.map((m) => {
                        const p = c.prog && c.prog !== WORK_COL ? progMap.get(c.prog) : undefined;
                        const full = !!p && usedAt(rows, c.day, p.id, m, p.minutes) >= p.capacity;
                        return (
                          <div key={m}
                            onClick={() => !off && !full && openNew(c.day, m, c.prog)}
                            title={full ? "정원이 찼어요" : canWrite && !off ? `${slotLabel(m)} 예약 등록` : undefined}
                            style={{
                              position: "absolute", left: 0, right: 0, top: ((m - DAY_START) / STEP) * ROW_H, height: ROW_H,
                              borderTop: m % 60 ? "1px dashed var(--line)" : "1px solid var(--line)",
                              background: full ? "var(--bg-soft)" : undefined,
                              cursor: canWrite && !off && !full ? "pointer" : "default",
                            }} />
                        );
                      })}
                      {placed.map(({ r, start, minutes, lane, lanes: n }) => {
                        const p = progMap.get(r.program_id ?? "");
                        const top = ((Math.max(start, DAY_START) - DAY_START) / STEP) * ROW_H;
                        const h = Math.max(((Math.min(start + minutes, DAY_END) - Math.max(start, DAY_START)) / STEP) * ROW_H - 2, 22);
                        const color = p?.color ?? "var(--ink-4)";
                        const name = r.kind === "고객" ? r.customer_name : r.title || p?.name || r.kind;
                        return (
                          <button key={r.id} onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                            title={`${r.start_time} ${p?.name ?? ""} · ${name}${r.staff_name ? ` · 담당 ${r.staff_name}` : ""}${r.memo ? `\n${r.memo}` : ""}`}
                            style={{
                              position: "absolute", top: top + 1, height: h, zIndex: 1,
                              left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`,
                              textAlign: "left", padding: "4px 6px", overflow: "hidden",
                              borderRadius: "var(--r-badge)", border: "1px solid var(--line)", borderLeft: `3px solid ${color}`,
                              background: "var(--bg-soft)", color: "var(--ink)", fontSize: "var(--fs-xs)", lineHeight: "16px",
                              textDecoration: r.status === "취소" ? "line-through" : undefined,
                              ...STATUS_STYLE[r.status],
                            }}>
                            {(() => {
                              const sub = `${r.start_time}${view === "week" && p ? ` ${p.short || p.name}` : ""}${r.status !== "예약" ? ` · ${r.status === "완료" ? "결제완료" : r.status}` : ""}`;
                              const one: React.CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
                              if (h < 40) return <div style={one}><b>{name}</b> <span className="num" style={{ opacity: .8 }}>{sub}</span></div>;
                              return (<>
                                <div style={{ ...one, fontWeight: 700 }}>{name}</div>
                                <div className="num" style={{ ...one, opacity: .8 }}>{sub}</div>
                                {h > 50 && n === 1 && r.staff_name && <div style={{ ...one, opacity: .8 }}>담당 {r.staff_name}</div>}
                              </>);
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
        {!loading && rows.length === 0 && !err && (
          <p style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)", marginTop: 12 }}>
            {view === "day" ? "이 날" : "이 주"} 예약이 없어요.{canWrite ? " 빈 칸을 누르면 바로 예약을 잡을 수 있어요." : ""}
          </p>
        )}
      </div>

      {draft && (
        <RsvDrawer branch={branch} draft={draft} programs={programs} rows={rows} canWrite={canWrite}
          onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />
      )}
    </>
  );
}

function slotLabelValue(m: number) { return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

function headCell({ left }: { left?: boolean }): React.CSSProperties {
  return {
    position: "sticky", top: 0, zIndex: left ? 4 : 3, ...(left ? { left: 0 } : {}),
    background: "var(--bg-sub)", minHeight: "var(--th-h)", padding: "8px", textAlign: "center",
    fontSize: "var(--fs-sm)", borderBottom: "1px solid var(--line)", borderRight: "1px solid var(--line)",
  };
}
