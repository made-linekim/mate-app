"use client";
/* 제품 > 제품 항목: 분류 · 판매가 · 매입가 · 거래처 · 부족 기준 */
import { useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won } from "@/lib/sales";
import { SubNav, useOneBranch, useGoods, useVendors, Money, Modal, friendly, type Goods } from "../goods";

export default function ProductItems() {
  const branch = useOneBranch();
  const { rows, err, load } = useGoods(branch);
  const vendors = useVendors(branch);
  const [cat, setCat] = useState("전체");
  const [edit, setEdit] = useState<Goods | null>(null);
  const cats = useMemo(() => Array.from(new Set(rows.map((g) => g.category))), [rows]);
  const shown = rows.filter((g) => cat === "전체" || g.category === cat);
  const NEW: Goods = { id: "", branch: "", category: cat === "전체" ? cats[0] ?? "" : cat, name: "", price: 0, cost: 0, vendor_id: null, vendor: null, safe_qty: 3, on_sale: true, sort: 0, stock: 0, last_in: null };
  return (
    <>
      <SubNav right={<button className="btn p" onClick={() => setEdit({ ...NEW })}>+ 제품 추가</button>} />
      <div className="gd-filter">
        <div className="gd-cats" style={{ margin: 0 }}>
          {["전체", ...cats].map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c} <span className="num">{c === "전체" ? rows.length : rows.filter((g) => g.category === c).length}</span></button>)}
        </div>
      </div>
      {err && <p className="sl-err">{err}</p>}
      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>분류</th><th>제품</th><th className="r">판매가</th><th className="r">매입가</th><th className="r">남는 돈</th><th>거래처</th><th className="r">부족 기준</th><th>적용</th><th style={{ width: 90 }}>상태</th></tr></thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id} className={`go ${g.on_sale ? "" : "mute"}`} onClick={() => setEdit({ ...g })}>
                <td className="mute">{g.category}</td><td className="nm">{g.name}</td>
                <td className="r num b">{won(g.price)}</td><td className="r num">{won(g.cost)}</td><td className="r num mute">{won(g.price - g.cost)}</td>
                <td>{g.vendor ?? "—"}</td><td className="r num">{g.safe_qty}개</td><td>{g.branch || "전 지점"}</td>
                <td>{g.on_sale ? <span className="badge ok">판매 중</span> : <span className="badge">판매 끝</span>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="gd-empty">{err ? "—" : "제품이 없어요. 오른쪽 위 ‘제품 추가’로 넣어 주세요."}</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {shown.map((g) => (
            <button key={g.id} className={`gd-mrow ${g.on_sale ? "" : "mute"}`} onClick={() => setEdit({ ...g })}>
              <span className="l1"><b>{g.name}</b><b className="num big">{won(g.price)}원</b></span>
              <span className="l2">{g.category} · 매입 {won(g.cost)} · {g.vendor ?? "거래처 없음"}{g.on_sale ? "" : " · 판매 끝"}</span>
            </button>
          ))}
          {!shown.length && <div className="gd-empty">{err ? "—" : "제품이 없어요"}</div>}
        </div>
      </div>
      {edit && <ItemModal g={edit} cats={cats} vendors={vendors.rows.filter((v) => v.active || v.id === edit.vendor_id)} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </>
  );
}

function ItemModal({ g, cats, vendors, onClose, onSaved }: { g: Goods; cats: string[]; vendors: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const [d, setD] = useState(g);
  const [newCat, setNewCat] = useState(!cats.length);
  const [err, setErr] = useState("");
  async function save() {
    const { error } = await sb.rpc("goods_save", { p: { ...d, vendor_id: d.vendor_id || null } });
    if (error) return setErr(friendly(error.message));
    onSaved();
  }
  return (
    <Modal title={g.id ? "제품 고치기" : "제품 추가"} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>닫기</button><button className="btn p" onClick={save}>저장</button></>}>
      <div className="gd-form">
        <span className="k">분류</span>
        {newCat ? (
          <div className="gd-row"><input className="inp" placeholder="새 분류 이름 (예: 바디케어젤)" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} />
            {cats.length > 0 && <button className="btn sm t" onClick={() => { setNewCat(false); setD({ ...d, category: cats[0] }); }}>목록에서</button>}</div>
        ) : (
          <div className="gd-cats" style={{ margin: 0 }}>
            {cats.map((c) => <button key={c} className={`chip ${d.category === c ? "on" : ""}`} onClick={() => setD({ ...d, category: c })}>{c}</button>)}
            <button className="chip" onClick={() => { setNewCat(true); setD({ ...d, category: "" }); }}>+ 새 분류</button>
          </div>
        )}
        <span className="k">제품 이름</span><input className="inp" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <span className="k">판매가</span><Money value={d.price} onChange={(n) => setD({ ...d, price: n })} />
        <span className="k">매입가</span><Money value={d.cost} onChange={(n) => setD({ ...d, cost: n })} />
        <span className="k">거래처</span>
        <select className="sel" value={d.vendor_id ?? ""} onChange={(e) => setD({ ...d, vendor_id: e.target.value || null })}>
          <option value="">없음</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <span className="k">부족 기준</span>
        <div className="gd-row"><input className="inp num" style={{ width: 100 }} inputMode="numeric" value={d.safe_qty} onChange={(e) => setD({ ...d, safe_qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} /><span className="mute">개 이하면 ‘부족’으로 보여요</span></div>
        {me.tier === "owner" && (<><span className="k">적용 지점</span>
          <div className="seg"><button className={d.branch === "" ? "on" : ""} onClick={() => setD({ ...d, branch: "" })}>전 지점</button>
            <button className={d.branch !== "" ? "on" : ""} onClick={() => setD({ ...d, branch: g.branch || me.branch })}>{g.branch || me.branch}만</button></div></>)}
        <span className="k">상태</span>
        <div className="seg"><button className={d.on_sale ? "on" : ""} onClick={() => setD({ ...d, on_sale: true })}>판매 중</button><button className={!d.on_sale ? "on" : ""} onClick={() => setD({ ...d, on_sale: false })}>판매 끝</button></div>
      </div>
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
    </Modal>
  );
}
