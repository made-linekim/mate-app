"use client";
import { useEffect, useState } from "react";
import { Card, Chip, Help, HelpD, Msg, ORow, PageH, UseR, VRadio, Sw, pick3, useBranch, useLead, useSettings, val } from "../kit";
import { BOARD0, type Board } from "../defaults";

const VIEWS: { v: Board["view"]; l: string }[] = [{ v: "week", l: "주간" }, { v: "day", l: "일간" }, { v: "month", l: "월" }];
const ZOOM = [30, 50, 100];
const CNT = [1, 2, 3, 4, 5];
const DAYS = [3, 7, 14, 30];

/* 시안 U-PC-SET-02 예약표 */
export default function BoardPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val(data, "board", BOARD0);
  const [v, setV] = useState<Board>(BOARD0);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val(data, "board", BOARD0)); }, [data]);
  const edit = lead && !!data?.can_edit;
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  const set = (p: Partial<Board>) => setV({ ...v, ...p });
  async function onSave() { setMsg(await save("board", v, "예약표 표시 기준을 바꿨어요.") || "저장했어요"); }
  const ro = (t: string) => <span className="sel off">{t}</span>;

  return (
    <div className="ct">
      <PageH title="예약표" sub={`${branch} · 표 표시 기준`}>
        <Msg text={msg} />
        {edit && <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        {!edit && <HelpD>바꾸려면 관리자에게 요청해 주세요.</HelpD>}
        <Card title="기본 보기">
          <ORow n={1} label="시작 화면">
            <div className="reasons">{VIEWS.map((o) => <Chip key={o.v} on={v.view === o.v} disabled={!edit} onClick={() => set({ view: o.v })}>{o.l}</Chip>)}</div>
          </ORow>
          <ORow n={2} label="확대">
            {edit ? <VRadio value={v.zoom} options={pick3(ZOOM, v.zoom).map((z) => ({ v: z, l: `${z}%` }))} onChange={(z) => set({ zoom: z })} label="확대" /> : ro(`${v.zoom}%`)}
          </ORow>
          <ORow n={3} label="휴일 표시">
            {edit ? <UseR on={v.holiday} onChange={(x) => set({ holiday: x })} label="휴일 표시" /> : <Sw on={v.holiday} lock />}
            <Help>지점 휴무일은 흐리게 보여요.</Help>
          </ORow>
        </Card>
        <Card title="만료 임박 · 색">
          <ORow n={4} label="남은 횟수">
            {edit ? <VRadio value={v.warn_cnt} options={pick3(CNT, v.warn_cnt).map((c) => ({ v: c, l: `${c}회` }))} onChange={(c) => set({ warn_cnt: c })} label="남은 횟수" /> : ro(`${v.warn_cnt}회`)}
            <Help>이하면 임박으로 보여요.</Help>
          </ORow>
          <ORow n={5} label="남은 기간">
            {edit ? <VRadio value={v.warn_days} options={pick3(DAYS, v.warn_days).map((c) => ({ v: c, l: `${c}일` }))} onChange={(c) => set({ warn_days: c })} label="남은 기간" /> : ro(`${v.warn_days}일`)}
            <Help>이내면 임박으로 보여요.</Help>
          </ORow>
          <ORow n={6} label="노쇼 · 취소 색">
            <span className="swatch"><i className="dot amb" />노쇼 앰버</span>
            <span className="swatch"><i className="dot gray" />취소 회색</span>
            <Help>고정이에요. 바꾸지 않아요.</Help>
          </ORow>
          <HelpD>관리 항목 색은 팔레트 A를 써요.</HelpD>
        </Card>
      </div>
    </div>
  );
}
