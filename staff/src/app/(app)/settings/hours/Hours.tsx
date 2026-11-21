"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { friendly } from "../../membership/ui";
import { Head, Msg, Radio, Row, Switch, useSetBranch } from "../ui";

type Day = { d: number; open: boolean; s: string; e: string };
type Lunch = { s: string; e: string } | null;
type Hours = { days: Day[]; lunch: Lunch };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 시안처럼 월요일부터
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TIMES = Array.from({ length: 33 }, (_, i) => hm(6 * 60 + i * 30));
// 점심: 1시간짜리, 11:00 ~ 15:00 사이 30분 단위
const LUNCH = Array.from({ length: 9 }, (_, i) => { const s = 11 * 60 + i * 30; return { s: hm(s), e: hm(s + 60) }; });
// 자주 쓰는 점심 3가지만 선택지로 (예전에 다른 시간을 저장했으면 그것도 보여 줘요)
const LUNCH_PICK0 = LUNCH.filter((l) => ["12:00", "12:30", "13:00"].includes(l.s));
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

  const LUNCH_PICK = hours?.lunch && !LUNCH_PICK0.some((l) => lunchKey(l) === lunchKey(hours.lunch)) ? [hours.lunch, ...LUNCH_PICK0] : LUNCH_PICK0;
  const lunchOpts = hours?.lunch && !LUNCH.some((l) => lunchKey(l) === lunchKey(hours.lunch)) ? [hours.lunch, ...LUNCH] : LUNCH;

  return (
    <>
      <Head title="업무시간" meta="요일별 영업">
        <Msg text={msg} />
        {!canEdit && hours && <span className="st-ro">보기만 할 수 있어요</span>}
        {canEdit && <button className="btn p" disabled={!dirty} onClick={save}>저장</button>}
      </Head>
      <div className="st-sec">
        <h3>요일별 영업</h3>
        {hours ? ORDER.map((n) => {
          const d = hours.days.find((x) => x.d === n);
          if (!d) return null;
          return (
            <div key={n} className="st-dayrow">
              <span className={`dn ${n === 0 ? "sun" : ""}`}>{WD[n]}요일</span>
              <Switch on={d.open} disabled={!canEdit} label={`${WD[n]}요일 영업`} onChange={(v) => setDay(n, { open: v })} />
              {d.open ? (
                <>
                  <select className="sel num" aria-label="시작" disabled={!canEdit} value={d.s} onChange={(e) => setDay(n, { s: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
                  <span className="off">–</span>
                  <select className="sel num" aria-label="끝" disabled={!canEdit} value={d.e} onChange={(e) => setDay(n, { e: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
                </>
              ) : <span className="off">휴무</span>}
            </div>
          );
        }) : <p className="st-foot">{msg || "불러오는 중이에요"}</p>}
        {hours && (
          <Row n={1} label="점심 시간" help="모든 요일에 같이 적용돼요. 예약 칸은 막지 않아요.">
            <Radio label="점심 시간" disabled={!canEdit} value={lunchKey(hours.lunch)}
              options={[{ v: "", l: "없음" }, ...LUNCH_PICK.map((l) => ({ v: lunchKey(l), l: `${l.s}~${l.e}` }))]}
              onChange={(v) => setHours({ ...hours, lunch: lunchOpts.find((l) => lunchKey(l) === v) ?? null })} />
          </Row>
        )}
      </div>
    </>
  );
}
