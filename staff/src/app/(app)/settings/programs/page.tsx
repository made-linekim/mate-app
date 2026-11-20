"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won } from "@/lib/sales";
import { friendly } from "../../membership/ui";

type G = { id: string; name: string; short: string; grp: string; color: string; minutes: number; unit_price: number; capacity: number; branches: string[]; sort: number; active: boolean };
const GRPS = ["시술", "체험", "상담", "업무", "행사"];
const EMPTY: G = { id: "", name: "", short: "", grp: "시술", color: "#5F7FA8", minutes: 60, unit_price: 0, capacity: 1, branches: [...BRANCHES], sort: 0, active: true };

export default function Programs() {
  const me = useMe();
  const owner = me.tier === "owner";
  const [rows, setRows] = useState<G[]>([]);
  const [edit, setEdit] = useState<G | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("program_admin_list");
    if (error) return setMsg(friendly(error.message));
    setRows((data ?? []) as G[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!edit?.name.trim()) return setMsg("이름을 적어 주세요");
    const { error } = await sb.rpc("program_save", { p: edit });
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("저장했어요"); load();
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>관리 항목은 두 지점이 함께 써요. {owner ? "" : "수정은 대표관리자만 할 수 있어요."}</span>
        {msg && <span style={{ fontSize: "var(--fs-sm)", color: msg === "저장했어요" ? "var(--grn)" : "var(--red)" }}>{msg}</span>}
        {owner && <button className="btn p sm" style={{ marginLeft: "auto" }} onClick={() => setEdit({ ...EMPTY })}>관리 항목 추가</button>}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto", marginTop: 16 }}>
        <table className="t">
          <thead><tr><th>색</th><th>이름</th><th>줄임</th><th>분류</th><th style={{ textAlign: "right" }}>소요</th><th style={{ textAlign: "right" }}>단가</th><th style={{ textAlign: "right" }}>동시 인원</th><th>지점</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} style={{ color: g.active ? undefined : "var(--ink-3)" }}>
                <td><span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 4, background: g.color }} /></td>
                <td style={{ fontWeight: 600 }}>{g.name}</td><td>{g.short || "-"}</td><td>{g.grp}</td>
                <td className="num" style={{ textAlign: "right" }}>{g.minutes}분</td>
                <td className="num" style={{ textAlign: "right" }}>{won(g.unit_price)}</td>
                <td className="num" style={{ textAlign: "right" }}>{g.capacity}</td>
                <td>{g.branches?.length === BRANCHES.length ? "전 지점" : g.branches?.join(", ")}</td>
                <td><span className={`badge ${g.active ? "ok" : ""}`}>{g.active ? "사용" : "숨김"}</span></td>
                <td style={{ textAlign: "right" }}>{owner && <button className="btn sm" onClick={() => setEdit({ ...g })}>수정</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <>
          <div className="dim" onClick={() => setEdit(null)} />
          <div className="drawer">
            <div className="hd">{edit.id ? "관리 항목 수정" : "관리 항목 추가"}</div>
            <div className="bd" style={{ display: "grid", gap: 12, alignContent: "start", fontSize: "var(--fs-sm)" }}>
              <label>이름<input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label>줄임 이름 (예약표 칸)<input className="inp" value={edit.short} onChange={(e) => setEdit({ ...edit, short: e.target.value })} /></label>
              <label>분류<select className="sel" value={edit.grp} onChange={(e) => setEdit({ ...edit, grp: e.target.value })}>{GRPS.map((g) => <option key={g}>{g}</option>)}</select></label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label>소요(분)<input className="inp" type="number" min={10} max={600} step={10} value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: +e.target.value })} /></label>
                <label>단가<input className="inp" type="number" min={0} step={1000} value={edit.unit_price} onChange={(e) => setEdit({ ...edit, unit_price: +e.target.value })} /></label>
                <label>동시 인원<input className="inp" type="number" min={1} max={50} value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: +e.target.value })} /></label>
              </div>
              <label>색<input className="inp" type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value.toUpperCase() })} /></label>
              <div>지점
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  {BRANCHES.map((b) => {
                    const on = edit.branches.includes(b);
                    return <button key={b} className={`chip ${on ? "on" : ""}`} onClick={() => setEdit({ ...edit, branches: on ? edit.branches.filter((x) => x !== b) : [...edit.branches, b] })}>{b}</button>;
                  })}
                </div>
              </div>
              <div className="seg">
                <button className={edit.active ? "on" : ""} onClick={() => setEdit({ ...edit, active: true })}>사용</button>
                <button className={!edit.active ? "on" : ""} onClick={() => setEdit({ ...edit, active: false })}>숨김</button>
              </div>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>지난 예약·매출 기록은 그대로 남아요. 숨기면 새 예약에서만 안 보여요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setEdit(null)}>닫기</button><button className="btn p" onClick={save}>저장</button></div>
          </div>
        </>
      )}
    </>
  );
}
