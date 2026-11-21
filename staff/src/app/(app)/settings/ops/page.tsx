"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { Msg, NumInp, ORow, PageH, V3i, useBranch, useLead, useSettings, val } from "../kit";
import { OPS0, type Ops, type ConnRow } from "../defaults";


const DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
const TIMES = Array.from({ length: 30 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
function N({ children }: { children: React.ReactNode }) { return <div className="note"><V3i n="info" />{children}</div>; }

/* 시안 U-PC-SET-OP 운영 (지점장=관리자 / 대표 / 직원) */
export default function OpsPage() {
  const { branch, pick, owner } = useBranch(false, true);
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val(data, "ops", OPS0);
  const [v, setV] = useState<Ops>(OPS0);
  const [conn, setConn] = useState<ConnRow[]>([]);
  const [msg, setMsg] = useState("");
  const [rep, setRep] = useState(false);
  useEffect(() => { setV(val(data, "ops", OPS0)); }, [data]);
  useEffect(() => { sb.rpc("conn_status", { p_branch: branch }).then((r) => setConn((r.data ?? []) as ConnRow[])); }, [branch]);
  const edit = lead && !!data?.can_edit;
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  async function onSave() { setMsg(await save("ops", v, "운영 기준을 바꿨어요.") || "저장했어요"); setRep(false); }
  const num = (k: "risk_app" | "risk_rsv" | "risk_lounge", n: number, l: string) => (
    <ORow n={n} label={l}>{edit ? <NumInp value={v[k]} width={80} onChange={(x) => setV({ ...v, [k]: Math.max(1, Math.min(365, x)) })} label={l} /> : <span className="inp num off">{v[k]}</span>}<span className="unit">일</span></ORow>
  );
  const repEdit = owner && rep;

  return (
    <div className="ct p32">
      <PageH title="운영" sub={`${owner ? (branch) : branch} · 이탈 위험 · 리포트`}>
        <Msg text={msg} />
        {edit && <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>}
      </PageH>
      {pick}
      <div className="ltool"><N>이탈 위험 수치는 대표관리자와 관리자가 바꿀 수 있어요. 주간 리포트 발송 시각은 대표관리자만 바꿀 수 있어요. 직원은 보기만 해요.</N></div>
      <div className="body tight">
        <div className="op-card">
          <div className="sech"><h2>이탈 위험 수치</h2><span className="sp" />{edit && <button type="button" className="btn sm" onClick={() => setV({ ...v, risk_app: OPS0.risk_app, risk_rsv: OPS0.risk_rsv, risk_lounge: OPS0.risk_lounge })}>기본값으로</button>}</div>
          <N>연락할 고객의 위험 단계에 쓰이는 값이에요. 기본값은 앱 미접속 {OPS0.risk_app}일, 향후 예약 없음 {OPS0.risk_rsv}일, 라운지 미참여 {OPS0.risk_lounge}일이에요.</N>
          {num("risk_app", 1, "앱 미접속")}{num("risk_rsv", 2, "향후 예약 없음")}{num("risk_lounge", 3, "라운지 미참여")}
        </div>
        <div className="op-card">
          <div className="sech"><h2>주간 리포트 발송 시각</h2></div>
          <N>기본값은 일요일 20:00이에요. 바꾸는 것은 대표관리자만 할 수 있어요.</N>
          <ORow n={4} label="발송 시각">
            {repEdit ? <>
              <select className="sel sm" value={v.report_day} onChange={(e) => setV({ ...v, report_day: e.target.value })} aria-label="요일">{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
              <select className="inp sm" value={v.report_time} onChange={(e) => setV({ ...v, report_time: e.target.value })} aria-label="시각">{(TIMES.includes(v.report_time) ? TIMES : [v.report_time, ...TIMES]).map((t) => <option key={t}>{t}</option>)}</select>
            </> : <>
              <span className={`sel sm ${owner ? "" : "lock"}`}>{v.report_day}</span>
              <span className={`inp sm ${owner ? "" : "lock"}`}>{v.report_time}</span>
              {owner && <button type="button" className="btn sm" onClick={() => setRep(true)}>바꾸기</button>}
            </>}
          </ORow>
        </div>
        <div className="op-card">
          <div className="sech"><h2>운영 자동화</h2></div>
          <N>뷰티사랑넷 엑셀 반영과 오늘 해피콜 목록 자동화는 이 자리에 둬요. 자세한 켜기·끄기와 실행 기록은 아직 없어요.</N>
          <ORow n={5} label="엑셀 반영"><span className="unit">자리만 둬요</span></ORow>
          <ORow n={6} label="오늘 해피콜 목록"><span className="unit">자리만 둬요</span></ORow>
        </div>
        <div className="op-card">
          <div className="sech"><h2>연결</h2>
            <span className="sub">키 값은 보이지 않아요. {lead ? <Link className="link" href="/settings/links">설정 › 운영 › 연결</Link> : "설정 › 운영 › 연결"}</span>
          </div>
          <div className="row">
            {conn.map((c) => <span key={c.channel}>{c.channel} <span className={`badge ${c.manual ? "line" : c.connected ? "ok" : ""}`}>{c.manual ? "직접 입력 · API 없음" : c.connected ? "연결됨" : "연결 안 됨"}</span></span>)}
            {conn.length === 0 && <span className="help">연결 정보를 불러오지 못했어요</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
