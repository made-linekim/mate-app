"use client";
import { useEffect, useState } from "react";
import { todayKST } from "@/lib/sales";
import { Card, Chip, Help, HelpD, Logs, Msg, NumInp, ORow, PageH, md, requestChange, useBranch, useLead, useSettings, val } from "../kit";
import { PAY0, type Pay } from "../defaults";

const METHODS = ["카드", "현금", "계좌이체", "미수"];
const WD = ["일", "월", "화", "수", "목", "금", "토"];

/* 시안 U-PC-SET-15 결제수수료 / 15_변경요청. 결제 수단은 관리자 이상이 켜고 끄고, 카드 수수료율은 대표관리자만 바꿔요 (관리자는 요청). */
export default function PayPage() {
  const { branch, pick } = useBranch();
  const { owner, lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val(data, "pay", PAY0);
  const [v, setV] = useState<Pay>(PAY0);
  const [req, setReq] = useState<{ to: number; from: string } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val(data, "pay", PAY0)); }, [data]);
  const edit = lead && !!data?.can_edit;
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  const starts = Array.from({ length: 4 }, (_, i) => { const d = new Date(todayKST().slice(0, 7) + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1 + i); return d.toISOString().slice(0, 10); });
  const dl = (d: string) => `${md(d)} (${WD[new Date(d + "T00:00:00Z").getUTCDay()]})`;

  async function onSave() {
    const ch: string[] = METHODS.filter((m) => !!v.methods[m] !== !!orig.methods[m]).map((m) => `${m} ${v.methods[m] ? "켬" : "끔"}`);
    if (v.fee !== orig.fee || v.fee_from !== orig.fee_from) ch.push(`${branch} 카드 수수료 ${orig.fee ?? "없음"}% → ${v.fee ?? "없음"}%${v.fee_from ? ` · 적용 시작일 ${md(v.fee_from)}` : ""}`);
    setMsg(await save("pay", v, ch.join(", ")) || "저장했어요");
  }
  async function sendReq() {
    if (!req) return;
    if (req.to === orig.fee) return setMsg("새 값을 적어 주세요");
    const e = await requestChange(branch, "card_fee", { from: orig.fee, to: req.to, start: req.from }, `${branch} 카드 수수료 ${orig.fee ?? "없음"}% → ${req.to}% · 적용 시작일 ${md(req.from)}`);
    if (e) return setMsg(e);
    setReq(null); setMsg("요청했어요");
  }

  return (
    <div className="ct">
      <PageH title="결제·수수료" sub={`${branch} · ${req ? "수수료율 변경 요청" : "결제 수단과 카드 수수료"}`}>
        <Msg text={msg} />
        {owner ? <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>
          : req ? <button className="btn p sm" onClick={sendReq}>변경 요청</button>
          : <>{dirty && <button className="btn" onClick={onSave}>저장</button>}<button className="btn p" onClick={() => setReq({ to: orig.fee ?? 0, from: starts[0] })}>변경 요청</button></>}
      </PageH>
      {pick}
      <div className="body">
        {req ? <>
          <Card title="수수료율 변경 요청" className="req">
            <ORow n={1} label="지점"><Help>{branch}</Help></ORow>
            <ORow n={2} label="이전 값"><Help>{orig.fee == null ? "없음" : `${orig.fee}%`}</Help></ORow>
            <ORow n={3} label="새 값"><NumInp value={req.to} width={80} dec onChange={(x) => setReq({ ...req, to: x })} label="새 값" /><Help>%</Help></ORow>
            <ORow n={4} label="적용 시작일"><select className="sel" value={req.from} onChange={(e) => setReq({ ...req, from: e.target.value })} aria-label="적용 시작일">{starts.map((d) => <option key={d} value={d}>{dl(d)}</option>)}</select></ORow>
            <HelpD>요청하면 대표관리자에게 가요. 승인되기 전에는 수수료율이 바뀌지 않아요.</HelpD>
          </Card>
          <Logs data={data} k="pay" max={1} />
        </> : <>
          <Card title="결제 수단">
            <div className="reasons">{METHODS.map((m) => <Chip key={m} on={!!v.methods[m]} disabled={!edit} onClick={() => setV({ ...v, methods: { ...v.methods, [m]: !v.methods[m] } })}>{m}</Chip>)}</div>
            <HelpD>켜 둔 수단만 결제 화면에 보여요.</HelpD>
          </Card>
          <Card title="카드 수수료율">
            <ORow n={1} label="지점"><Help>{branch}</Help></ORow>
            <ORow n={2} label="지금 적용">
              {owner ? <><NumInp value={v.fee} width={80} dec onChange={(x) => setV({ ...v, fee: x })} label="수수료율" /><Help>%</Help>
                <select className="sel sm" value={v.fee_from ?? ""} onChange={(e) => setV({ ...v, fee_from: e.target.value || null })} aria-label="적용 시작일"><option value="">시작일 없음</option>{[...(v.fee_from && !starts.includes(v.fee_from) ? [v.fee_from] : []), ...starts].map((d) => <option key={d} value={d}>{dl(d)}부터</option>)}</select></>
                : <><Help>{v.fee == null ? "아직 넣지 않았어요" : `${v.fee}%`}</Help>{v.fee_from && <Help>{md(v.fee_from)}부터</Help>}</>}
            </ORow>
            <HelpD>이 값은 {branch} 계약 기준이에요.{owner ? "" : " 바꾸려면 대표관리자에게 변경 요청을 해요."}</HelpD>
            <Logs data={data} k="pay" max={1} />
          </Card>
        </>}
      </div>
    </div>
  );
}
