"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { Card, Help, HelpD, Logs, Msg, ORow, PageH, requestChange, useBranch, useLead, useSettings, val } from "../kit";
import { GRADES0, type Grade } from "../defaults";

/* 시안 U-PC-SET-10 고객등급 / 10_변경요청. 기준은 전 지점 공통(scope all), 인원은 지점별 (057 grade_counts). */
export default function GradesPage() {
  const { branch, pick } = useBranch();
  const { owner, me } = useLead();
  const { data, save } = useSettings("all");
  const orig = val<Grade[]>(data, "grades", GRADES0);
  const [v, setV] = useState<Grade[]>(GRADES0);
  const [cnt, setCnt] = useState<Record<string, number> | null>(null);
  const [req, setReq] = useState<{ i: number; to: string } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val<Grade[]>(data, "grades", GRADES0)); }, [data]);
  useEffect(() => { sb.rpc("grade_counts", { p_branch: branch }).then((r) => setCnt(r.error ? null : (r.data as Record<string, number>))); }, [branch]);
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  const total = cnt ? Object.values(cnt).reduce((a, b) => a + b, 0) : null;

  async function onSave() {
    const ch = v.map((g, i) => (orig[i] && (g.cond !== orig[i].cond || g.benefit !== orig[i].benefit) ? `${g.name} 기준` : "")).filter(Boolean);
    setMsg(await save("grades", v, `${ch.join(", ") || "등급"}을 바꿨어요.`) || "저장했어요");
  }
  async function sendReq() {
    if (!req) return;
    const g = orig[req.i];
    if (!req.to.trim() || req.to === g.cond) return setMsg("새 조건을 적어 주세요");
    const e = await requestChange(me.branch, "grades", { grade: g.name, from: g.cond, to: req.to.trim() }, `${g.name} 조건 ${g.cond} → ${req.to.trim()}`);
    if (e) return setMsg(e);
    setReq(null); setMsg("요청했어요");
  }
  const cell = (i: number, k: "cond" | "benefit") => owner
    ? <input className="inp" style={{ width: "100%" }} value={v[i][k]} onChange={(e) => setV(v.map((g, j) => (j === i ? { ...g, [k]: e.target.value } : g)))} aria-label={`${v[i].name} ${k === "cond" ? "조건" : "혜택"}`} />
    : v[i][k];

  return (
    <div className="ct">
      <PageH title="고객 등급" sub={`전 지점 공통 · ${req ? "기준 변경 요청" : "조건과 혜택"}`}>
        <Msg text={msg} />
        {owner ? <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>
          : req ? <button className="btn p sm" onClick={sendReq}>변경 요청</button>
          : <button className="btn p" onClick={() => setReq({ i: 1, to: orig[1]?.cond ?? "" })}>변경 요청</button>}
      </PageH>
      {!req && pick}
      <div className="body">
        {req ? <>
          <Card title="기준 변경 요청" className="req">
            <ORow n={1} label="등급"><select className="sel" value={req.i} onChange={(e) => { const i = +e.target.value; setReq({ i, to: orig[i].cond }); }}>{orig.map((g, i) => <option key={g.name} value={i}>{g.name}</option>)}</select></ORow>
            <ORow n={2} label="이전 조건"><Help>{orig[req.i].cond}</Help></ORow>
            <ORow n={3} label="새 조건"><input className="inp" style={{ width: 280 }} value={req.to} maxLength={80} onChange={(e) => setReq({ ...req, to: e.target.value })} aria-label="새 조건" /></ORow>
            <HelpD>요청하면 대표관리자에게 가요. 승인되기 전에는 기준이 바뀌지 않아요.</HelpD>
          </Card>
          <Logs data={data} k="grades" max={1} />
        </> : <>
          <div className="ltool"><span className="help">{branch} · {v.length}단계{total != null ? ` · ${total.toLocaleString("ko-KR")}명` : ""} · 기준은 전 지점 공통</span></div>
          <div className="v3card">
            <table className="tbl">
              <tbody>
                <tr><th>등급</th><th>조건</th><th>혜택</th><th className="num">인원</th></tr>
                {v.map((g, i) => <tr key={g.name}><td>{g.name}</td><td>{cell(i, "cond")}</td><td>{cell(i, "benefit")}</td><td className="num">{cnt ? (cnt[g.name] ?? 0).toLocaleString("ko-KR") : "—"}</td></tr>)}
              </tbody>
            </table>
          </div>
          <HelpD>인원은 오늘 {branch} 기준이에요. 한 고객은 한 등급에만 들어가요.</HelpD>
          <Logs data={data} k="grades" max={1} />
        </>}
      </div>
    </div>
  );
}
