"use client";
/* 제품 > 매입: 매입 내역 + 매입 등록 (들어오면 재고 +, 덜 준 돈은 미지급금) */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won, downloadCsv } from "@/lib/sales";
import { useSales, useExport, periodLabel } from "../../ui";
import { SubNav, useOneBranch, useGoods, useVendors, GoodsPicker, Money, Qty, Modal, TotalBar, friendly, mdOf, kday } from "../goods";

type Line = { goods_id: string; name: string; qty: number; cost: number };
type Row = { id: string; branch: string; day: string; vendor_id: string | null; vendor: string | null; lines: Line[]; total: number; paid: number; method: string; memo: string; created_by: string; voided: boolean };
const itemsOf = (r: Row) => r.lines.map((l) => `${l.name} ${l.qty}개`).join(", ");

export default function ProductBuy() {
  const me = useMe();
  const { branch, range, mode } = useSales();
  const one = useOneBranch();
  const vendors = useVendors(one);
  const [vf, setVf] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sum, setSum] = useState<{ count: number; total: number; paid: number } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("goods_purchase_list", { p_branch: branch, p_from: range.from, p_to: range.to, p_vendor: vf || null });
    if (error) { setErr(friendly(error.message)); setRows([]); setSum(null); return; }
    setErr(""); setRows((data?.rows ?? []) as Row[]); setSum(data?.sum);
  }, [branch, range, vf]);
  useEffect(() => { load(); }, [load]);

  useExport(rows.length ? () => downloadCsv(`제품매입_${range.from}_${range.to}.csv`, ["날짜", "지점", "거래처", "제품", "매입금액", "지급", "미지급", "메모", "상태"],
    rows.map((r) => [r.day, r.branch, r.vendor ?? "", itemsOf(r), r.total, r.paid, r.total - r.paid, r.memo, r.voided ? "취소" : "완료"])) : null);

  return (
    <>
      <SubNav right={<button className="btn p" onClick={() => setOpen(true)}>+ 매입 등록</button>} />
      <div className="gd-filter">
        <span className="gd-period">{periodLabel(range, mode)} · {branch ?? "전 지점"}</span>
        <select className="sel gd-staff" value={vf} onChange={(e) => setVf(e.target.value)} aria-label="거래처">
          <option value="">전체 거래처</option>
          {vendors.rows.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      {err && <p className="sl-err">{err}</p>}
      {sum && <TotalBar items={[["매입", `${sum.count}건`], ["매입금액", sum.total, true], ["지급", sum.paid], ["미지급", sum.total - sum.paid]]} />}

      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>날짜</th><th>거래처</th><th>제품</th><th className="r">매입금액</th><th className="r">지급</th><th className="r">미지급</th><th>상태</th><th>메모</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`go ${r.voided ? "mute" : ""}`} onClick={() => setDetail(r)}>
                <td className="num">{mdOf(r.day)}</td><td className="nm">{r.vendor ?? "-"}</td><td className="gd-ell">{itemsOf(r)}</td>
                <td className="r num b">{won(r.total)}</td><td className="r num">{won(r.paid)}</td>
                <td className={`r num ${r.total - r.paid > 0 ? "red" : ""}`}>{won(r.total - r.paid)}</td>
                <td>{r.voided ? <span className="badge em">취소</span> : <span className="badge ok">입고</span>}</td>
                <td className="gd-ell mute">{r.memo || "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="gd-empty">{err ? "—" : "이 기간 매입이 없어요"}</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {rows.map((r) => (
            <button key={r.id} className={`gd-mrow ${r.voided ? "mute" : ""}`} onClick={() => setDetail(r)}>
              <span className="l1"><b>{r.vendor ?? "거래처 없음"}</b>{r.voided ? <span className="badge em">취소</span> : r.total - r.paid > 0 ? <span className="badge warn">미지급</span> : null}<b className="num big">{won(r.total)}원</b></span>
              <span className="l2">{itemsOf(r)} · {mdOf(r.day)}{r.total - r.paid > 0 ? ` · 미지급 ${won(r.total - r.paid)}` : ""}</span>
            </button>
          ))}
          {!rows.length && <div className="gd-empty">{err ? "—" : "이 기간 매입이 없어요"}</div>}
        </div>
      </div>
      {open && <BuyModal branch={one} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {detail && (
        <Modal title="매입 내역" sub={`${mdOf(detail.day)} · ${detail.branch}`} onClose={() => setDetail(null)}
          foot={<>{me.tier === "owner" && !detail.voided && <button className="btn danger" style={{ marginRight: "auto" }} onClick={async () => {
            const { error } = await sb.rpc("goods_purchase_void", { p_id: detail.id });
            if (error) return setErr(friendly(error.message));
            setDetail(null); load();
          }}>매입 취소 (재고 되돌림)</button>}<button className="btn" onClick={() => setDetail(null)}>닫기</button></>}>
          <div className="gd-form"><span className="k">거래처</span><b>{detail.vendor ?? "-"}</b><span className="k">등록</span><span>{detail.created_by}</span></div>
          <div className="gd-lines">
            {detail.lines.map((l) => <div key={l.goods_id} className="gd-line ro"><span className="nm"><b>{l.name}</b><span className="num">{won(l.cost)}원 × {l.qty}</span></span><b className="num amt">{won(l.cost * l.qty)}원</b></div>)}
            <div className="gd-sumline"><span>매입 금액</span><b className="num">{won(detail.total)}원</b></div>
          </div>
          <div className="gd-chips"><span className="badge">지급 {won(detail.paid)}{detail.method ? ` · ${detail.method}` : ""}</span>{detail.total - detail.paid > 0 && <span className="badge warn">미지급 {won(detail.total - detail.paid)}</span>}</div>
          {detail.memo && <div className="rd-box">{detail.memo}</div>}
        </Modal>
      )}
    </>
  );
}

function BuyModal({ branch, onClose, onSaved }: { branch: string; onClose: () => void; onSaved: () => void }) {
  const { rows: goods } = useGoods(branch);
  const vendors = useVendors(branch);
  const [vendor, setVendor] = useState("");
  const [day, setDay] = useState(kday());
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("계좌이체");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);

  /* 거래처를 고르면 그 거래처 제품만 먼저 보여요 */
  const list = vendor ? [...goods.filter((g) => g.vendor_id === vendor), ...goods.filter((g) => g.vendor_id !== vendor)] : goods;
  async function save() {
    setErr("");
    if (!lines.length) return setErr("매입할 제품을 골라 주세요.");
    if (paid < total && !vendor) return setErr("미지급금이 남으면 거래처를 골라 주세요.");
    setBusy(true);
    const { error } = await sb.rpc("goods_purchase_create", { p_branch: branch, p: { vendor_id: vendor || null, day, paid, method: paid ? method : "", memo, lines: lines.map(({ goods_id, qty, cost }) => ({ goods_id, qty, cost })) } });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    onSaved();
  }
  return (
    <>
      <Modal title="매입 등록" sub={branch} onClose={onClose}
        foot={<><span className="gd-foot-sum">매입 <b className="num">{won(total)}원</b></span><button className="btn" onClick={onClose}>닫기</button><button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중" : "매입 저장"}</button></>}>
        <div className="gd-form">
          <span className="k">거래처</span>
          <select className="sel" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">거래처 고르기</option>
            {vendors.rows.filter((v) => v.active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <span className="k">입고 날짜</span>
          <input type="date" className="inp" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        <div className="gd-sec">제품<button className="btn sm" onClick={() => setPicking(true)}>{lines.length ? "제품 더 고르기" : "제품 선택"}</button></div>
        {!lines.length ? <button className="gd-pickbtn" onClick={() => setPicking(true)}>+ 들어온 제품을 골라 주세요</button> : (
          <div className="gd-lines">
            {lines.map((l, i) => (
              <div key={l.goods_id} className="gd-line buy">
                <span className="nm"><b>{l.name}</b></span>
                <Qty value={l.qty} min={1} onChange={(n) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
                <span className="gd-cost"><Money value={l.cost} onChange={(n) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: n } : x)))} /></span>
                <button className="rd-x" aria-label="빼기" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="gd-help">수량 · 개당 매입가</div>
            <div className="gd-sumline"><span>매입 금액</span><b className="num">{won(total)}원</b></div>
          </div>
        )}
        <div className="gd-sec">지급</div>
        <div className="gd-form">
          <span className="k">지금 준 돈</span>
          <div className="gd-row"><Money value={paid} onChange={(n) => setPaid(Math.min(n, total))} />
            <button className="btn sm" onClick={() => setPaid(total)}>전액</button><button className="btn sm" onClick={() => setPaid(0)}>외상</button></div>
          <span className="k">지급 방법</span>
          <div className="seg">{["계좌이체", "카드", "현금"].map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
        </div>
        {total > 0 && <div className={`gd-left ${total - paid > 0 ? "no" : "ok"}`}>{total - paid > 0 ? `미지급금 ${won(total - paid)}원이 남아요` : "전액 지급"}</div>}
        <textarea className="inp gd-memo" placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
      </Modal>
      {picking && <GoodsPicker goods={list} picked={lines.map((l) => l.goods_id)} showStock priceOf={(g) => g.cost}
        onDone={(ids) => { setLines((ls) => ids.map((id) => ls.find((l) => l.goods_id === id) ?? (() => { const g = goods.find((x) => x.id === id)!; return { goods_id: g.id, name: g.name, qty: 1, cost: g.cost }; })())); setPicking(false); }}
        onClose={() => setPicking(false)} />}
    </>
  );
}
