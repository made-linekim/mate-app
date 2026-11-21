"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { has } from "@/lib/perm";
import { friendly } from "../../membership/ui";
import { periodLabel } from "../ui";
import { Chip, Drawer, Help, HelpD, Logs, Msg, NumInp, ORow, PageH, UseR, requestChange, useBranch, useLead, useSettings, won } from "../kit";

type It = { program_id: string; program?: string; count: number; unit_price?: number };
type P = { id: string; branch: string; name: string; kind: string; valid_days: number | null; price: number | null; face_amount: number | null; share_ok: boolean; app_visible: boolean; on_sale: boolean; items: It[]; sort: number; sold?: number };
type G = { id: string; name: string; active: boolean };
const KINDS = ["회차", "기간", "금액"];

/* 시안 U-PC-SET-08 회원권상품 / 08_변경요청 (관리자는 금액을 바로 못 바꾸고 요청해요) */
export default function ProductSettings() {
  const { me, owner } = useLead();
  const editable = has(me, "settings.edit", false);
  const { branch, pick } = useBranch();
  const { data } = useSettings(branch);
  const [kind, setKind] = useState("회차");
  const [rows, setRows] = useState<P[]>([]);
  const [progs, setProgs] = useState<G[]>([]);
  const [edit, setEdit] = useState<P | null>(null);
  const [req, setReq] = useState<{ id: string; to: number } | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([sb.rpc("membership_products", { p_branch: branch, p_kind: null }), sb.rpc("program_admin_list")]);
    if (a.error) return setMsg(friendly(a.error.message));
    setRows((a.data ?? []) as P[]); setProgs(((b.data ?? []) as G[]).filter((g) => g.active));
  }, [branch]);
  useEffect(() => { setMsg(""); load(); }, [load]);

  async function save() {
    if (!edit?.name.trim()) return setMsg("이름을 적어 주세요");
    const p = { ...edit, items: edit.items.filter((i) => i.program_id).map(({ program_id, count, unit_price }) => ({ program_id, count, unit_price: unit_price ?? 0 })) };
    const { error } = await sb.rpc("product_save", { p });
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("저장했어요"); load();
  }
  async function sendReq() {
    const p = rows.find((x) => x.id === req?.id); if (!p || !req) return;
    if (req.to === (p.price ?? 0)) return setMsg("새 금액을 적어 주세요");
    const e = await requestChange(branch, "product_price", { product_id: p.id, name: p.name, from: p.price, to: req.to }, `${p.name} ${won(p.price)}원 → ${won(req.to)}원`);
    if (e) return setMsg(e);
    setReq(null); setMsg("요청했어요");
  }
  const NEW: P = { id: "", branch, name: "", kind, valid_days: 180, price: 0, face_amount: 0, share_ok: true, app_visible: false, on_sale: true, items: [], sort: 0 };
  const shown = rows.filter((p) => p.kind === kind);
  const progNames = (p: P) => (p.kind === "금액" ? `충전 ${won(p.face_amount)}` : p.items.map((i) => i.program).filter(Boolean).join(", ") || "—");
  const counts = (p: P) => (p.kind === "회차" && p.items.length ? p.items.map((i) => `${i.count}회`).join(" · ") : "—");
  const cur = rows.find((x) => x.id === req?.id);
  const open = (p: P) => setEdit({ ...p, items: p.items.map((i) => ({ ...i })) });

  return (
    <div className="ct">
      <PageH title="회원권 상품" sub={`${branch} · ${req ? "금액 변경 요청" : "회차권 · 기간권 · 금액권"}`}>
        <Msg text={msg} />
        {req ? <button className="btn p sm" onClick={sendReq}>변경 요청</button>
          : editable && <button className="btn p sm" onClick={() => setEdit({ ...NEW })}>회원권 추가</button>}
      </PageH>
      {pick}
      <div className="body">
        {!req && <div className="ltool"><div className="reasons">{KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{k}권</Chip>)}</div></div>}
        <div className="banner">금액이 바뀌면 이후 결제부터 적용돼요. 이미 받은 결제에는 소급되지 않아요. 전 지점에 같이 반영돼요.</div>
        {req && cur && (
          <div className="op-card req">
            <div className="sech"><h2>금액 변경 요청</h2><span className="sp" /><button type="button" className="btn sm" onClick={() => setReq(null)}>닫기</button></div>
            <ORow n={1} label="상품"><select className="sel" value={req.id} onChange={(e) => { const p = rows.find((x) => x.id === e.target.value)!; setReq({ id: p.id, to: p.price ?? 0 }); }}>{rows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></ORow>
            <ORow n={2} label="이전 금액"><Help>{won(cur.price)}원</Help></ORow>
            <ORow n={3} label="새 금액"><NumInp value={req.to} width={120} onChange={(v) => setReq({ ...req, to: v })} label="새 금액" /><Help>원</Help></ORow>
            <HelpD>요청하면 대표관리자에게 가요. 승인되기 전에는 금액이 바뀌지 않아요.</HelpD>
          </div>
        )}
        <div className="v3card">
          <table className="tbl">
            <tbody>
              {req ? <>
                <tr><th>회원권명</th><th>관리명</th><th className="num">금액</th><th>유효기간</th></tr>
                {rows.filter((p) => p.kind === (cur?.kind ?? kind)).map((p) => (
                  <tr key={p.id}><td>{p.name}{p.id === req.id && <> <span className="badge caution">요청 작성</span></>}</td><td>{progNames(p)}</td><td className="num">{won(p.price)}</td><td>{periodLabel(p.valid_days)}</td></tr>
                ))}
              </> : <>
                <tr><th>회원권명</th><th>관리명</th><th>관리 회차</th><th>결제 방법</th><th className="num">금액</th><th>유효기간</th><th>관리</th></tr>
                {shown.map((p) => (
                  <tr key={p.id} style={p.on_sale ? undefined : { color: "var(--ink-4)" }}>
                    <td>{p.name}{!p.on_sale && <> <span className="badge">판매 끝</span></>}</td><td>{progNames(p)}</td><td>{counts(p)}</td><td>일시불</td>
                    <td className="num">{won(p.price)}</td><td>{periodLabel(p.valid_days)}</td>
                    <td>{owner ? <button type="button" className="btn sm" onClick={() => open(p)}>수정</button>
                      : editable && <button type="button" className="btn sm" onClick={() => setReq({ id: p.id, to: p.price ?? 0 })}>변경 요청</button>}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={7}>{kind}권 상품이 없어요</td></tr>}
              </>}
            </tbody>
          </table>
        </div>
        <Logs data={data} k="product_log" />
      </div>

      {edit && (
        <Drawer title={edit.id ? "회원권 상품 고치기" : "회원권 추가"} onClose={() => setEdit(null)} onOk={save}>
            <div className="st-form">
              <div className="field"><label>회원권명</label><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="field"><label>종류</label>
                <div className="reasons">{KINDS.map((k) => <Chip key={k} on={edit.kind === k} onClick={() => setEdit({ ...edit, kind: k })}>{k}권</Chip>)}</div>
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
                        <button type="button" className="btn sm" aria-label="빼기" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}>빼기</button>
                      </div>
                    ))}
                    <div><button type="button" className="btn sm" onClick={() => setEdit({ ...edit, items: [...edit.items, { program_id: "", count: 10 }] })}>관리 더하기</button></div>
                  </div>
                </div>
              )}
              <div className="field"><label>옵션</label>
                <div style={{ display: "grid", gap: 10 }}>
                  {([["share_ok", "가족 나눠쓰기 가능"], ["app_visible", "고객앱에 보이기"], ["on_sale", "판매 중"]] as const).map(([k, l]) => (
                    <div key={k} className="row"><UseR on={!!edit[k]} label={l} onChange={(v) => setEdit({ ...edit, [k]: v })} /><span>{l}</span></div>
                  ))}
                </div>
              </div>
              <p className="help">이미 판매한 회원권은 바뀌지 않아요. 새로 파는 것부터 적용돼요.</p>
            </div>
        </Drawer>
      )}
    </div>
  );
}
