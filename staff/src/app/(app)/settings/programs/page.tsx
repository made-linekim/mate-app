"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { friendly } from "../../membership/ui";
import { Drawer, saveErr, Help, HelpD, Logs, Msg, NumInp, ORow, PageH, Sw, UseR, requestChange, useBranch, useLead, useSettings, val, won } from "../kit";
import type { ProgFlags } from "../defaults";

type G = { id: string; name: string; short: string; grp: string; color: string; minutes: number; unit_price: number; capacity: number; branches: string[]; sort: number; active: boolean };
const GRPS = ["시술", "체험", "상담", "업무", "행사"];
const GN: Record<string, string> = { 시술: "관리" };
const EMPTY: G = { id: "", name: "", short: "", grp: "시술", color: "#5F7FA8", minutes: 60, unit_price: 0, capacity: 1, branches: [...BRANCHES], sort: 0, active: true };
const MINS = Array.from({ length: 24 }, (_, i) => (i + 1) * 10);

/* 시안 U-PC-SET-07 관리항목 (대표관리자: 바로 고침) / 07_변경요청 (관리자: 금액 변경 요청) */
export default function Programs() {
  const { branch } = useBranch();
  const { owner } = useLead();
  const { data, save: saveSet } = useSettings(branch);
  const [rows, setRows] = useState<G[]>([]);
  const [price, setPrice] = useState<Record<string, number>>({});
  const [edit, setEdit] = useState<G | null>(null);
  const [req, setReq] = useState<{ id: string; to: number } | null>(null);
  const [msg, setMsg] = useState("");
  const drawerOpen = !!edit;
  useEffect(() => { if (drawerOpen) setMsg(""); }, [drawerOpen]);
  const flags = val<ProgFlags>(data, "prog_flags", {});
  const fl = (id: string) => flags[id] ?? { disc: true, point: true };

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("program_admin_list");
    if (error) return setMsg(friendly(error.message));
    setRows(((data ?? []) as G[]).filter((g) => g.active)); setPrice({});
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, G[]>();
    rows.filter((g) => !g.branches?.length || g.branches.includes(branch)).forEach((g) => m.set(g.grp || "기타", [...(m.get(g.grp || "기타") ?? []), g]));
    return [...m.entries()].sort((a, b) => (GRPS.indexOf(a[0]) + 99) % 99 - (GRPS.indexOf(b[0]) + 99) % 99);
  }, [rows, branch]);

  async function save(g: G, close = true) {
    if (!g.name.trim()) return setMsg("이름을 적어 주세요");
    const { error } = await sb.rpc("program_save", { p: g });
    if (error) return setMsg(saveErr(error.message));
    if (close) setEdit(null);
    setMsg("저장했어요"); load();
  }
  async function savePrices() {
    for (const [id, p] of Object.entries(price)) {
      const g = rows.find((x) => x.id === id); if (!g || g.unit_price === p) continue;
      const { error } = await sb.rpc("program_save", { p: { ...g, unit_price: p } });
      if (error) return setMsg(friendly(error.message));
      await saveSet("prog_log", { id, from: g.unit_price, to: p }, `${g.name} 금액을 ${won(g.unit_price)}원에서 ${won(p)}원으로 바꿨어요.`);
    }
    setMsg("저장했어요"); load();
  }
  async function setFlag(g: G, k: "disc" | "point", v: boolean) {
    const n = { ...flags, [g.id]: { ...fl(g.id), [k]: v } };
    setMsg(await saveSet("prog_flags", n, `${g.name} ${k === "disc" ? "할인" : "적립"}을 ${v ? "켰어요" : "껐어요"}.`) || "저장했어요");
  }
  async function sendReq() {
    const g = rows.find((x) => x.id === req?.id); if (!g || !req) return;
    if (req.to === g.unit_price) return setMsg("새 금액을 적어 주세요");
    const e = await requestChange(branch, "program_price", { program_id: g.id, name: g.name, from: g.unit_price, to: req.to }, `${g.name} ${won(g.unit_price)}원 → ${won(req.to)}원`);
    if (e) return setMsg(e);
    setReq(null); setMsg("요청했어요");
  }
  const dirty = Object.entries(price).some(([id, p]) => rows.find((x) => x.id === id)?.unit_price !== p);
  const cur = rows.find((x) => x.id === req?.id);

  return (
    <div className="ct">
      <PageH title="관리 항목" sub={`${branch} · ${req ? "금액 변경 요청" : "시술 항목과 금액"}`}>
        <Msg text={msg} />
        {owner && dirty && <button className="btn p sm" onClick={savePrices}>저장</button>}
        {owner && <button className={`btn ${dirty ? "" : "p"} sm`} onClick={() => setEdit({ ...EMPTY })}>관리 항목 추가</button>}
        {!owner && (req ? <button className="btn p sm" onClick={sendReq}>변경 요청</button>
          : <button className="btn p sm" onClick={() => rows[0] && setReq({ id: rows[0].id, to: rows[0].unit_price })}>변경 요청</button>)}
      </PageH>
      <div className="body">
        <div className="banner">금액이 바뀌면 이후 결제부터 적용돼요. 이미 받은 결제에는 소급되지 않아요.{req ? " 전 지점에 같이 반영돼요." : ""}</div>
        {req && cur && (
          <div className="op-card req">
            <div className="sech"><h2>금액 변경 요청</h2></div>
            <ORow n={1} label="항목"><select className="sel" value={req.id} onChange={(e) => { const g = rows.find((x) => x.id === e.target.value)!; setReq({ id: g.id, to: g.unit_price }); }}>{rows.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></ORow>
            <ORow n={2} label="이전 금액"><Help>{won(cur.unit_price)}원</Help></ORow>
            <ORow n={3} label="새 금액"><NumInp value={req.to} width={120} onChange={(v) => setReq({ ...req, to: v })} label="새 금액" /><Help>원</Help></ORow>
            <HelpD>요청하면 대표관리자에게 가요. 승인되기 전에는 금액이 바뀌지 않아요.</HelpD>
          </div>
        )}
        <div className="tree op-card">
          {groups.map(([grp, list]) => [
            <div key={grp} className="g">{GN[grp] ?? grp}</div>,
            ...list.map((g) => req || !owner ? (
              <div key={g.id} className="item" style={!req ? { cursor: "pointer" } : undefined} onClick={() => !owner && !req && setReq({ id: g.id, to: g.unit_price })}>
                <span className="nm">{g.name}{req?.id === g.id && <> <span className="badge caution">요청 작성</span></>}</span><Help>{won(g.unit_price)}원</Help>
              </div>
            ) : (
              <div key={g.id} className="item">
                <span className="nm">{g.name}</span>
                <NumInp value={price[g.id] ?? g.unit_price} width={100} onChange={(v) => setPrice({ ...price, [g.id]: v })} label={`${g.name} 금액`} />
                <Help>원</Help>
                <Help>할인</Help><Sw on={fl(g.id).disc} onChange={(v) => setFlag(g, "disc", v)} label={`${g.name} 할인`} />
                <Help>적립</Help><Sw on={fl(g.id).point} onChange={(v) => setFlag(g, "point", v)} label={`${g.name} 적립`} />
                <span className="sp" />
                <button type="button" className="btn sm" onClick={() => setEdit({ ...g })}>수정</button>
              </div>
            )),
          ])}
          {groups.length === 0 && <HelpD>관리 항목이 없어요.</HelpD>}
        </div>
        <Logs data={data} k={["prog_log", "prog_flags"]} />
      </div>

      {edit && (
        <Drawer title={edit.id ? "관리 항목 고치기" : "관리 항목 추가"} err={msg} onClose={() => setEdit(null)} onOk={() => save(edit)}>
            <div className="st-form">
              <div className="field"><label>이름</label><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="two">
                <div className="field"><label>줄임 이름 (예약표 칸)</label><input className="inp" value={edit.short ?? ""} onChange={(e) => setEdit({ ...edit, short: e.target.value })} /></div>
                <div className="field"><label>분류</label><select className="sel" value={edit.grp} onChange={(e) => setEdit({ ...edit, grp: e.target.value })}>{GRPS.map((g) => <option key={g}>{g}</option>)}</select></div>
              </div>
              <div className="two">
                <div className="field"><label>소요 시간</label>
                  <select className="sel" value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: +e.target.value })}>
                    {(MINS.includes(edit.minutes) ? MINS : [edit.minutes, ...MINS]).map((m) => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
                <div className="field"><label>금액</label><input className="inp num" type="number" min={0} step={1000} value={edit.unit_price} onChange={(e) => setEdit({ ...edit, unit_price: +e.target.value })} /></div>
              </div>
              <div className="field"><label>같은 시간 최대 예약</label>
                <div className="st-step">
                  <button type="button" aria-label="줄이기" onClick={() => setEdit({ ...edit, capacity: Math.max(1, edit.capacity - 1) })}>−</button>
                  <b>{edit.capacity}</b>
                  <button type="button" aria-label="늘리기" onClick={() => setEdit({ ...edit, capacity: Math.min(50, edit.capacity + 1) })}>+</button>
                </div>
              </div>
              <div className="field"><label>예약표 색</label><input className="inp" type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value.toUpperCase() })} style={{ width: 80, padding: 4 }} /></div>
              <div className="field"><label>지점</label>
                <div className="row">
                  {BRANCHES.map((b) => {
                    const on = edit.branches.includes(b);
                    return <button key={b} type="button" className={`chip ${on ? "on" : ""}`} onClick={() => setEdit({ ...edit, branches: on ? edit.branches.filter((x) => x !== b) : [...edit.branches, b] })}>{b}</button>;
                  })}
                </div>
              </div>
              <div className="field"><label>사용</label>
                <div className="row"><UseR on={!!edit.active} label="사용" onChange={(v) => setEdit({ ...edit, active: v })} /><span className="st-ro">{edit.active ? "새 예약에서 골라요" : "숨김 · 새 예약에서 안 보여요"}</span></div>
              </div>
              <p className="help">지난 예약·매출 기록은 그대로 남아요. 숨기면 새 예약에서만 안 보여요.</p>
            </div>
        </Drawer>
      )}
    </div>
  );
}
