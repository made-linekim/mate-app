"use client";
/* 제품 > 미지급금: 거래처별 아직 안 준 돈 + 지급 기록 */
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { won, downloadCsv } from "@/lib/sales";
import { useExport } from "../../ui";
import { SubNav, useOneBranch, Money, Modal, TotalBar, friendly, mdOf, kday } from "../goods";

type P = { id: string; name: string; phone: string; bought: number; paid: number; due: number; last_pay: string | null; pays: { day: string; amount: number; method: string; memo: string }[] };

export default function ProductPayable() {
  const branch = useOneBranch();
  const [rows, setRows] = useState<P[]>([]);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<P | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("goods_payable_list", { p_branch: branch });
    if (error) { setErr(friendly(error.message)); setRows([]); return; }
    setErr(""); setRows((data ?? []) as P[]);
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  const due = rows.reduce((a, r) => a + Math.max(r.due, 0), 0);
  const owing = rows.filter((r) => r.due > 0);

  useExport(rows.length ? () => downloadCsv(`제품미지급금_${branch}.csv`, ["거래처", "매입 합계", "지급 합계", "미지급금", "마지막 지급"],
    rows.map((r) => [r.name, r.bought, r.paid, r.due, r.last_pay ?? ""])) : null);

  return (
    <>
      <SubNav />
      <div className="gd-filter"><span className="gd-period">{branch} · 지금까지 전체</span></div>
      {err && <p className="sl-err">{err}</p>}
      <TotalBar items={[["줄 돈 남은 거래처", `${owing.length}곳`], ["미지급금", due, due > 0]]} />
      <div className="gd-card">
        <table className="gd-t gd-pc">
          <thead><tr><th>거래처</th><th className="r">매입 합계</th><th className="r">지급 합계</th><th className="r">미지급금</th><th>마지막 지급</th><th style={{ width: 120 }}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="go" onClick={() => setSel(r)}>
                <td className="nm">{r.name}</td><td className="r num">{won(r.bought)}</td><td className="r num">{won(r.paid)}</td>
                <td className={`r num b ${r.due > 0 ? "red" : ""}`}>{won(r.due)}</td><td className="num mute">{mdOf(r.last_pay)}</td>
                <td>{r.due > 0 ? <button className="btn sm" onClick={(e) => { e.stopPropagation(); setSel(r); }}>지급 기록</button> : <span className="badge ok">정산 끝</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="gd-empty">{err ? "—" : "매입한 거래처가 없어요"}</td></tr>}
          </tbody>
        </table>
        <div className="gd-m">
          {rows.map((r) => (
            <button key={r.id} className="gd-mrow" onClick={() => setSel(r)}>
              <span className="l1"><b>{r.name}</b><b className={`num big ${r.due > 0 ? "red" : ""}`}>{won(r.due)}원</b></span>
              <span className="l2">매입 {won(r.bought)} · 지급 {won(r.paid)} · 마지막 지급 {mdOf(r.last_pay)}</span>
            </button>
          ))}
          {!rows.length && <div className="gd-empty">{err ? "—" : "매입한 거래처가 없어요"}</div>}
        </div>
      </div>
      {sel && <PayModal branch={branch} v={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(); }} />}
    </>
  );
}

function PayModal({ branch, v, onClose, onSaved }: { branch: string; v: P; onClose: () => void; onSaved: () => void }) {
  const [amt, setAmt] = useState(Math.max(v.due, 0));
  const [method, setMethod] = useState("계좌이체");
  const [day, setDay] = useState(kday());
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  async function save() {
    const { error } = await sb.rpc("goods_vendor_pay", { p_branch: branch, p_vendor: v.id, p_amount: amt, p_method: method, p_memo: memo, p_day: day });
    if (error) return setErr(friendly(error.message));
    onSaved();
  }
  return (
    <Modal title={v.name} sub={`미지급금 ${won(v.due)}원`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>닫기</button><button className="btn p" disabled={!amt} onClick={save}>지급 저장</button></>}>
      <div className="gd-form">
        <span className="k">지급 금액</span>
        <div className="gd-row"><Money value={amt} onChange={setAmt} /><button className="btn sm" onClick={() => setAmt(Math.max(v.due, 0))}>전액</button></div>
        <span className="k">지급 방법</span>
        <div className="seg">{["계좌이체", "카드", "현금"].map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
        <span className="k">지급 날짜</span>
        <input type="date" className="inp" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <span className="k">메모</span>
        <input className="inp" placeholder="선택" value={memo} onChange={(e) => setMemo(e.target.value)} />
      </div>
      {amt > v.due && v.due >= 0 && <div className="gd-left no">미지급금보다 {won(amt - v.due)}원 많아요 (선지급으로 남아요)</div>}
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
      {v.pays.length > 0 && (
        <>
          <div className="gd-sec">최근 지급</div>
          <div className="gd-moves">{v.pays.map((p, i) => <div key={i}><span className="num mute">{mdOf(p.day)}</span><span>{p.method}{p.memo ? ` · ${p.memo}` : ""}</span><b className="num">{won(p.amount)}</b></div>)}</div>
        </>
      )}
    </Modal>
  );
}
