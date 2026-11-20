"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { friendly } from "../../membership/ui";
import { Head, Msg, Switch, useSetBranch } from "../ui";

type Day = { d: number; open: boolean; s: string; e: string };
type Lunch = { s: string; e: string } | null;
type Hours = { days: Day[]; lunch: Lunch };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 시안처럼 월요일부터
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TIMES = Array.from({ length: 33 }, (_, i) => hm(6 * 60 + i * 30));
// 점심: 1시간짜리, 11:00 ~ 15:00 사이 30분 단위
const LUNCH = Array.from({ length: 9 }, (_, i) => { const s = 11 * 60 + i * 30; return { s: hm(s), e: hm(s + 60) }; });
const lunchKey = (l: Lunch) => (l ? `${l.s}~${l.e}` : "");

export default function HoursSection() {
  const branch = useSetBranch();
  const [hours, setHours] = useState<Hours | null>(null);
  const [orig, setOrig] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const s = await sb.rpc("settings_get", { p_branch: branch });
    if (s.error || !s.data) { setHours(null); setMsg(s.error ? friendly(s.error.message) : "이 화면을 볼 권한이 없어요"); return; }
    setMsg("");
    const h = { lunch: null, ...s.data.hours } as Hours;
    setHours(h); setOrig(JSON.stringify(h)); setCanEdit(!!s.data.can_edit);
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const dirty = !!hours && JSON.stringify(hours) !== orig;
  const setDay = (d: number, p: Partial<Day>) => hours && setHours({ ...hours, days: hours.days.map((x) => (x.d === d ? { ...x, ...p } : x)) });

  async function save() {
    const { error } = await sb.rpc("settings_set", { p_branch: branch, p_key: "hours", p_value: hours });
    setMsg(error ? friendly(error.message) : "저장했어요");
    if (!error) setOrig(JSON.stringify(hours));
  }

  const lunchOpts = hours?.lunch && !LUNCH.some((l) => lunchKey(l) === lunchKey(hours.lunch)) ? [hours.lunch, ...LUNCH] : LUNCH;

  return (
    <>
      <Head title="업무시간">
        <Msg text={msg} />
        {!canEdit && hours && <span className="st-ro">보기만 할 수 있어요</span>}
        {canEdit && <button className="btn p" disabled={!dirty} onClick={save}>저장</button>}
      </Head>
      <div className="st-tbl st-hours">
        <table className="t">
          <thead><tr><th>요일</th><th>영업</th><th>시작</th><th>끝</th><th className="lc">점심</th></tr></thead>
          <tbody>
            {hours && ORDER.map((n) => {
              const d = hours.days.find((x) => x.d === n);
              if (!d) return null;
              return (
                <tr key={n}>
                  <td className={`dw ${n === 0 ? "sun" : ""}`}>{WD[n]}</td>
                  <td><Switch on={d.open} disabled={!canEdit} label={`${WD[n]}요일 영업`} onChange={(v) => setDay(n, { open: v })} /></td>
                  {d.open ? (
                    <>
                      <td><select className="sel num" aria-label="시작" disabled={!canEdit} value={d.s} onChange={(e) => setDay(n, { s: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></td>
                      <td><select className="sel num" aria-label="끝" disabled={!canEdit} value={d.e} onChange={(e) => setDay(n, { e: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select></td>
                      <td className="lc">
                        <select className="sel num st-lunch" aria-label="점심" disabled={!canEdit} value={lunchKey(hours.lunch)}
                          onChange={(e) => setHours({ ...hours, lunch: lunchOpts.find((l) => lunchKey(l) === e.target.value) ?? null })}>
                          <option value="">없음</option>
                          {lunchOpts.map((l) => <option key={lunchKey(l)} value={lunchKey(l)}>{l!.s} ~ {l!.e}</option>)}
                        </select>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><input className="inp" value="-" disabled readOnly aria-label="시작" /></td>
                      <td><input className="inp" value="-" disabled readOnly aria-label="끝" /></td>
                      <td className="lc"><input className="inp st-lunch" value="-" disabled readOnly aria-label="점심" /></td>
                    </>
                  )}
                </tr>
              );
            })}
            {!hours && <tr><td colSpan={5} className="none">{msg || "불러오는 중이에요"}</td></tr>}
          </tbody>
        </table>
      </div>
      {hours && (
        <label className="st-lunch-m">
          <b>점심</b>
          <select className="sel num" disabled={!canEdit} value={lunchKey(hours.lunch)}
            onChange={(e) => setHours({ ...hours, lunch: lunchOpts.find((l) => lunchKey(l) === e.target.value) ?? null })}>
            <option value="">없음</option>
            {lunchOpts.map((l) => <option key={lunchKey(l)} value={lunchKey(l)}>{l!.s} ~ {l!.e}</option>)}
          </select>
        </label>
      )}
      <p className="st-foot">점심시간은 모든 요일에 같이 적용돼요. 업무시간 밖 예약도 숨기지 않고, 점심은 예약 칸을 막지 않아요.</p>
    </>
  );
}
