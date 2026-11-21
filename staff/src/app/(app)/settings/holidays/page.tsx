"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { friendly } from "../../membership/ui";
import { Card, saveErr, Chip, Confirm, Drawer, Field, HelpD, Msg, PageH, VRadio, md, useBranch, useLead, useSettings, val } from "../kit";

type Hol = { day: string; reason: string };
type Off = { id: string; day: string; name: string; reason: string; status: string };
type Day = { d: number; open: boolean; s: string; e: string };
type Hours = { days: Day[]; lunch: unknown };
type Edit = { kind: "branch" | "staff"; day: string; reason: string; orig?: string };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ST: Record<string, string> = { 대기: "caution", 승인: "ok", 반려: "" };
const STL: Record<string, string> = { 대기: "기다리는 중", 승인: "승인됨", 반려: "반려" };

/* 시안 U-PC-SET-04 휴무 */
export default function HolidaysPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const [hols, setHols] = useState<Hol[]>([]);
  const [offs, setOffs] = useState<Off[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [msg, setMsg] = useState("");
  const drawerOpen = !!edit;
  useEffect(() => { if (drawerOpen) setMsg(""); }, [drawerOpen]);
  const [busy, setBusy] = useState(false);
  const [dec, setDec] = useState<Off | null>(null);
  const can = lead && !!data?.can_edit;
  const today = todayKST();

  const load = useCallback(async () => {
    const chunks = Array.from({ length: 9 }, (_, i) => addDays(today.slice(0, 8) + "01", i * 42));
    const [o, ...hs] = await Promise.all([
      sb.rpc("staff_off_list", { p_branch: branch, p_from: addDays(today, -60), p_to: addDays(today, 365) }),
      ...chunks.map((f) => sb.rpc("rsv_holiday_list", { p_branch: branch, p_from: f, p_to: addDays(f, 41) })),
    ]);
    const map = new Map<string, Hol>();
    hs.forEach((h) => ((h.data ?? []) as Hol[]).forEach((x) => map.set(x.day, x)));
    setHols([...map.values()].sort((a, b) => a.day.localeCompare(b.day)));
    setOffs(((o.data ?? []) as Off[]).sort((a, b) => b.day.localeCompare(a.day)));
  }, [branch, today]);
  useEffect(() => { load(); }, [load]);

  const hours = val<Hours | null>(data, "hours", null);
  const closed = useMemo(() => new Set((hours?.days ?? []).filter((d) => !d.open).map((d) => d.d)), [hours]);
  async function toggleWd(n: number) {
    if (!can || !hours) return;
    const days = hours.days.map((d) => (d.d === n ? { ...d, open: !d.open } : d));
    setMsg(await save("hours", { ...hours, days }, `정기 휴무를 바꿨어요 (${WD[n]}요일).`) || "저장했어요");
  }

  async function submit() {
    if (!edit?.day) return setMsg("날짜를 골라 주세요");
    setBusy(true);
    const r = edit.kind === "branch"
      ? await sb.rpc("holiday_add", { p_branch: branch, p_day: edit.day, p_reason: edit.reason.trim() })
      : await sb.rpc("staff_off_request", { p_branch: branch, p_day: edit.day, p_reason: edit.reason.trim() });
    if (!r.error && edit.orig && edit.orig !== edit.day) await sb.rpc("holiday_del", { p_branch: branch, p_day: edit.orig });
    setBusy(false);
    if (r.error) return setMsg(saveErr(r.error.message));
    setEdit(null); setMsg(edit.kind === "branch" ? "저장했어요" : "요청했어요"); load();
  }

  async function del() {
    if (!edit?.orig) return;
    setBusy(true);
    const { error } = await sb.rpc("holiday_del", { p_branch: branch, p_day: edit.orig });
    setBusy(false);
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("지웠어요"); load();
  }

  async function decide(ok: boolean) {
    if (!dec) return; const o = dec; setDec(null);
    const { error } = await sb.rpc("staff_off_decide", { p_id: o.id, p_ok: ok });
    if (error) return setMsg(friendly(error.message));
    setMsg(ok ? "승인했어요" : "반려했어요"); load();
  }

  // 달력: 이번 달
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = today.slice(0, 7);
  const holSet = new Set(hols.filter((h) => h.day.startsWith(ym)).map((h) => Number(h.day.slice(8, 10))));
  const isOff = (d: number) => holSet.has(d) || closed.has((first + d - 1) % 7);
  const wdTxt = ORDER.filter((n) => closed.has(n)).map((n) => `${WD[n]}요일`).join("·");
  const tmpTxt = [...holSet].filter((d) => !closed.has((first + d - 1) % 7)).map((d) => `${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`).join("·");
  const sumTxt = [wdTxt && `${wdTxt}과`, tmpTxt].filter(Boolean).join(" ");

  return (
    <div className="ct">
      <PageH title="휴무" sub={`${branch} · 정기·임시·직원 휴무`}>
        <Msg text={msg} />
        <button className="btn p sm" onClick={() => setEdit({ kind: can ? "branch" : "staff", day: today, reason: "" })}>휴무 추가</button>
      </PageH>
      {pick}
      <div className="body">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: "var(--sp-24)", alignItems: "start" }} className="hol-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-16)" }}>
            <Card title="지점 휴무">
              <HelpD>정기 휴무</HelpD>
              <div className="reasons">{ORDER.map((n) => <Chip key={n} on={closed.has(n)} disabled={!can} onClick={() => toggleWd(n)}>{WD[n]}</Chip>)}</div>
              <table className="tbl">
                <thead><tr><th>날짜</th><th>구분</th><th>대상</th><th>사유</th><th>상태</th></tr></thead>
                <tbody>
                  {ORDER.filter((n) => closed.has(n)).length > 0 && <tr><td>매주 {ORDER.filter((n) => closed.has(n)).map((n) => WD[n]).join("·")}</td><td>정기</td><td>{branch}</td><td>정기 휴무</td><td><span className="badge">적용</span></td></tr>}
                  {hols.filter((h) => h.day >= today).map((h) => (
                    <tr key={h.day} style={can ? { cursor: "pointer" } : undefined} onClick={() => can && setEdit({ kind: "branch", day: h.day, reason: h.reason, orig: h.day })}><td>{md(h.day)}</td><td>임시</td><td>{branch}</td><td>{h.reason || "—"}</td><td><span className="badge">적용</span></td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card title="직원 휴무">
              <table className="tbl">
                <thead><tr><th>날짜</th><th>대상</th><th>사유</th><th>상태</th></tr></thead>
                <tbody>
                  {offs.map((o) => <tr key={o.id} style={lead && o.status === "대기" ? { cursor: "pointer" } : undefined} onClick={() => lead && o.status === "대기" && setDec(o)}><td>{md(o.day)}</td><td>{o.name}</td><td>{o.reason || "—"}</td><td><span className={`badge ${ST[o.status] ?? ""}`}>{STL[o.status] ?? o.status}</span></td></tr>)}
                </tbody>
              </table>
              <HelpD>{lead ? "기다리는 중인 줄을 누르면 승인하거나 반려해요." : "휴무 추가로 요청하면 관리자가 승인해요."}</HelpD>
            </Card>
          </div>
          <Card title={`${m}월`} extra={<span className="help">회색은 휴무일</span>}>
            <div className="cal">
              {WD.map((w) => <div key={w} className="hd">{w}</div>)}
              {Array.from({ length: first }, (_, i) => <div key={"e" + i} />)}
              {Array.from({ length: last }, (_, i) => i + 1).map((d) => (
                <div key={d} className={`d ${isOff(d) ? "off" : ""} ${d === Number(today.slice(8, 10)) ? "today" : ""}`}>{d}</div>
              ))}
            </div>
            {sumTxt && <HelpD>{sumTxt}가 휴무예요.</HelpD>}
          </Card>
        </div>
      </div>
      {dec && <Confirm title="휴무를 승인할까요?" lines={[`${dec.name} · ${md(dec.day)}`, dec.reason || "사유 없음"]} ok="승인" onOk={() => decide(true)} alt={{ label: "반려", on: () => decide(false) }} onClose={() => setDec(null)} />}
      {edit && (
        <Drawer title={edit.orig ? "휴무 고치기" : "휴무 추가"} err={msg} onClose={() => setEdit(null)} onOk={submit} ok={edit.kind === "branch" ? "저장" : "요청"} busy={busy}>
          {can && !edit.orig && <Field label="구분"><VRadio value={edit.kind} options={[{ v: "branch", l: "지점 임시 휴무" }, { v: "staff", l: "내 휴무" }]} onChange={(k) => setEdit({ ...edit, kind: k })} label="구분" /></Field>}
          <Field label="날짜"><input className="inp" type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} /></Field>
          <Field label="사유"><input className="inp" placeholder={edit.kind === "branch" ? "예: 센터 교육" : "예: 개인 사정"} maxLength={100} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
          {edit.orig && <button type="button" className="btn" onClick={del} disabled={busy}>이 휴무 지우기</button>}
          <HelpD>{edit.kind === "branch" ? "같은 날짜가 이미 있으면 사유만 바뀌어요." : "관리자가 승인하면 예약표에 보여요."}</HelpD>
        </Drawer>
      )}
    </div>
  );
}
