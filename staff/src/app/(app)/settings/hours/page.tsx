"use client";
import { useEffect, useState } from "react";
import { Card, HelpD, Msg, ORow, PageH, Sw, useBranch, useLead, useSettings, val } from "../kit";

type Day = { d: number; open: boolean; s: string; e: string };
type Lunch = { s: string; e: string } | null;
type Hours = { days: Day[]; lunch: Lunch };
type Shift = { name: string; label: string; s: string; e: string };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TIMES = Array.from({ length: 37 }, (_, i) => hm(6 * 60 + i * 30));
const H0: Hours = { days: ORDER.map((d) => ({ d, open: d !== 0, s: "09:30", e: "21:00" })), lunch: null };

function TSel({ v, on, edit, label }: { v: string; on: (x: string) => void; edit: boolean; label: string }) {
  if (!edit) return <span className="sel sm off">{v}</span>;
  const opts = TIMES.includes(v) ? TIMES : [v, ...TIMES];
  return <select className="sel sm" aria-label={label} value={v} onChange={(e) => on(e.target.value)}>{opts.map((t) => <option key={t}>{t}</option>)}</select>;
}

/* 시안 U-PC-SET-03 업무시간 / 03_점심추가 */
export default function HoursPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val<Hours>(data, "hours", H0);
  const [h, setH] = useState<Hours>(H0);
  const [msg, setMsg] = useState("");
  useEffect(() => { const x = val<Hours>(data, "hours", H0); setH({ ...x, lunch: x.lunch ?? null }); }, [data]);
  const edit = lead && !!data?.can_edit;
  const dirty = JSON.stringify(h) !== JSON.stringify({ ...orig, lunch: orig.lunch ?? null });
  const setDay = (d: number, p: Partial<Day>) => setH({ ...h, days: h.days.map((x) => (x.d === d ? { ...x, ...p } : x)) });
  const shifts = val<Shift[]>(data, "shifts", []);
  const offDays = ORDER.filter((n) => h.days.find((x) => x.d === n && !x.open)).map((n) => `${WD[n]}요일`);

  async function onSave() { setMsg(await save("hours", h, "업무시간을 바꿨어요.") || "저장했어요"); }

  return (
    <div className="ct">
      <PageH title="업무시간" sub={`${branch} · 요일별 영업`}>
        <Msg text={msg} />
        {edit && <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        {!edit && <HelpD>바꾸려면 관리자에게 요청해 주세요.</HelpD>}
        <div className="set2">
          <Card title="요일별 영업">
            {ORDER.map((n) => {
              const d = h.days.find((x) => x.d === n);
              if (!d) return null;
              return (
                <div key={n} className="dayrow">
                  <span>{WD[n]}요일</span>
                  <Sw on={d.open} lock={!edit} onChange={(v) => setDay(n, { open: v })} label={`${WD[n]}요일 영업`} />
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-8)" }}>
                    {d.open ? <><TSel v={d.s} edit={edit} on={(x) => setDay(n, { s: x })} label={`${WD[n]}요일 시작`} /><span className="help">–</span><TSel v={d.e} edit={edit} on={(x) => setDay(n, { e: x })} label={`${WD[n]}요일 끝`} /></>
                      : <span className="offlab">휴무</span>}
                  </div>
                </div>
              );
            })}
            <HelpD>{offDays.length ? `${offDays.join("·")}은 정기 휴무로 두었어요. 바꾸면 예약표에도 반영돼요.` : "바꾸면 예약표에도 반영돼요."}</HelpD>
            <ORow n={1} label="점심 시간">
              {h.lunch ? <>
                <TSel v={h.lunch.s} edit={edit} on={(x) => setH({ ...h, lunch: { ...h.lunch!, s: x } })} label="점심 시작" />
                <span className="help">–</span>
                <TSel v={h.lunch.e} edit={edit} on={(x) => setH({ ...h, lunch: { ...h.lunch!, e: x } })} label="점심 끝" />
                {edit && <button type="button" className="btn sm" onClick={() => setH({ ...h, lunch: null })}>점심 시간 지우기</button>}
              </> : <>
                <span className="help">없음</span>
                {edit && <button type="button" className="btn sm" onClick={() => setH({ ...h, lunch: { s: "13:00", e: "14:00" } })}>점심 시간 추가</button>}
              </>}
            </ORow>
            {h.lunch && <HelpD>점심 시간에는 예약이 잡히지 않아요.</HelpD>}
          </Card>
          <Card title="직원별 근무 · 선택">
            <HelpD>넣지 않아도 돼요. 넣으면 그 직원의 예약 가능한 시간을 참고해요.</HelpD>
            {shifts.map((s, i) => (
              <ORow key={i} n={i + 2} label={`${s.name} · ${s.label}`}><span className="help">{s.s} – {s.e}</span></ORow>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
