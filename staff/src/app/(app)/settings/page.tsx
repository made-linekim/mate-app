"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { BranchOne, friendly, useBranchPick } from "../membership/ui";

type Day = { d: number; open: boolean; s: string; e: string };
type Hours = { days: Day[]; lunch: { s: string; e: string } | null };
type Hol = { day: string; reason: string };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const TIMES = Array.from({ length: 33 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`; });

export default function HoursPage() {
  const [branch, setBranch] = useState(useBranchPick());
  const [hours, setHours] = useState<Hours | null>(null);
  const [orig, setOrig] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [hols, setHols] = useState<Hol[]>([]);
  const [nd, setNd] = useState(todayKST());
  const [nr, setNr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const y = new Date().getFullYear();
    const [s, h] = await Promise.all([
      sb.rpc("settings_get", { p_branch: branch }),
      sb.rpc("rsv_holiday_list", { p_branch: branch, p_from: `${y - 1}-01-01`, p_to: `${y + 1}-12-31` }),
    ]);
    if (s.error || !s.data) { setMsg(s.error ? friendly(s.error.message) : "이 화면을 볼 권한이 없어요"); return; }
    setMsg("");
    setHours(s.data.hours); setOrig(JSON.stringify(s.data.hours)); setCanEdit(!!s.data.can_edit);
    setHols(((h.data ?? []) as Hol[]).filter((x) => x.day >= todayKST()).sort((a, b) => a.day.localeCompare(b.day)));
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const dirty = hours && JSON.stringify(hours) !== orig;
  const setDay = (i: number, p: Partial<Day>) => hours && setHours({ ...hours, days: hours.days.map((d, j) => (j === i ? { ...d, ...p } : d)) });

  async function save() {
    const { error } = await sb.rpc("settings_set", { p_branch: branch, p_key: "hours", p_value: hours });
    setMsg(error ? friendly(error.message) : "저장했어요");
    if (!error) setOrig(JSON.stringify(hours));
  }
  async function addHol() {
    const { error } = await sb.rpc("holiday_add", { p_branch: branch, p_day: nd, p_reason: nr });
    if (error) return setMsg(friendly(error.message));
    setNr(""); load();
  }
  async function delHol(day: string) {
    const { error } = await sb.rpc("holiday_del", { p_branch: branch, p_day: day });
    if (error) return setMsg(friendly(error.message));
    load();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <BranchOne value={branch} onChange={setBranch} />
        {!canEdit && hours && <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>보기만 할 수 있어요 (설정 변경 권한 필요)</span>}
        {msg && <span style={{ fontSize: "var(--fs-sm)", color: msg === "저장했어요" ? "var(--grn)" : "var(--red)" }}>{msg}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginTop: 16 }}>
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <b>요일별 업무시간</b>
            {canEdit && <button className="btn p sm" style={{ marginLeft: "auto" }} disabled={!dirty} onClick={save}>저장</button>}
          </div>
          {hours?.days.map((d, i) => (
            <div key={d.d} style={{ display: "grid", gridTemplateColumns: "40px 90px 1fr 16px 1fr", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <b style={{ color: d.d === 0 ? "var(--red)" : undefined }}>{WD[d.d]}</b>
              <div className="seg">
                <button className={d.open ? "on" : ""} disabled={!canEdit} onClick={() => setDay(i, { open: true })}>영업</button>
                <button className={!d.open ? "on" : ""} disabled={!canEdit} onClick={() => setDay(i, { open: false })}>휴무</button>
              </div>
              <select className="sel" disabled={!canEdit || !d.open} value={d.s} onChange={(e) => setDay(i, { s: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
              <span>~</span>
              <select className="sel" disabled={!canEdit || !d.open} value={d.e} onChange={(e) => setDay(i, { e: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
          ))}
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 0 }}>업무시간 밖 예약도 숨기지 않아요. 점심은 예약 칸을 막지 않아요.</p>
        </div>
        <div className="card">
          <b>임시 휴무일</b>
          {canEdit && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 8, margin: "8px 0" }}>
              <input className="inp" type="date" value={nd} onChange={(e) => setNd(e.target.value)} />
              <input className="inp" placeholder="사유 (예: 설 연휴)" value={nr} onChange={(e) => setNr(e.target.value)} />
              <button className="btn" onClick={addHol}>추가</button>
            </div>
          )}
          <table className="t">
            <thead><tr><th>날짜</th><th>요일</th><th>사유</th><th></th></tr></thead>
            <tbody>
              {hols.map((h) => (
                <tr key={h.day}>
                  <td className="num">{h.day}</td><td>{WD[new Date(h.day + "T00:00:00").getDay()]}</td><td>{h.reason || "-"}</td>
                  <td style={{ textAlign: "right" }}>{canEdit && <button className="btn t sm" onClick={() => delHol(h.day)}>삭제</button>}</td>
                </tr>
              ))}
              {hols.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)" }}>앞으로 잡힌 휴무일이 없어요</td></tr>}
            </tbody>
          </table>
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 0 }}>휴무일은 예약표에서 좁고 흐리게 보여요.</p>
        </div>
      </div>
    </>
  );
}
