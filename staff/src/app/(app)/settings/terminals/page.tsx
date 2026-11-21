"use client";
import { useState, useEffect } from "react";
import { Confirm, Drawer, Field, HelpD, Logs, Msg, PageH, useBranch, useLead, useSettings, val } from "../kit";
import type { Terminal } from "../defaults";

const mask = (no: string) => (no.length <= 4 ? no : `${no.slice(0, Math.min(4, no.length - 2))}-****${no.slice(-2)}`);

/* 시안 U-PC-SET-17 카드단말기 + 17_단말기해제확인. 단말기 목록은 settings 'terminals'. 최근 결제는 단말기 결제 연동 뒤에 채워요. */
export default function TerminalsPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const list = val<Terminal[]>(data, "terminals", []);
  const edit = lead && !!data?.can_edit;
  const [ask, setAsk] = useState<number | null>(null);
  const [add, setAdd] = useState<Terminal | null>(null);
  const [msg, setMsg] = useState("");
  const drawerOpen = !!add;
  useEffect(() => { if (drawerOpen) setMsg(""); }, [drawerOpen]);

  async function put(l: Terminal[], note: string) { setMsg(await save("terminals", l, note) || "저장했어요"); }
  async function off() {
    if (ask == null) return; const t = list[ask]; setAsk(null);
    await put(list.map((x, i) => (i === ask ? { ...x, on: false } : x)), `${t.place} 단말기를 해제했어요.`);
  }
  async function on(i: number) { await put(list.map((x, j) => (j === i ? { ...x, on: true } : x)), `${list[i].place} 단말기를 연결했어요.`); }
  async function submit() {
    if (!add?.place.trim() || !add.no.trim()) return setMsg("위치와 기기 번호를 적어 주세요");
    await put([...list, { ...add, place: add.place.trim(), no: add.no.trim() }], `${add.place.trim()} 단말기를 추가했어요.`); setAdd(null);
  }

  return (
    <div className="ct">
      <PageH title="카드 단말기" sub={`${branch} · 연결과 최근 결제`}>
        <Msg text={msg} />
        {edit && <button className="btn p sm" onClick={() => setAdd({ place: "", no: "", on: true })}>단말기 추가</button>}
      </PageH>
      {pick}
      <div className="body">
        <div className="ltool"><span className="help">{branch} · {list.length}대</span></div>
        <div className="v3card">
          <table className="tbl">
            <tbody>
              <tr><th>위치</th><th>기기 번호</th><th>상태</th><th>최근 결제</th><th className="num">금액</th><th>{edit ? "관리" : ""}</th></tr>
              {list.map((t, i) => (
                <tr key={i}>
                  <td>{t.place}</td><td>{mask(t.no)}</td>
                  <td><span className={`badge ${t.on ? "ok" : ""}`}>{t.on ? "연결됨" : "연결 안 됨"}</span></td>
                  <td>—</td><td className="num">—</td>
                  <td>{edit && (t.on ? <button type="button" className="btn sm" onClick={() => setAsk(i)}>해제</button> : <button type="button" className="btn sm" onClick={() => on(i)}>연결</button>)}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={6}>아직 넣은 단말기가 없어요</td></tr>}
            </tbody>
          </table>
        </div>
        <Logs data={data} k="terminals" max={1} />
      </div>
      {ask != null && <Confirm title="이 단말기를 해제할까요?" lines={[`${list[ask].place} · ${mask(list[ask].no)}`, "해제하면 이 단말기로는 결제할 수 없어요.", "해제한 시각은 기록에 남아요."]} ok="해제" onOk={off} onClose={() => setAsk(null)} />}
      {add && (
        <Drawer title="단말기 추가" err={msg} onClose={() => setAdd(null)} onOk={submit}>
          <Field label="위치"><input className="inp" value={add.place} maxLength={20} placeholder="예: 앞 데스크" onChange={(e) => setAdd({ ...add, place: e.target.value })} /></Field>
          <Field label="기기 번호"><input className="inp" value={add.no} maxLength={40} onChange={(e) => setAdd({ ...add, no: e.target.value })} /></Field>
          <HelpD>기기 번호는 목록에서 가려 보여요.</HelpD>
        </Drawer>
      )}
    </div>
  );
}
