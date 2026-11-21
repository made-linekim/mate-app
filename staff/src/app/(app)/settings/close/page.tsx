"use client";
import { useEffect, useState } from "react";
import { Card, Confirm, Help, Logs, Msg, ORow, PageH, Sw, UseR, useBranch, useLead, useSettings, val } from "../kit";
import { CLOSE0, type Close } from "../defaults";

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const TIMES = Array.from({ length: 13 }, (_, i) => hm(18 * 60 + i * 30));
const MONTH = ["말일", "다음 달 1일", "다음 달 2일", "다음 달 3일", "다음 달 5일"];
const L: Record<keyof Close, string> = { day: "마감 시각", cash: "시재 확인", month: "월 마감일", happy: "해피콜 마감" };
const txt = (k: keyof Close, x: Close[keyof Close]) => (k === "cash" ? (x ? "사용" : "안 함") : String(x));

/* 시안 U-PC-SET-16 마감기준 + 16_변경확인 */
export default function ClosePage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val(data, "close", CLOSE0);
  const [v, setV] = useState<Close>(CLOSE0);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val(data, "close", CLOSE0)); }, [data]);
  const edit = lead && !!data?.can_edit;
  const ch = (Object.keys(L) as (keyof Close)[]).filter((k) => v[k] !== orig[k]);
  const lines = ch.map((k) => `${L[k]} ${txt(k, orig[k])} → ${txt(k, v[k])}`);
  async function doSave() { setAsk(false); setMsg(await save("close", v, lines.join(", ")) || "저장했어요"); }
  const sel = (k: "day" | "month" | "happy", opts: string[]) => edit
    ? <select className="sel" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={L[k]}>{(opts.includes(v[k]) ? opts : [v[k], ...opts]).map((t) => <option key={t}>{t}</option>)}</select>
    : <span className="sel off">{v[k]}</span>;
  const hint = (k: keyof Close, def: string) => (v[k] !== orig[k] ? `지금 ${txt(k, orig[k])}에서 ${txt(k, v[k])}으로 바꿔요.` : def);

  return (
    <div className="ct">
      <PageH title="마감 기준" sub={`${branch} · 하루·월 마감`}>
        <Msg text={msg} />
        {edit && <button className={`btn ${ask ? "" : "p"}`} disabled={!ch.length} onClick={() => setAsk(true)}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        <Card title="하루 마감">
          <ORow n={1} label="마감 시각">{sel("day", TIMES)}<Help>{hint("day", "이 시각이 지나면 그날 매출로 넣지 않아요.")}</Help></ORow>
          <ORow n={2} label="시재 확인">{edit ? <UseR on={v.cash} onChange={(x) => setV({ ...v, cash: x })} label="시재 확인" /> : <Sw on={v.cash} lock />}<Help>하루 마감 때 시재를 확인하고 기록해요.</Help></ORow>
        </Card>
        <Card title="월 마감 · 해피콜">
          <ORow n={3} label="월 마감일">{sel("month", MONTH)}{v.month !== orig.month && <Help>{hint("month", "")}</Help>}</ORow>
          <ORow n={4} label="해피콜 마감">{sel("happy", TIMES)}{v.happy !== orig.happy && <Help>{hint("happy", "")}</Help>}</ORow>
        </Card>
        <Logs data={data} k="close" />
      </div>
      {ask && <Confirm title="마감 기준을 바꿀까요?" lines={[...lines, "바뀐 기준은 다음 마감부터 적용돼요. 지난 마감은 다시 계산하지 않아요.", "바꾼 내용은 기록에 남아요."]} onOk={doSave} onClose={() => setAsk(false)} />}
    </div>
  );
}
