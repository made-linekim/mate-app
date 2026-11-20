"use client";
import { useEffect, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won, todayKST, downloadCsv } from "@/lib/sales";
import { CondBar, Cond, PeriodPicker, Kpi, Z, periodLabel, useSales, useExport, md, friendly } from "../ui";

type Exp = { id: string; branch: string; day: string; category_id: string | null; category_name: string; amount: number; method: string; memo: string | null; created_by: string | null; total: number; sum_amount: number };
type Cat = { id: string; name: string; kind: string; hidden: boolean };
const METHODS = ["카드", "현금", "계좌"];
const METHOD_LABEL: Record<string, string> = { 계좌: "계좌이체" };

export default function Expenses() {
  const me = useMe();
  const { range, mode, branch } = useSales();
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
  const cnt = (m: string) => rows.filter((r) => r.method === m).length;
  const total = rows.reduce((a, r) => a + r.amount, 0);

  useExport(rows.length ? () => downloadCsv(`경비지출_${range.from}_${range.to}.csv`,
    ["날짜", "지점", "계정", "결제금액", "결제수단", "메모", "등록자"],
    rows.map((r) => [r.day, r.branch, r.category_name, r.amount, r.method, r.memo, r.created_by])) : null);

  async function del(r: Exp) {
    if (!window.confirm(`${r.day} ${r.category_name} ${won(r.amount)}원 지출을 지울까요?`)) return;
    const { error } = await sb.rpc("expense_void", { p_id: r.id });
    if (error) setErr(friendly(error.message)); else setTick(tick + 1);
  }

  const showBranch = me.tier === "owner" && !branch;
  const sumRow = (
    <tr className="sum">
      <td>합계</td>{showBranch && <td />}<td /><td /><td /><td className="r">{won(total)}</td><td /><td />
    </tr>
  );

  return (
    <>
      <CondBar summary={`${periodLabel(range, mode)} · 계정 전체`}
        extra={<button className="btn p sm" onClick={() => setOpen(true)}>+ 지출 등록</button>}>
        <Cond label="조회기간"><PeriodPicker /></Cond>
      </CondBar>
      <div className="sl-kpis">
        <Kpi label={mode === "month" ? `${+range.from.slice(5, 7)}월 지출` : "기간 지출"} value={won(total)} unit="원" sub={`${rows.length.toLocaleString()}건`} em />
        {METHODS.map((m) => <Kpi key={m} label={METHOD_LABEL[m] ?? m} value={won(sum(m))} unit="원" sub={`${cnt(m)}건`} />)}
      </div>
      {err && <p className="sl-err">{err}</p>}
      <div className="sl-card">
        <div className="sl-scroll">
          <table className="sl-t">
            <thead>
              <tr>
                <th>지출일</th>{showBranch && <th>지점</th>}<th>계정</th><th>내용</th><th>담당자</th>
                <th className="r">금액</th><th>수단</th><th />
              </tr>
              {rows.length > 0 && sumRow}
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{md(r.day)}</td>{showBranch && <td>{r.branch}</td>}
                  <td><span className="badge">{r.category_name}</span></td>
                  <td>{r.memo || <span className="sl-z">-</span>}</td>
                  <td>{r.created_by || "-"}</td>
                  <td className="r"><Z n={r.amount} /></td>
                  <td>{METHOD_LABEL[r.method] ?? r.method}</td>
                  <td className="r"><button className="btn t sm" onClick={() => del(r)}>삭제</button></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !err && <tr><td colSpan={8} className="sl-empty">이 기간에 지출 기록이 없어요</td></tr>}
              {loading && rows.length === 0 && <tr><td colSpan={8} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
            {rows.length > 0 && <tfoot>{sumRow}</tfoot>}
          </table>
        </div>
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
            {cats.length === 0 && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 4 }}>등록된 계정이 없어요. 위쪽 &lsquo;수입 · 지출 계정&rsquo;에서 먼저 만들어 주세요.</div>}
          </div>
          <div className="field"><label>금액</label>
            <input className="inp num" inputMode="numeric" placeholder="0" value={amt ? amt.toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field"><label>결제수단</label>
            <div className="seg">{METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{METHOD_LABEL[m] ?? m}</button>)}</div>
          </div>
          <div className="field"><label>내용</label><input className="inp" placeholder="예: 석션 소모품" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
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
