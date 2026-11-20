"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won } from "@/lib/sales";
import { friendly } from "../../membership/ui";
import { Head, Ico, IconBtn, Msg, Switch, periodLabel, useSetBranch } from "../ui";

type It = { program_id: string; program?: string; count: number; unit_price?: number };
type P = { id: string; branch: string; name: string; kind: string; valid_days: number | null; price: number | null; face_amount: number | null; share_ok: boolean; app_visible: boolean; on_sale: boolean; items: It[]; sort: number; sold?: number };
type G = { id: string; name: string; active: boolean };
const KINDS = ["회차", "기간", "금액"];

export default function ProductSettings() {
  const me = useMe();
  const owner = me.tier === "owner";
  const editable = canSee(me, "settings.edit");
  const branch = useSetBranch();
  const [kind, setKind] = useState("회차");
  const [rows, setRows] = useState<P[]>([]);
  const [progs, setProgs] = useState<G[]>([]);
  const [edit, setEdit] = useState<P | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.rpc("membership_products", { p_branch: branch, p_kind: null }), sb.rpc("program_admin_list")]);
    if (a.error) return setMsg(friendly(a.error.message));
    setRows((a.data ?? []) as P[]); setProgs(((b.data ?? []) as G[]).filter((g) => g.active));
  }, [branch]);
  useEffect(() => { setMsg(""); load(); }, [load]);

  const mayEdit = (p: P) => editable && (p.branch !== "" || owner);
  async function save() {
    if (!edit?.name.trim()) return setMsg("이름을 적어 주세요");
    const p = { ...edit, items: edit.items.filter((i) => i.program_id).map(({ program_id, count, unit_price }) => ({ program_id, count, unit_price: unit_price ?? 0 })) };
    const { error } = await sb.rpc("product_save", { p });
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("저장했어요"); load();
  }
  const NEW: P = { id: "", branch, name: "", kind, valid_days: 180, price: 0, face_amount: 0, share_ok: true, app_visible: false, on_sale: true, items: [], sort: 0 };
  const shown = rows.filter((p) => p.kind === kind);
  const count = (k: string) => rows.filter((p) => p.kind === k).length;
  const progNames = (p: P) => (p.kind === "금액" ? `충전 ${won(p.face_amount)}` : p.items.map((i) => i.program).filter(Boolean).join(", ") || "-");
  const counts = (p: P) => (p.kind === "회차" && p.items.length ? p.items.map((i) => i.count).join(" · ") : "-");

  return (
    <>
      <Head title="회원권 상품"><Msg text={msg} />{!editable && <span className="st-ro">보기만 할 수 있어요</span>}</Head>
      <div className="st-bar">
        <div className="seg">{KINDS.map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}권 <span className="num" style={{ marginLeft: 4, color: "var(--ink-4)" }}>{count(k)}</span></button>)}</div>
        {editable && <div className="st-right"><button className="btn p" onClick={() => setEdit({ ...NEW })}><Ico n="plus" />회원권 상품 추가</button></div>}
      </div>

      <div className="st-tbl st-pc">
        <table className="t">
          <thead><tr><th>회원권명</th><th>관리명</th><th className="r">관리 회차</th><th className="r">금액</th><th>유효기간</th><th>적용</th><th>상태</th><th style={{ width: 64 }}>관리</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className={p.on_sale ? "" : "mute"}>
                <td className="nm">{p.name}</td>
                <td>{progNames(p)}</td>
                <td className="r num">{counts(p)}</td>
                <td className="r num">{won(p.price)}</td>
                <td className="num">{periodLabel(p.valid_days)}</td>
                <td>{p.branch || "전 지점"}</td>
                <td><span className={`badge ${p.on_sale ? "ok" : ""}`}>{p.on_sale ? "판매 중" : "판매 끝"}</span></td>
                <td>{mayEdit(p) && <IconBtn n="edit" label="고치기" onClick={() => setEdit({ ...p, items: p.items.map((i) => ({ ...i })) })} />}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="none">{kind}권 상품이 없어요</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="st-m">
        <div className="st-list">
          {shown.map((p) => (
            <button key={p.id} disabled={!mayEdit(p)} onClick={() => setEdit({ ...p, items: p.items.map((i) => ({ ...i })) })} style={{ opacity: p.on_sale ? 1 : 0.5 }}>
              <span className="tx"><b>{p.name}{!p.on_sale && <span className="badge">판매 끝</span>}</b>
                <span className="num">{progNames(p)}{p.kind === "회차" && p.items.length ? ` · ${counts(p)}회` : ""} · {won(p.price)}원 · {periodLabel(p.valid_days)}</span></span>
              {mayEdit(p) && <span className="ch"><Ico n="chev" /></span>}
            </button>
          ))}
          {shown.length === 0 && <p className="st-foot">{kind}권 상품이 없어요</p>}
        </div>
      </div>

      {edit && (
        <>
          <div className="dim" onClick={() => setEdit(null)} />
          <div className="drawer lg" role="dialog" aria-label="회원권 상품">
            <div className="hd">{edit.id ? "회원권 상품 고치기" : "회원권 상품 추가"}</div>
            <div className="bd st-form">
              <div className="field"><label>회원권명</label><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="field"><label>종류</label>
                <div className="seg">{KINDS.map((k) => <button key={k} type="button" className={edit.kind === k ? "on" : ""} onClick={() => setEdit({ ...edit, kind: k })}>{k}권</button>)}</div>
              </div>
              <div className="three">
                <div className="field"><label>판매가</label><input className="inp num" type="number" min={0} step={1000} value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: +e.target.value })} /></div>
                <div className="field"><label>유효기간(일)</label><input className="inp num" type="number" min={1} max={3650} value={edit.valid_days ?? 180} onChange={(e) => setEdit({ ...edit, valid_days: +e.target.value })} /></div>
                {edit.kind === "금액" && <div className="field"><label>충전 금액</label><input className="inp num" type="number" min={0} step={1000} value={edit.face_amount ?? 0} onChange={(e) => setEdit({ ...edit, face_amount: +e.target.value })} /></div>}
              </div>
              {owner && (
                <div className="field"><label>적용 지점</label>
                  <select className="sel" value={edit.branch} onChange={(e) => setEdit({ ...edit, branch: e.target.value })}>
                    <option value="">전 지점</option><option>의정부점</option><option>양주점</option>
                  </select>
                </div>
              )}
              {edit.kind !== "금액" && (
                <div className="field"><label>포함 관리</label>
                  <div style={{ display: "grid", gap: 8 }}>
                    {edit.items.map((it, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 96px 32px", gap: 8, alignItems: "center" }}>
                        <select className="sel" value={it.program_id} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, program_id: e.target.value } : x)) })}>
                          <option value="">관리 고르기</option>{progs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <input className="inp num" type="number" min={0} value={it.count} placeholder="회차" aria-label="회차" onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, count: +e.target.value } : x)) })} />
                        <IconBtn n="trash" label="빼기" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })} />
                      </div>
                    ))}
                    <div><button type="button" className="btn sm" onClick={() => setEdit({ ...edit, items: [...edit.items, { program_id: "", count: 10 }] })}><Ico n="plus" s={14} />관리 더하기</button></div>
                  </div>
                </div>
              )}
              <div className="field"><label>옵션</label>
                <div style={{ display: "grid", gap: 10 }}>
                  {([["share_ok", "가족 나눠쓰기 가능"], ["app_visible", "고객앱에 보이기"], ["on_sale", "판매 중"]] as const).map(([k, l]) => (
                    <div key={k} className="row"><Switch on={edit[k]} label={l} onChange={(v) => setEdit({ ...edit, [k]: v })} /><span>{l}</span></div>
                  ))}
                </div>
              </div>
              <p className="help">이미 판매한 회원권은 바뀌지 않아요. 새로 파는 것부터 적용돼요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setEdit(null)}>닫기</button><button className="btn p" onClick={save}>저장</button></div>
          </div>
        </>
      )}
    </>
  );
}
