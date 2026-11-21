"use client";
/* 제품 > 판매: 판매 내역(총계 줄 + 건별) + 제품 판매 입력 팝업 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { sendRequest } from "@/lib/approval";
import { won, downloadCsv } from "@/lib/sales";
import { useSales, useExport, periodLabel } from "../../ui";
import {
  SubNav, useOneBranch, useGoods, useStaff, GoodsPicker, CustSearch, Money, Qty, Modal, TotalBar, friendly, mdhm,
  type Cust, type Goods,
} from "../goods";

type Line = { goods_id: string; name: string; category: string; qty: number; price: number };
type Row = {
  id: string; branch: string; day: string; sold_at: string; customer_key: string | null; customer_name: string | null; staff_name: string;
  lines: Line[]; subtotal: number; vat: number; total: number; card: number; cash: number; account: number; unpaid: number; discount: number;
  memo: string; voided: boolean; void_reason: string | null;
};
type Sum = { count: number; total: number; card: number; cash: number; account: number; unpaid: number; discount: number; qty: number };

const methodOf = (r: Row) => [r.card && "카드", r.cash && "현금", r.account && "계좌", r.unpaid && "미수", r.discount && "할인"].filter(Boolean).join(" · ") || "-";
const itemsOf = (r: Row) => r.lines.map((l) => `${l.name} ${l.qty}개`).join(", ");

export default function ProductSales() {
  const me = useMe();
  const { branch, range, mode } = useSales();
  const one = useOneBranch();
  const [rows, setRows] = useState<Row[]>([]);
  const [sum, setSum] = useState<Sum | null>(null);
  const [q, setQ] = useState("");
  const [staffF, setStaffF] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const staff = useStaff(one);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("goods_sale_list", { p_branch: branch, p_from: range.from, p_to: range.to, p_q: q.trim() || null, p_staff: staffF || null });
    if (error) { setErr(friendly(error.message)); setRows([]); setSum(null); return; }
    setErr(""); setRows((data?.rows ?? []) as Row[]); setSum(data?.sum as Sum);
  }, [branch, range, q, staffF]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  useExport(rows.length ? () => downloadCsv(`제품판매_${range.from}_${range.to}.csv`,
    ["일시", "지점", "고객", "담당", "제품", "판매금액", "부가세", "카드", "현금", "계좌", "미수", "할인", "메모", "상태"],
    rows.map((r) => [mdhm(r.sold_at), r.branch, r.customer_name ?? "", r.staff_name, itemsOf(r), r.total, r.vat, r.card, r.cash, r.account, r.unpaid, r.discount, r.memo, r.voided ? "취소" : "완료"])) : null);

  return (
    <>
      <SubNav right={<button className="btn p" onClick={() => setOpen(true)}>+ 제품 판매</button>} />
      <div className="gd-filter">
        <span className="gd-period">{periodLabel(range, mode)} · {branch ?? "전 지점"}</span>
        <input className="inp gd-q" placeholder="고객 이름·전화번호·제품" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="sel gd-staff" value={staffF} onChange={(e) => setStaffF(e.target.value)} aria-label="담당">
          <option value="">전체 담당</option>
          {staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </div>
      {err && <p className="sl-err">{err}</p>}

      {sum && (
        <TotalBar items={[["판매", `${sum.count}건 · ${sum.qty}개`], ["판매금액", sum.total, true], ["카드", sum.card], ["현금", sum.cash], ["계좌", sum.account], ["미수", sum.unpaid], ["할인", sum.discount]]} />
      )}

      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>일시</th><th>고객</th><th>제품</th><th className="r">금액</th><th>결제수단</th><th>담당</th><th>상태</th><th>메모</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`go ${r.voided ? "mute" : ""}`} onClick={() => setDetail(r)}>
                <td className="num">{mdhm(r.sold_at)}</td>
                <td className="nm">{r.customer_name ?? "-"}</td>
                <td className="gd-ell">{itemsOf(r)}</td>
                <td className="r num b">{won(r.total)}</td>
                <td>{methodOf(r)}</td>
                <td>{r.staff_name}</td>
                <td>{r.voided ? <span className="badge em">취소</span> : r.unpaid ? <span className="badge warn">미수 {won(r.unpaid)}</span> : <span className="badge ok">완료</span>}</td>
                <td className="gd-ell mute">{r.memo || "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="gd-empty">{err ? "—" : "이 기간 제품 판매가 없어요"}</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {rows.map((r) => (
            <button key={r.id} className={`gd-mrow ${r.voided ? "mute" : ""}`} onClick={() => setDetail(r)}>
              <span className="l1"><b>{r.customer_name ?? "-"}</b>{r.voided ? <span className="badge em">취소</span> : r.unpaid ? <span className="badge warn">미수</span> : null}<b className="num big">{won(r.total)}원</b></span>
              <span className="l2">{itemsOf(r)} · {methodOf(r)} · {r.staff_name} · {mdhm(r.sold_at)}</span>
            </button>
          ))}
          {!rows.length && <div className="gd-empty">{err ? "—" : "이 기간 제품 판매가 없어요"}</div>}
        </div>
      </div>

      {open && <SaleModal branch={one} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
      {detail && <SaleDetail r={detail} owner={me.tier === "owner"} tier={me.tier} onClose={() => setDetail(null)} onVoided={() => { setDetail(null); load(); }} />}
    </>
  );
}

/* ── 제품 판매 입력 ─────────────────────────────────────────── */
type PayKey = "card" | "cash" | "account" | "unpaid" | "discount";
const PAYS: [PayKey, string][] = [["card", "카드"], ["cash", "현금"], ["account", "계좌이체"], ["unpaid", "미수금으로 남기기"], ["discount", "담당자 할인"]];

function SaleModal({ branch, onClose, onSaved }: { branch: string; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const { rows: goods, err: gErr } = useGoods(branch);
  const staff = useStaff(branch);
  const [cust, setCust] = useState<Cust | null>(null);
  const [staffName, setStaffName] = useState(me.name);
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [vat, setVat] = useState(false);
  const [pay, setPay] = useState<Record<PayKey, number>>({ card: 0, cash: 0, account: 0, unpaid: 0, discount: 0 });
  const [on, setOn] = useState<Record<PayKey, boolean>>({ card: false, cash: false, account: false, unpaid: false, discount: false });
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sub = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const vatAmt = vat ? Math.round(sub * 0.1) : 0;
  const total = sub + vatAmt;
  const entered = PAYS.reduce((a, [k]) => a + (on[k] ? pay[k] : 0), 0);
  const left = total - entered;

  const pickDone = (ids: string[]) => {
    setLines((ls) => ids.map((id) => ls.find((l) => l.goods_id === id) ?? (() => {
      const g = goods.find((x) => x.id === id) as Goods;
      return { goods_id: g.id, name: g.name, category: g.category, qty: 1, price: g.price };
    })()));
    setPicking(false);
  };
  /* 결제 수단을 켜면 남은 금액을 그 칸에 채워요 */
  const toggle = (k: PayKey) => {
    const nextOn = !on[k];
    setOn({ ...on, [k]: nextOn });
    setPay({ ...pay, [k]: nextOn ? Math.max(left, 0) : 0 });
  };

  async function save() {
    setErr("");
    if (!cust) return setErr("고객을 골라 주세요.");
    if (!lines.length) return setErr("제품을 골라 주세요.");
    if (left !== 0) return setErr(left > 0 ? `결제 금액이 ${won(left)}원 모자라요. 결제 수단을 골라 채워 주세요.` : `결제 금액이 ${won(-left)}원 많아요.`);
    setBusy(true);
    const p = {
      customer_key: cust.key, staff_name: staffName, vat, memo,
      lines: lines.map(({ goods_id, qty, price }) => ({ goods_id, qty, price })),
      discount: on.discount ? pay.discount : 0,
      pay: { card: on.card ? pay.card : 0, cash: on.cash ? pay.cash : 0, account: on.account ? pay.account : 0, local: 0 },
    };
    const { error } = await sb.rpc("goods_sale_create", { p_branch: branch, p });
    setBusy(false);
    if (error) return setErr(friendly(error.message));
    onSaved();
  }

  return (
    <>
      <Modal title="제품 판매" sub={branch} onClose={onClose}
        foot={<>
          <span className="gd-foot-sum">받을 돈 <b className="num">{won(total)}원</b></span>
          <button className="btn" onClick={onClose}>닫기</button>
          <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중" : "판매 저장"}</button>
        </>}>
        {gErr && <p className="sl-err" style={{ margin: 0 }}>{gErr}</p>}
        <div className="gd-sec">고객</div>
        <CustSearch branch={branch} value={cust} onPick={setCust} />

        <div className="gd-sec">판매 정보</div>
        <div className="gd-form">
          <span className="k">매출 담당</span>
          <select className="sel" value={staffName} onChange={(e) => setStaffName(e.target.value)}>
            {!staff.some((s) => s.name === me.name) && <option value={me.name}>{me.name}</option>}
            {staff.map((s) => <option key={s.id} value={s.name}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
          </select>
          <span className="k">매출 일시</span>
          <span className="gd-ro">지금 · 오늘 날짜로 들어가요</span>
        </div>

        <div className="gd-sec">제품<button className="btn sm" onClick={() => setPicking(true)}>{lines.length ? "제품 더 고르기" : "제품 선택"}</button></div>
        {!lines.length ? (
          <button className="gd-pickbtn" onClick={() => setPicking(true)}>+ 판매할 제품을 골라 주세요</button>
        ) : (
          <div className="gd-lines">
            {lines.map((l, i) => (
              <div key={l.goods_id} className="gd-line">
                <span className="nm"><b>{l.name}</b><span className="num">{won(l.price)}원</span></span>
                <Qty value={l.qty} min={1} onChange={(n) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: n } : x)))} />
                <b className="num amt">{won(l.qty * l.price)}원</b>
                <button className="rd-x" aria-label="빼기" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <label className="sl-check gd-vat"><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} />부가세 10% 더하기{vat && <span className="num"> (+{won(vatAmt)}원)</span>}</label>
            <div className="gd-sumline"><span>판매 금액</span><b className="num">{won(total)}원</b></div>
          </div>
        )}

        <div className="gd-sec">결제 방법</div>
        <div className="gd-pays">
          {PAYS.map(([k, l]) => (
            <div key={k} className={`gd-pay ${on[k] ? "on" : ""} ${k === "discount" ? "disc" : ""}`}>
              <label className="sl-check"><input type="checkbox" checked={on[k]} onChange={() => toggle(k)} />{l}</label>
              <Money value={on[k] ? pay[k] : 0} disabled={!on[k]} onChange={(n) => setPay({ ...pay, [k]: n })} />
            </div>
          ))}
          <div className={`gd-left ${left === 0 && total > 0 ? "ok" : left !== 0 ? "no" : ""}`}>
            {total === 0 ? "제품을 고르면 금액이 나와요" : left === 0 ? "결제 금액이 맞아요" : left > 0 ? `${won(left)}원 남았어요` : `${won(-left)}원 많아요`}
          </div>
        </div>

        <div className="gd-sec">메모</div>
        <textarea className="inp gd-memo" placeholder="비고 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
        {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
      </Modal>
      {picking && <GoodsPicker goods={goods} picked={lines.map((l) => l.goods_id)} showStock onDone={pickDone} onClose={() => setPicking(false)} />}
    </>
  );
}

/* ── 판매 상세 / 취소 ─────────────────────────────────────────── */
function SaleDetail({ r, owner, tier, onClose, onVoided }: { r: Row; owner: boolean; tier: Staff["tier"]; onClose: () => void; onVoided: () => void }) {
  const [ask, setAsk] = useState(false);
  const [sent, setSent] = useState("");
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  const pays = useMemo(() => ([["카드", r.card], ["현금", r.cash], ["계좌", r.account], ["미수", r.unpaid], ["할인", r.discount]] as [string, number][]).filter(([, v]) => v), [r]);
  async function voidIt() {
    const { error } = await sb.rpc("goods_sale_void", { p_id: r.id, p_reason: why });
    if (error) return setErr(friendly(error.message));
    onVoided();
  }
  // 대표관리자가 아니면 판매 취소는 요청 → 승인 (070 · 051)
  async function askIt() {
    if (!why.trim()) return setErr("취소 사유를 써 주세요.");
    setErr("");
    const q = await sendRequest({ tier }, { branch: r.branch, kind: "pay_cancel", targetType: "goods_sale", targetId: r.id, amount: r.total, reason: why.trim(),
      payload: { customer: r.customer_name ?? "", when: mdhm(r.sold_at), items: itemsOf(r) } });
    if (q.state === "need_sql") return setErr("판매 취소 요청은 서버 준비(070·051 SQL) 후에 돼요.");
    if (q.error) return setErr(q.error);
    setAsk(false); setSent("대표관리자에게 판매 취소를 요청했어요");
  }
  return (
    <Modal title="제품 판매 내역" sub={`${mdhm(r.sold_at)} · ${r.branch}`} onClose={onClose}
      foot={<>
        {!r.voided && !ask && !sent && <button className="btn danger" style={{ marginRight: "auto" }} onClick={() => setAsk(true)}>{owner ? "판매 취소" : "판매 취소 요청"}</button>}
        <button className="btn" onClick={onClose}>닫기</button>
      </>}>
      <div className="gd-form">
        <span className="k">고객</span><b>{r.customer_name ?? "-"}</b>
        <span className="k">담당</span><span>{r.staff_name}</span>
        <span className="k">상태</span><span>{r.voided ? <span className="badge em">취소{r.void_reason ? ` · ${r.void_reason}` : ""}</span> : <span className="badge ok">완료</span>}</span>
      </div>
      <div className="gd-lines">
        {r.lines.map((l) => (
          <div key={l.goods_id} className="gd-line ro"><span className="nm"><b>{l.name}</b><span className="num">{won(l.price)}원 × {l.qty}</span></span><b className="num amt">{won(l.price * l.qty)}원</b></div>
        ))}
        {r.vat > 0 && <div className="gd-line ro"><span className="nm">부가세</span><b className="num amt">{won(r.vat)}원</b></div>}
        <div className="gd-sumline"><span>판매 금액</span><b className="num">{won(r.total)}원</b></div>
      </div>
      <div className="gd-chips">{pays.map(([k, v]) => <span key={k} className="badge">{k} {won(v)}</span>)}</div>
      {r.memo && <div className="rd-box">{r.memo}</div>}
      {ask && (
        <div className="gd-ask">
          <b>{owner ? "판매를 취소할까요?" : "대표관리자에게 판매 취소를 요청할까요?"}</b>
          <span>{owner ? "매출에서 빠지고 재고가 다시 늘어나요." : "승인되면 매출에서 빠지고 재고가 다시 늘어나요."}</span>
          <input className="inp" placeholder={owner ? "취소 사유 (선택)" : "취소 사유 (꼭 써 주세요)"} value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="gd-row"><button className="btn" onClick={() => setAsk(false)}>그만두기</button><button className="btn p" onClick={owner ? voidIt : askIt}>{owner ? "취소하기" : "요청 보내기"}</button></div>
        </div>
      )}
      {sent && <p className="ap-ok" style={{ margin: 0 }}>{sent}</p>}
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
    </Modal>
  );
}
