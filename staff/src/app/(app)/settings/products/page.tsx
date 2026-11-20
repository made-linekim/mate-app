"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won } from "@/lib/sales";
import { BranchOne, friendly, useBranchPick } from "../../membership/ui";

type It = { program_id: string; program?: string; count: number; unit_price?: number };
type P = { id: string; branch: string; name: string; kind: string; valid_days: number | null; price: number | null; face_amount: number | null; share_ok: boolean; app_visible: boolean; on_sale: boolean; items: It[]; sort: number; sold?: number };
type G = { id: string; name: string; active: boolean };

export default function ProductSettings() {
  const me = useMe();
  const owner = me.tier === "owner";
  const editable = canSee(me, "settings.edit");
  const [branch, setBranch] = useState(useBranchPick());
  const [rows, setRows] = useState<P[]>([]);
  const [progs, setProgs] = useState<G[]>([]);
  const [edit, setEdit] = useState<P | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.rpc("membership_products", { p_branch: branch, p_kind: null }), sb.rpc("program_admin_list")]);
    if (a.error) return setMsg(friendly(a.error.message));
    setRows((a.data ?? []) as P[]); setProgs(((b.data ?? []) as G[]).filter((g) => g.active));
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const mayEdit = (p: P) => editable && (p.branch !== "" || owner);
  async function save() {
    if (!edit?.name.trim()) return setMsg("이름을 적어 주세요");
    const p = { ...edit, items: edit.items.filter((i) => i.program_id).map(({ program_id, count, unit_price }) => ({ program_id, count, unit_price: unit_price ?? 0 })) };
    const { error } = await sb.rpc("product_save", { p });
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("저장했어요"); load();
  }
  const NEW: P = { id: "", branch, name: "", kind: "회차", valid_days: 180, price: 0, face_amount: 0, share_ok: true, app_visible: false, on_sale: true, items: [], sort: 0 };

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <BranchOne value={branch} onChange={setBranch} />
        {!editable && <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>보기만 할 수 있어요 (설정 변경 권한 필요)</span>}
        {msg && <span style={{ fontSize: "var(--fs-sm)", color: msg === "저장했어요" ? "var(--grn)" : "var(--red)" }}>{msg}</span>}
        {editable && <button className="btn p sm" style={{ marginLeft: "auto" }} onClick={() => setEdit({ ...NEW })}>상품 추가</button>}
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto", marginTop: 16 }}>
        <table className="t">
          <thead><tr><th>회원권명</th><th>종류</th><th>포함 관리</th><th style={{ textAlign: "right" }}>금액</th><th style={{ textAlign: "right" }}>유효기간</th><th>적용</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} style={{ color: p.on_sale ? undefined : "var(--ink-3)" }}>
                <td style={{ fontWeight: 600 }}>{p.name}</td><td>{p.kind}</td>
                <td style={{ fontSize: "var(--fs-sm)" }}>{p.items.length ? p.items.map((i) => `${i.program}${i.count ? ` ${i.count}회` : ""}`).join(", ") : "-"}</td>
                <td className="num" style={{ textAlign: "right" }}>{won(p.price)}</td>
                <td className="num" style={{ textAlign: "right" }}>{p.valid_days ? `${p.valid_days}일` : "-"}</td>
                <td>{p.branch || "전 지점"}</td>
                <td><span className={`badge ${p.on_sale ? "ok" : ""}`}>{p.on_sale ? "판매 중" : "판매 끝"}</span></td>
                <td style={{ textAlign: "right" }}>{mayEdit(p) && <button className="btn sm" onClick={() => setEdit({ ...p, items: p.items.map((i) => ({ ...i })) })}>수정</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <>
          <div className="dim" onClick={() => setEdit(null)} />
          <div className="drawer lg">
            <div className="hd">{edit.id ? "회원권 상품 수정" : "회원권 상품 추가"}</div>
            <div className="bd" style={{ display: "grid", gap: 12, alignContent: "start", fontSize: "var(--fs-sm)" }}>
              <label>회원권명<input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <div className="seg">{["회차", "기간", "금액"].map((k) => <button key={k} className={edit.kind === k ? "on" : ""} onClick={() => setEdit({ ...edit, kind: k })}>{k}권</button>)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label>판매가<input className="inp" type="number" min={0} step={1000} value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: +e.target.value })} /></label>
                <label>유효기간(일)<input className="inp" type="number" min={1} max={3650} value={edit.valid_days ?? 180} onChange={(e) => setEdit({ ...edit, valid_days: +e.target.value })} /></label>
                {edit.kind === "금액" && <label>충전 금액<input className="inp" type="number" min={0} step={1000} value={edit.face_amount ?? 0} onChange={(e) => setEdit({ ...edit, face_amount: +e.target.value })} /></label>}
              </div>
              {owner && (
                <label>적용 지점<select className="sel" value={edit.branch} onChange={(e) => setEdit({ ...edit, branch: e.target.value })}>
                  <option value="">전 지점</option><option>의정부점</option><option>양주점</option></select></label>
              )}
              {edit.kind !== "금액" && (
                <div>
                  <b>포함 관리</b>
                  {edit.items.map((it, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: 8, marginTop: 6 }}>
                      <select className="sel" value={it.program_id} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, program_id: e.target.value } : x)) })}>
                        <option value="">관리 고르기</option>{progs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <input className="inp" type="number" min={0} value={it.count} placeholder="회차" onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, count: +e.target.value } : x)) })} />
                      <button className="btn t sm" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}>빼기</button>
                    </div>
                  ))}
                  <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setEdit({ ...edit, items: [...edit.items, { program_id: "", count: 10 }] })}>관리 더하기</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className={`chip ${edit.share_ok ? "on" : ""}`} onClick={() => setEdit({ ...edit, share_ok: !edit.share_ok })}>가족 나눠쓰기 가능</button>
                <button className={`chip ${edit.app_visible ? "on" : ""}`} onClick={() => setEdit({ ...edit, app_visible: !edit.app_visible })}>고객앱에 보이기</button>
                <button className={`chip ${edit.on_sale ? "on" : ""}`} onClick={() => setEdit({ ...edit, on_sale: !edit.on_sale })}>판매 중</button>
              </div>
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>이미 판매한 회원권은 바뀌지 않아요. 새로 파는 것부터 적용돼요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setEdit(null)}>닫기</button><button className="btn p" onClick={save}>저장</button></div>
          </div>
        </>
      )}
    </>
  );
}
