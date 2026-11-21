"use client";
import { useEffect, useState } from "react";
import { Card, Help, HelpD, Logs, Msg, NumInp, ORow, PageH, Sw, requestChange, useLead, useSettings, val, won } from "../kit";
import { POINTS0, type Points } from "../defaults";

type K = "rate" | "unit" | "min" | "expire";
const ITEMS: { k: K; l: string; unit: string }[] = [
  { k: "rate", l: "적립률", unit: "%" }, { k: "unit", l: "사용 단위", unit: "P" }, { k: "min", l: "최소 사용", unit: "P" }, { k: "expire", l: "소멸 기간", unit: "개월" },
];
const show = (k: K, n: number) => (k === "rate" ? `${n}%` : k === "expire" ? `${n}개월` : `${won(n)} P`);

/* 시안 U-PC-SET-09 포인트 / 09_변경요청. 전 지점 공통 (scope all) — 대표관리자만 바로 바꾸고, 관리자는 요청해요. */
export default function PointsPage() {
  const { owner, me } = useLead();
  const { data, save } = useSettings("all");
  const orig = val(data, "points", POINTS0);
  const [v, setV] = useState<Points>(POINTS0);
  const [req, setReq] = useState<{ k: K; to: number } | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val(data, "points", POINTS0)); }, [data]);
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  const set = (p: Partial<Points>) => setV({ ...v, ...p });

  async function onSave() {
    const ch = ITEMS.filter((i) => v[i.k] !== orig[i.k]).map((i) => `${i.l} ${show(i.k, orig[i.k])} → ${show(i.k, v[i.k])}`);
    if (v.ex_disc !== orig.ex_disc) ch.push(`할인 금액 제외 ${v.ex_disc ? "켬" : "끔"}`);
    if (v.ex_recv !== orig.ex_recv) ch.push(`미수 정산 제외 ${v.ex_recv ? "켬" : "끔"}`);
    setMsg(await save("points", v, ch.join(", ")) || "저장했어요");
  }
  async function sendReq() {
    if (!req) return;
    const it = ITEMS.find((i) => i.k === req.k)!;
    if (req.to === orig[req.k]) return setMsg("새 값을 적어 주세요");
    const e = await requestChange(me.branch, "points", { key: req.k, from: orig[req.k], to: req.to }, `${it.l} ${show(req.k, orig[req.k])} → ${show(req.k, req.to)}`);
    if (e) return setMsg(e);
    setReq(null); setMsg("요청했어요");
  }
  const row = (n: number, k: K) => {
    const it = ITEMS.find((i) => i.k === k)!;
    return (
      <ORow n={n} label={it.l}>
        {owner ? <><NumInp value={v[k]} width={k === "rate" || k === "expire" ? 80 : 100} dec={k === "rate"} onChange={(x) => set({ [k]: x } as Partial<Points>)} label={it.l} /><Help>{it.unit}{k === "expire" ? " · 마지막 적립일부터" : ""}</Help></>
          : <Help>{show(k, v[k])}{k === "expire" ? " · 마지막 적립일부터" : ""}</Help>}
      </ORow>
    );
  };

  return (
    <div className="ct">
      <PageH title="포인트" sub={`전 지점 공통 · ${req ? "규칙 변경 요청" : "적립과 사용 규칙"}`}>
        <Msg text={msg} />
        {owner ? <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>
          : req ? <button className="btn p sm" onClick={sendReq}>변경 요청</button>
          : <button className="btn p" onClick={() => setReq({ k: "rate", to: orig.rate })}>변경 요청</button>}
      </PageH>
      <div className="body">
        {req ? <>
          <Card title="규칙 변경 요청" className="req">
            <ORow n={1} label="항목"><select className="sel" value={req.k} onChange={(e) => { const k = e.target.value as K; setReq({ k, to: orig[k] }); }}>{ITEMS.map((i) => <option key={i.k} value={i.k}>{i.l}</option>)}</select></ORow>
            <ORow n={2} label="이전 값"><Help>{show(req.k, orig[req.k])}</Help></ORow>
            <ORow n={3} label="새 값"><NumInp value={req.to} width={80} dec={req.k === "rate"} onChange={(x) => setReq({ ...req, to: x })} label="새 값" /><Help>{ITEMS.find((i) => i.k === req.k)!.unit}</Help></ORow>
            <HelpD>요청하면 대표관리자에게 가요. 승인되기 전에는 규칙이 바뀌지 않아요.</HelpD>
          </Card>
          <Logs data={data} k="points" max={1} />
        </> : <>
          <div className="banner">규칙이 바뀌면 이후 적립·사용부터 적용돼요. 이미 적립된 포인트는 그대로 둬요. 전 지점에 같이 반영돼요.</div>
          <Card title="적립">
            {row(1, "rate")}
            <ORow n={2} label="할인 금액 제외"><Sw on={v.ex_disc} lock={!owner} onChange={(x) => set({ ex_disc: x })} label="할인 금액 제외" /><Help>할인된 금액에는 적립하지 않아요.</Help></ORow>
            <ORow n={3} label="미수 정산 제외"><Sw on={v.ex_recv} lock={!owner} onChange={(x) => set({ ex_recv: x })} label="미수 정산 제외" /><Help>미수를 받을 때는 적립하지 않아요.</Help></ORow>
          </Card>
          <Card title="사용 · 소멸">
            {row(4, "unit")}{row(5, "min")}{row(6, "expire")}
            <Logs data={data} k="points" max={1} />
          </Card>
        </>}
      </div>
    </div>
  );
}
