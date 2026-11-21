"use client";
/* 제품 > 거래처 */
import { useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { SubNav, useOneBranch, useVendors, Modal, friendly, type Vendor } from "../goods";

export default function ProductVendors() {
  const branch = useOneBranch();
  const { rows, load } = useVendors(branch);
  const [edit, setEdit] = useState<Vendor | null>(null);
  const NEW: Vendor = { id: "", branch, name: "", phone: "", manager: "", memo: "", active: true, goods: 0 };
  return (
    <>
      <SubNav right={<button className="btn p" onClick={() => setEdit({ ...NEW })}>+ 거래처 추가</button>} />
      <div className="gd-filter"><span className="gd-period">{branch} · 거래처 {rows.filter((v) => v.active).length}곳</span></div>
      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>거래처</th><th>담당자</th><th>연락처</th><th className="r">제품</th><th>적용</th><th>메모</th><th style={{ width: 90 }}>상태</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className={`go ${v.active ? "" : "mute"}`} onClick={() => setEdit({ ...v })}>
                <td className="nm">{v.name}</td><td>{v.manager || "—"}</td><td className="num">{v.phone || "—"}</td>
                <td className="r num">{v.goods}종</td><td>{v.branch || "전 지점"}</td><td className="gd-ell mute">{v.memo || "—"}</td>
                <td>{v.active ? <span className="badge ok">거래 중</span> : <span className="badge">거래 끝</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="gd-empty">거래처가 없어요. 오른쪽 위 ‘거래처 추가’로 넣어 주세요.</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {rows.map((v) => (
            <button key={v.id} className={`gd-mrow ${v.active ? "" : "mute"}`} onClick={() => setEdit({ ...v })}>
              <span className="l1"><b>{v.name}</b><span className="num">{v.goods}종</span></span>
              <span className="l2">{[v.manager, v.phone, v.active ? "" : "거래 끝"].filter(Boolean).join(" · ") || "연락처 없음"}</span>
            </button>
          ))}
          {!rows.length && <div className="gd-empty">거래처가 없어요</div>}
        </div>
      </div>
      {edit && <VendorModal v={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function VendorModal({ v, onClose, onSaved }: { v: Vendor; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const [d, setD] = useState(v);
  const [err, setErr] = useState("");
  async function save() {
    const { error } = await sb.rpc("goods_vendor_save", { p: d });
    if (error) return setErr(friendly(error.message));
    onSaved();
  }
  return (
    <Modal title={v.id ? "거래처 고치기" : "거래처 추가"} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>닫기</button><button className="btn p" onClick={save}>저장</button></>}>
      <div className="gd-form">
        <span className="k">거래처 이름</span><input className="inp" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <span className="k">담당자</span><input className="inp" value={d.manager} onChange={(e) => setD({ ...d, manager: e.target.value })} />
        <span className="k">연락처</span><input className="inp num" inputMode="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} />
        {me.tier === "owner" && (<><span className="k">적용 지점</span>
          <div className="seg"><button className={d.branch === "" ? "on" : ""} onClick={() => setD({ ...d, branch: "" })}>전 지점</button><button className={d.branch !== "" ? "on" : ""} onClick={() => setD({ ...d, branch: v.branch || me.branch })}>{v.branch || me.branch}만</button></div></>)}
        <span className="k">상태</span>
        <div className="seg"><button className={d.active ? "on" : ""} onClick={() => setD({ ...d, active: true })}>거래 중</button><button className={!d.active ? "on" : ""} onClick={() => setD({ ...d, active: false })}>거래 끝</button></div>
        <span className="k">메모</span><input className="inp" placeholder="계좌, 주문 방법 등" value={d.memo} onChange={(e) => setD({ ...d, memo: e.target.value })} />
      </div>
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
    </Modal>
  );
}
