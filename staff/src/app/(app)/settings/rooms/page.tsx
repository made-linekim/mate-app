"use client";
import { useState } from "react";
import { Drawer, Field, HelpD, Msg, NumInp, PageH, useBranch, useLead, useSettings, val } from "../kit";
import type { Room } from "../defaults";

/* 시안 U-PC-SET-05 관리실 */
export default function RoomsPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const rooms = val<Room[]>(data, "rooms", []);
  const edit = lead && !!data?.can_edit;
  const [ed, setEd] = useState<{ i: number; r: Room } | null>(null);
  const [msg, setMsg] = useState("");

  async function put(list: Room[], note: string) { setMsg(await save("rooms", list, note) || "저장했어요"); }
  function move(i: number, d: number) {
    const j = i + d; if (j < 0 || j >= rooms.length) return;
    const l = rooms.slice(); [l[i], l[j]] = [l[j], l[i]];
    put(l, `${rooms[i].name} 순서를 바꿨어요.`);
  }
  async function submit() {
    if (!ed) return;
    if (!ed.r.name.trim()) return setMsg("이름을 적어 주세요");
    const l = rooms.slice();
    if (ed.i < 0) l.push(ed.r); else l[ed.i] = ed.r;
    await put(l, ed.i < 0 ? `${ed.r.name}을 추가했어요.` : `${ed.r.name}을 고쳤어요.`);
    setEd(null);
  }
  async function del() {
    if (!ed || ed.i < 0) return;
    await put(rooms.filter((_, k) => k !== ed.i), `${rooms[ed.i].name}을 지웠어요.`);
    setEd(null);
  }
  const multi = rooms.filter((r) => r.cap > 1);
  const single = rooms.filter((r) => r.cap <= 1);

  return (
    <div className="ct">
      <PageH title="관리실" sub={`${branch} · 예약 위치`}>
        <Msg text={msg} />
        {edit && <button className="btn p sm" onClick={() => setEd({ i: -1, r: { name: "", uses: "", cap: 1 } })}>관리실 추가</button>}
      </PageH>
      {pick}
      <div className="body">
        <div className="ltool"><span className="help">{branch} · {rooms.length}곳</span></div>
        <div className="v3card">
          <table className="tbl">
            <tbody>
              <tr><th>순서</th><th>이름</th><th>쓰는 관리</th><th className="num">동시 인원</th><th>{edit ? "관리" : ""}</th></tr>
              {rooms.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td><td>{r.name}</td><td>{r.uses || "—"}</td><td className="num">{r.cap}</td>
                  <td>{edit && <><span className="ord"><button type="button" className="btn sm" disabled={i === 0} onClick={() => move(i, -1)}>위</button><button type="button" className="btn sm" disabled={i === rooms.length - 1} onClick={() => move(i, 1)}>아래</button></span> <button type="button" className="btn sm" onClick={() => setEd({ i, r: { ...r } })}>수정</button></>}</td>
                </tr>
              ))}
              {rooms.length === 0 && <tr><td colSpan={5}>아직 넣은 관리실이 없어요</td></tr>}
            </tbody>
          </table>
        </div>
        <HelpD>
          {[multi.length ? `${multi.map((r) => r.name).join("·")}은 한 시간에 ${multi.map((r) => r.cap).join("·")}명까지 넣을 수 있어요.` : "",
            single.length ? `${single.map((r) => r.name).join("·")}은 1명이에요.` : "",
            "같은 담당이나 같은 고객이 겹치면 동시 인원과 상관없이 막아요."].filter(Boolean).join(" ")}
        </HelpD>
      </div>
      {ed && (
        <Drawer title={ed.i < 0 ? "관리실 추가" : "관리실 고치기"} onClose={() => setEd(null)} onOk={submit}>
          <Field label="이름"><input className="inp" value={ed.r.name} maxLength={20} placeholder="예: 1번실" onChange={(e) => setEd({ ...ed, r: { ...ed.r, name: e.target.value } })} /></Field>
          <Field label="쓰는 관리"><input className="inp" value={ed.r.uses} maxLength={60} placeholder="예: 올케어 · 석션" onChange={(e) => setEd({ ...ed, r: { ...ed.r, uses: e.target.value } })} /></Field>
          <Field label="동시 인원"><NumInp value={ed.r.cap} width={80} onChange={(v) => setEd({ ...ed, r: { ...ed.r, cap: Math.max(1, Math.min(20, v)) } })} label="동시 인원" /></Field>
          {ed.i >= 0 && <button type="button" className="btn" onClick={del}>이 관리실 지우기</button>}
        </Drawer>
      )}
    </div>
  );
}
