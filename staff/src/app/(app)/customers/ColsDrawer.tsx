"use client";
// 항목 편집 (U-PC-CUS-3 v3): 성명은 고정, PC 10칸 · 모바일 4칸까지. 나만 보는 칸은 이 기기에, 지점 기본값은 관리자 이상이 서버에 저장.
import { useState } from "react";
import { Ico } from "@/lib/ico";

export type ColKey = string;
export type ColPrefs = { pc: ColKey[]; m: ColKey[] }; // 보이는 칸, 순서대로
export const ALL_COLS: { k: ColKey; l: string }[] = [
  { k: "phone", l: "휴대전화" }, { k: "ms", l: "보유 회원권" }, { k: "rem", l: "잔여" }, { k: "st", l: "상태" },
  { k: "lounge", l: "라운지" }, { k: "mgr", l: "담당자" }, { k: "reg", l: "등록일" }, { k: "visit", l: "최근 방문" },
  { k: "next", l: "다음 예약" }, { k: "src", l: "등록 경로" },
];
export const DEFAULT_COLS: ColPrefs = { pc: ["phone", "ms", "rem", "st", "lounge", "mgr", "visit", "next"], m: ["ms", "rem", "visit"] };
const MAX = { pc: 10, m: 4 } as const;
export const colLabel = (k: ColKey) => ALL_COLS.find((c) => c.k === k)?.l ?? k;

export default function ColsDrawer({ value, branchDefault, canBranch, onClose, onSave, onSaveBranch }: {
  value: ColPrefs; branchDefault: ColPrefs; canBranch: boolean;
  onClose: () => void; onSave: (v: ColPrefs) => void; onSaveBranch: (v: ColPrefs) => void;
}) {
  const [v, setV] = useState<ColPrefs>(value);
  const [tab, setTab] = useState<"pc" | "m">("pc");
  const [drag, setDrag] = useState<string | null>(null);
  const on = v[tab];
  // 켜진 칸(순서대로) 먼저, 그다음 꺼진 칸
  const order = [...on, ...ALL_COLS.map((c) => c.k).filter((k) => !on.includes(k))];
  const toggle = (k: ColKey) => setV({ ...v, [tab]: on.includes(k) ? on.filter((x) => x !== k) : on.length >= MAX[tab] ? on : [...on, k] });
  const move = (from: ColKey, to: ColKey) => {
    if (!on.includes(from) || !on.includes(to) || from === to) return;
    const a = on.filter((x) => x !== from); a.splice(a.indexOf(to) + (on.indexOf(from) < on.indexOf(to) ? 1 : 0), 0, from);
    setV({ ...v, [tab]: a });
  };
  return (
    <>
      <div className="cd-mask" onClick={onClose} />
      <aside className="cd" role="dialog" aria-label="항목 편집">
        <div className="cd-hd"><b>항목 편집</b><span className="sp" /><button className="btn sm g" onClick={onClose}>닫기</button></div>
        <div className="cd-sc">
          <div className="cd-note"><Ico n="info" /><span>성명은 항상 보여요. PC는 10칸, 모바일은 4칸까지예요. 지점 기본값은 관리자 이상이 저장해요.</span></div>
          <div className="cd-seg"><button className={tab === "pc" ? "on" : ""} onClick={() => setTab("pc")}>PC</button><button className={tab === "m" ? "on" : ""} onClick={() => setTab("m")}>모바일</button></div>
          <div className="cd-help">{tab === "pc" ? "PC" : "모바일"}는 최대 {MAX[tab]}칸이에요. 지금 {on.length + 1} / {MAX[tab]}.</div>
          <div className="cd-row lock"><span className="hd4"><i /><i /><i /><i /></span><span className="box on"><Ico n="check" s={12} /></span><span className="nm">성명 <span className="cd-help">고정</span></span></div>
          {order.map((k) => {
            const c = on.includes(k);
            return (
              <div key={k} className={`cd-row ${drag === k ? "drag" : ""}`} draggable={c}
                onDragStart={() => setDrag(k)} onDragEnd={() => setDrag(null)} onDragOver={(e) => { e.preventDefault(); if (drag) move(drag, k); }}>
                <span className="hd4" aria-hidden><i /><i /><i /><i /></span>
                <button className={`box ${c ? "on" : ""}`} onClick={() => toggle(k)} aria-label={`${colLabel(k)} ${c ? "끄기" : "켜기"}`} disabled={!c && on.length >= MAX[tab] - 1}>{c && <Ico n="check" s={12} />}</button>
                <span className="nm" onClick={() => toggle(k)}>{colLabel(k)}</span>
              </div>
            );
          })}
          {!canBranch && <div className="cd-help" style={{ marginTop: 12 }}>직원은 나만 보는 칸을 저장할 수 있어요. 지점 기본값은 바꿀 수 없어요.</div>}
        </div>
        <div className="cd-ft">
          <div className="cd-help">미리보기</div>
          <div className="cd-pv"><em>성명</em>{on.map((k) => <em key={k}>{colLabel(k)}</em>)}</div>
          <div className="cd-bt">
            <button className="btn g" onClick={() => setV(branchDefault)}>기본값으로</button>
            <span className="sp" />
            {canBranch && <button className="btn" onClick={() => onSaveBranch(v)}>지점 기본값으로 저장</button>}
            <button className="btn p" onClick={() => onSave(v)}>저장</button>
          </div>
        </div>
      </aside>
    </>
  );
}
