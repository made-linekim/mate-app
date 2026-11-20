"use client";
import { useEffect, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won, todayKST, downloadCsv } from "@/lib/sales";
import { PeriodPicker, BranchSeg, Cond, monthRange, friendly, type Range } from "../ui";

type Exp = { id: string; branch: string; day: string; category_id: string | null; category_name: string; amount: number; method: string; memo: string | null; created_by: string | null; total: number; sum_amount: number };
type Cat = { id: string; name: string; kind: string; hidden: boolean };
const METHODS = ["카드", "현금", "계좌"];

export default function Expenses() {
  const me = useMe();
  const t = todayKST();
  const [range, setRange] = useState<Range>(monthRange(+t.slice(0, 4), +t.slice(5, 7)));
  const [branch, setBranch] = useState<string | null>(null);
  const [rows, setRows] = useState<Exp[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("expense_list", { p_from: range.from, p_to: range.to, p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Exp[]);
      setLoading(false);
    });
    return () => { on = false; };
  }, [range, branch, tick]);
  useEffect(() => {
    sb.rpc("expense_category_list").then(({ data }) => setCats(((data ?? []) as Cat[]).filter((c) => !c.hidden && c.kind !== "income")));
  }, []);

  const sum = (m: string) => rows.filter((r) => r.method === m).reduce((a, r) => a + r.amount, 0);
  const total = rows[0]?.sum_amount ?? 0;

  async function del(r: Exp) {
    if (!window.confirm(`${r.day} ${r.category_name} ${won(r.amount)}원 지출을 지울까요?`)) return;
    const { error } = await sb.rpc("expense_void", { p_id: r.id });
    if (error) setErr(friendly(error.message)); else setTick(tick + 1);
  }

  return (
    <>
      <div className="card" style={{ padding: "4px 20px" }}>
        <Cond label="조회기간">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <PeriodPicker value={range} onChange={setRange} />
            <span style={{ marginLeft: "auto" }}><BranchSeg value={branch} onChange={setBranch} /></span>
          </div>
        </Cond>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
        <span className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{loading ? "불러오는 중" : `${rows.length.toLocaleString()}건`}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {canSee(me, "export.excel") && (
            <button className="btn sm" disabled={!rows.length} onClick={() => downloadCsv(`경비지출_${range.from}_${range.to}.csv`,
              ["날짜", "지점", "계정", "결제금액", "결제수단", "메모", "등록자"],
              rows.map((r) => [r.day, r.branch, r.category_name, r.amount, r.method, r.memo, r.created_by]))}>엑셀 내려받기</button>
          )}
          <button className="btn p sm" onClick={() => setOpen(true)}>지출 등록</button>
        </span>
      </div>
      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr>
              <th>날짜</th>{me.tier === "owner" && <th>지점</th>}<th>계정</th><th>메모</th><th>등록자</th>
              <th style={{ textAlign: "right" }}>결제금액</th><th style={{ textAlign: "right" }}>카드</th>
              <th style={{ textAlign: "right" }}>현금</th><th style={{ textAlign: "right" }}>계좌</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 && (
              <tr style={{ fontWeight: 600 }}>
                <td style={{ background: "var(--bg-soft)" }} colSpan={me.tier === "owner" ? 5 : 4}>합계</td>
                {[total, sum("카드"), sum("현금"), sum("계좌")].map((v, i) => (
                  <td key={i} className="num" style={{ background: "var(--bg-soft)", textAlign: "right" }}>{won(v)}</td>
                ))}
                <td style={{ background: "var(--bg-soft)" }}></td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="num">{r.day}</td>{me.tier === "owner" && <td>{r.branch}</td>}
                <td style={{ fontWeight: 600 }}>{r.category_name}</td>
                <td style={{ color: "var(--ink-3)" }}>{r.memo || "-"}</td>
                <td>{r.created_by || "-"}</td>
                <td className="num" style={{ textAlign: "right" }}><b>{won(r.amount)}</b></td>
                {METHODS.map((m) => <td key={m} className="num" style={{ textAlign: "right" }}>{r.method === m ? won(r.amount) : "0"}</td>)}
                <td style={{ textAlign: "right" }}><button className="btn t sm" onClick={() => del(r)}>삭제</button></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--ink-3)" }}>이 기간에 지출 기록이 없어요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {open && <AddExpense cats={cats} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); setTick(tick + 1); }} />}
    </>
  );
}

function AddExpense({ cats, onClose, onSaved }: { cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const [day, setDay] = useState(todayKST());
  const [branch, setBranch] = useState(me.branch);
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("카드");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const amt = Number(amount.replace(/\D/g, ""));

  async function save() {
    if (!cat) return setErr("계정을 골라 주세요");
    if (!amt) return setErr("금액을 입력해 주세요");
    setBusy(true);
    const { error } = await sb.rpc("expense_add", { p_branch: branch, p_day: day, p_category_id: cat, p_amount: amt, p_method: method, p_memo: memo });
    setBusy(false);
    if (error) setErr(friendly(error.message)); else onSaved();
  }

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer">
        <div className="hd">지출 등록</div>
        <div className="bd">
          <div className="field"><label>날짜</label><input type="date" className="inp" value={day} onChange={(e) => setDay(e.target.value)} /></div>
          {me.tier === "owner" && (
            <div className="field"><label>지점</label>
              <div className="seg">{BRANCHES.map((b) => <button key={b} className={branch === b ? "on" : ""} onClick={() => setBranch(b)}>{b}</button>)}</div>
            </div>
          )}
          <div className="field"><label>계정</label>
            <select className="sel" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">골라 주세요</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {cats.length === 0 && <div className="help" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 4 }}>등록된 계정이 없어요. 수입지출 계정 탭에서 먼저 만들어 주세요.</div>}
          </div>
          <div className="field"><label>금액</label>
            <input className="inp num" inputMode="numeric" placeholder="0" value={amt ? amt.toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field"><label>결제수단</label>
            <div className="seg">{METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>
          </div>
          <div className="field"><label>메모</label><input className="inp" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
          {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        </div>
        <div className="ft">
          <button className="btn t" onClick={onClose}>취소</button>
          <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중" : "저장"}</button>
        </div>
      </div>
    </>
  );
}
