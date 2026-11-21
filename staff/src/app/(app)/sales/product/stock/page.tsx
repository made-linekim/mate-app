"use client";
/* 제품 > 재고: 지점별 남은 수량 · 부족 표시 · 실사(수량 맞추기) · 들고 난 기록 */
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { won, downloadCsv } from "@/lib/sales";
import { useExport } from "../../ui";
import { SubNav, useOneBranch, useGoods, Modal, TotalBar, friendly, mdOf, type Goods } from "../goods";

type Move = { day: string; kind: string; qty: number; memo: string; created_by: string; created_at: string };

export default function ProductStock() {
  const branch = useOneBranch();
  const { rows, err, load } = useGoods(branch);
  const [cat, setCat] = useState("전체");
  const [onlyLow, setOnlyLow] = useState(false);
  const [sel, setSel] = useState<Goods | null>(null);
  const live = rows.filter((g) => g.on_sale);
  const cats = useMemo(() => ["전체", ...Array.from(new Set(live.map((g) => g.category)))], [live]);
  const low = (g: Goods) => g.stock <= g.safe_qty;
  const shown = live.filter((g) => (cat === "전체" || g.category === cat) && (!onlyLow || low(g)))
    .sort((a, b) => Number(low(b)) - Number(low(a)) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  const lowN = live.filter(low).length;
  const value = live.reduce((a, g) => a + Math.max(g.stock, 0) * g.cost, 0);

  useExport(shown.length ? () => downloadCsv(`제품재고_${branch}.csv`, ["분류", "제품", "재고", "부족 기준", "매입가", "판매가", "재고 금액(매입가)", "거래처", "마지막 입고"],
    shown.map((g) => [g.category, g.name, g.stock, g.safe_qty, g.cost, g.price, Math.max(g.stock, 0) * g.cost, g.vendor ?? "", g.last_in ?? ""])) : null);

  return (
    <>
      <SubNav />
      <div className="gd-filter">
        <span className="gd-period">{branch} · 지금 재고</span>
        <div className="gd-cats" style={{ margin: 0 }}>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          <button className={`chip ${onlyLow ? "on" : ""}`} onClick={() => setOnlyLow(!onlyLow)}>부족만 {lowN}</button>
        </div>
      </div>
      {err && <p className="sl-err">{err}</p>}
      <TotalBar items={[["제품", `${live.length}종`], ["재고 부족", `${lowN}종`, lowN > 0], ["재고 금액(매입가)", value]]} />

      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>분류</th><th>제품</th><th className="r">재고</th><th className="r">부족 기준</th><th className="r">매입가</th><th className="r">판매가</th><th>거래처</th><th>마지막 입고</th><th style={{ width: 120 }}></th></tr></thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id} className="go" onClick={() => setSel(g)}>
                <td className="mute">{g.category}</td><td className="nm">{g.name}</td>
                <td className={`r num b ${low(g) ? "red" : ""}`}>{g.stock}개</td><td className="r num mute">{g.safe_qty}</td>
                <td className="r num">{won(g.cost)}</td><td className="r num">{won(g.price)}</td>
                <td>{g.vendor ?? "—"}</td><td className="num mute">{mdOf(g.last_in)}</td>
                <td>{low(g) ? <span className="badge em">부족</span> : <span className="badge ok">충분</span>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="gd-empty">{err ? "—" : live.length ? "부족한 제품이 없어요" : "등록한 제품이 없어요. ‘제품 항목’에서 추가해 주세요."}</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {shown.map((g) => (
            <button key={g.id} className="gd-mrow" onClick={() => setSel(g)}>
              <span className="l1"><b>{g.name}</b><b className={`num big ${low(g) ? "red" : ""}`}>{g.stock}개</b></span>
              <span className="l2">{g.category} · 부족 기준 {g.safe_qty} · 판매 {won(g.price)}{low(g) ? " · 부족" : ""}</span>
            </button>
          ))}
          {!shown.length && <div className="gd-empty">{err ? "—" : "제품이 없어요"}</div>}
        </div>
      </div>
      {sel && <StockModal branch={branch} g={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} />}
    </>
  );
}

function StockModal({ branch, g, onClose, onSaved }: { branch: string; g: Goods; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(String(g.stock));
  const [memo, setMemo] = useState("");
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    sb.rpc("goods_moves_list", { p_branch: branch, p_goods: g.id, p_limit: 30 }).then(({ data }) => setMoves((data ?? []) as Move[]));
  }, [branch, g.id]);
  const n = Number(qty.replace(/\D/g, ""));
  async function save() {
    const { error } = await sb.rpc("goods_stock_set", { p_branch: branch, p_goods: g.id, p_qty: n, p_memo: memo || "재고 실사" });
    if (error) return setErr(friendly(error.message));
    onSaved();
  }
  return (
    <Modal title={g.name} sub={`${branch} · 지금 ${g.stock}개`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>닫기</button><button className="btn p" disabled={qty === "" || n === g.stock} onClick={save}>재고 맞추기</button></>}>
      <div className="gd-sec">실제 수량으로 맞추기</div>
      <div className="gd-form">
        <span className="k">세어 본 수량</span>
        <div className="gd-row"><input className="inp num" style={{ width: 120 }} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /><span>개</span>
          {qty !== "" && n !== g.stock && <span className={n < g.stock ? "red" : "grn"}>{n > g.stock ? "+" : ""}{n - g.stock}개 조정</span>}</div>
        <span className="k">사유</span>
        <input className="inp" placeholder="예: 월말 실사, 파손, 샘플 사용" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
      <div className="gd-sec">들고 난 기록</div>
      <div className="gd-moves">
        {moves === null && <div className="gd-none">불러오는 중</div>}
        {moves?.length === 0 && <div className="gd-none">기록이 없어요</div>}
        {moves?.map((m, i) => (
          <div key={i}><span className="num mute">{mdOf(m.day)}</span><span>{m.kind}{m.memo ? ` · ${m.memo}` : ""}</span><b className={`num ${m.qty < 0 ? "red" : "grn"}`}>{m.qty > 0 ? "+" : ""}{m.qty}</b></div>
        ))}
      </div>
    </Modal>
  );
}
