"use client";
import { useEffect, useState } from "react";
import { Card, Help, HelpD, Msg, ORow, PageH, Sw, UseR, VRadio, pick3, useBranch, useLead, useSettings, val } from "../kit";
import { BASIC0, type Basic } from "../defaults";

const UNIT = [10, 20, 30, 50, 60];
const DUR = [30, 50, 60, 90, 120];

/* 시안 U-PC-SET-01 기본 (직원은 U-PC-SET-01_기본_직원: 보기만) */
export default function BasicPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const [v, setV] = useState<Basic>(BASIC0(branch));
  const [msg, setMsg] = useState("");
  const orig = val(data, "basic", BASIC0(branch));
  useEffect(() => { setV(val(data, "basic", BASIC0(branch))); }, [data, branch]);
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  const edit = lead && !!data?.can_edit;
  const set = (p: Partial<Basic>) => setV({ ...v, ...p });

  async function onSave() {
    if (!dirty) return;
    const ch = (["name", "addr", "tel", "mask", "unit", "dur", "overlap"] as const).filter((k) => v[k] !== orig[k]);
    const L: Record<string, string> = { name: "지점 이름", addr: "주소", tel: "전화", mask: "전화번호 가림", unit: "예약 단위", dur: "기본 소요", overlap: "겹침 예약" };
    setMsg(await save("basic", v, `${ch.map((k) => L[k]).join(", ")}을 바꿨어요.`) || "저장했어요");
  }

  return (
    <div className="ct">
      <PageH title="기본" sub={`${branch} · 지점 기본 정보`}>
        <Msg text={msg} />
        {edit && <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        {!edit && <HelpD>바꾸려면 관리자에게 요청해 주세요.</HelpD>}
        <Card title="지점 정보">
          <ORow n={1} label="지점 이름"><input className={`inp ${edit ? "" : "off"}`} style={{ width: 280 }} value={v.name} disabled={!edit} onChange={(e) => set({ name: e.target.value })} aria-label="지점 이름" /></ORow>
          <ORow n={2} label="주소"><input className={`inp ${edit ? "" : "off"}`} style={{ width: 400 }} value={v.addr} disabled={!edit} onChange={(e) => set({ addr: e.target.value })} aria-label="주소" /></ORow>
          <ORow n={3} label="전화"><input className={`inp ${edit ? "" : "off"}`} style={{ width: 200 }} value={v.tel} disabled={!edit} inputMode="tel" onChange={(e) => set({ tel: e.target.value })} aria-label="전화" /></ORow>
          <ORow n={4} label="전화번호 가림">
            {edit ? <UseR on={v.mask} onChange={(x) => set({ mask: x })} label="전화번호 가림" /> : <Sw on={v.mask} lock />}
            <Help>목록과 화면에는 가린 번호로 보여요.</Help>
          </ORow>
        </Card>
        <Card title="예약 기본">
          <ORow n={5} label="예약 단위">
            {edit ? <VRadio value={v.unit} options={pick3(UNIT, v.unit).map((m) => ({ v: m, l: `${m}분` }))} onChange={(x) => set({ unit: x })} label="예약 단위" />
              : <span className="sel off">{v.unit}분</span>}
          </ORow>
          <ORow n={6} label="기본 소요">
            {edit ? <VRadio value={v.dur} options={pick3(DUR, v.dur).map((m) => ({ v: m, l: `${m}분` }))} onChange={(x) => set({ dur: x })} label="기본 소요" />
              : <span className="sel off">{v.dur}분</span>}
          </ORow>
          <ORow n={7} label="겹침 예약">
            {edit ? <UseR on={v.overlap} onChange={(x) => set({ overlap: x })} label="겹침 예약" /> : <Sw on={v.overlap} lock />}
            <Help>1단계에서는 같은 관리실·담당·고객이 겹치면 저장하지 않아요.</Help>
          </ORow>
        </Card>
      </div>
    </div>
  );
}
