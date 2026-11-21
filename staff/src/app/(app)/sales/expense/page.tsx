"use client";
/* 매출 > 지출 (시안 U-PC-SALES-7 · 지출 요청 · 지출 확인 · 승인 대기 · 지출 완료)
   관리자·대표관리자: 지출 등록 → 확인 창 → 바로 반영. 직원(요청 권한): 지출 요청 → 관리자가 승인.
   DB: 059 expense_board (없으면 expense_list 로 보여요) · 070 approval_request/decide */
import { useEffect, useState } from "react";
import { sb, TIER_LABEL } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { isReq } from "@/lib/perm";
import { won, downloadCsv } from "@/lib/sales";
import { SlTool, PeriodPicker, Cond, BranchCond, Confirm, useSales, useExport, md, friendly, rangeHelp } from "../ui";

type Row = {
  id: string; kind: "expense" | "request"; branch: string; day: string; category_id: string | null; category_name: string;
  amount: number; method: string; memo: string | null; by_name: string | null; status: string; mine: boolean; can_decide: boolean;
};
type Cat = { id: string; name: string; kind: string; hidden: boolean };
const METHODS = ["카드", "현금", "계좌"];
const ML: Record<string, string> = { 계좌: "계좌이체" };
const ST: Record<string, string> = { 등록됨: "ok", 승인됨: "ok", 승인: "ok", "바로 처리": "ok", "요청 대기": "warn", "기다리는 중": "warn", 반려: "" };
const hm = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

export default function Expenses() {
  const me = useMe();
  const { range, branch } = useSales();
  const reqOnly = me.tier === "staff" && isReq(me.perms?.["sales.expense"]);
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(reqOnly);
  const [tick, setTick] = useState(0);
  const [log, setLog] = useState("");
  const [pick, setPick] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    setLoading(true);
    (async () => {
      let { data, error } = await sb.rpc("expense_board", { p_from: range.from, p_to: range.to, p_branch: branch });
      if (error && /expense_board/.test(error.message)) {
        // 059 실행 전: 장부만
        const r = await sb.rpc("expense_list", { p_from: range.from, p_to: range.to, p_branch: branch });
        error = r.error;
        data = ((r.data ?? []) as Record<string, unknown>[]).map((x) => ({ ...x, kind: "expense", by_name: x.created_by, status: "등록됨", mine: x.created_by === me.name, can_decide: false }));
      }
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { on = false; };
  }, [range, branch, tick, me.name]);
  useEffect(() => {
    sb.rpc("expense_category_list").then(({ data }) => setCats(((data ?? []) as Cat[]).filter((c) => !c.hidden && c.kind !== "income")));
  }, []);

  useExport(rows.length ? () => downloadCsv(`지출_${range.from}_${range.to}.csv`,
    ["날짜", "지점", "계정", "내용", "금액", "수단", "담당", "상태"],
    rows.map((r) => [r.day, r.branch, r.category_name, r.memo, r.amount, ML[r.method] ?? r.method, r.by_name, r.status])) : null);

  async function act() {
    if (!pick) return;
    setBusy(true);
    const { error } = pick.kind === "request"
      ? await sb.rpc("approval_decide", { p_id: pick.id, p_ok: true, p_note: "" })
      : await sb.rpc("expense_void", { p_id: pick.id });
    setBusy(false);
    if (error) setErr(friendly(error.message));
    else setLog(`${me.name} ${me.title || TIER_LABEL[me.tier]} · 오늘 ${hm()} · ${pick.category_name} ${won(pick.amount)}원 ${pick.kind === "request" ? "승인" : "삭제"}`);
    setPick(null); setTick((t) => t + 1);
  }

  const who = me.tier === "staff" ? "직원" : "관리자";
  const formCard = (
    <ExpenseForm cats={cats} reqOnly={reqOnly} onDone={(msg) => { setLog(msg); setForm(reqOnly); setTick((t) => t + 1); }} />
  );

  if (reqOnly) {
    const mine = rows.filter((r) => r.kind === "request");
    return (
      <div className="sl3-pg">
        {formCard}
        {log && <p className="sl3-log">{log}</p>}
        {mine.length > 0 && <ExpTable rows={mine} onPick={() => {}} />}
      </div>
    );
  }

  return (
    <div className="sl3-pg">
      <SlTool help={rangeHelp(range, branch, false)} textCond
        cond={<><Cond label="조회기간"><PeriodPicker /></Cond><BranchCond /></>}
        right={<button className={`btn sm ${form ? "" : "p"}`} onClick={() => setForm(!form)}>지출 등록</button>} />
      {form && formCard}
      {err && <p className="sl-err">{err}</p>}
      <ExpTable rows={rows} loading={loading} onPick={(r) => { if (r.kind === "request" ? r.can_decide : me.tier !== "staff") setPick(r); }} />
      {log && <p className="sl3-log tight">{log}</p>}
      <p className="sl3-log tight">요청 대기는 직원이 보낸 건이에요. 50만 원이 넘는 건은 대표관리자 승인을 기다려요. 자기 요청은 승인할 수 없어요.</p>
      {pick && (
        <Confirm busy={busy} onClose={() => setPick(null)} onOk={act}
          title={pick.kind === "request" ? "이 지출 요청을 승인할까요?" : "이 지출을 지울까요?"}
          ok={pick.kind === "request" ? "승인" : "삭제"}
          lines={[`${pick.category_name} · ${pick.memo || "내용 없음"} · ${pick.branch}`, `금액 ${won(pick.amount)}원 · ${ML[pick.method] ?? pick.method}`,
            pick.kind === "request" ? `${pick.by_name ?? who}님이 보낸 요청이에요. 승인하면 바로 지출 장부에 들어가요.` : "지우면 장부에서 빠져요. 되돌릴 수 없어요."]} />
      )}
    </div>
  );
}

function ExpTable({ rows, loading, onPick }: { rows: Row[]; loading?: boolean; onPick: (r: Row) => void }) {
  return (
    <div className="sl3-card">
      <div className="sl-scroll">
        <table className="sl3-t sl3-exp">
          <thead><tr><th>날짜</th><th>계정</th><th>내용</th><th className="r">금액</th><th>수단</th><th>담당</th><th>증빙</th><th>상태</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.can_decide || r.kind === "expense" ? "go" : ""} onClick={() => onPick(r)}>
                <td>{md(r.day)}</td><td>{r.category_name}</td><td>{r.memo || <span className="sl-z">—</span>}</td>
                <td className="r">{won(r.amount)}</td><td>{ML[r.method] ?? r.method}</td><td>{r.by_name || "-"}</td>
                <td><span className="sl-z">—</span></td>
                <td><span className={`badge ${ST[r.status] ?? ""}`}>{r.status}</span></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="sl-empty">이 기간에 지출 기록이 없어요</td></tr>}
            {loading && rows.length === 0 && <tr><td colSpan={8} className="sl-empty">불러오는 중</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenseForm({ cats, reqOnly, onDone }: { cats: Cat[]; reqOnly: boolean; onDone: (log: string) => void }) {
  const me = useMe();
  const { branch } = useSales();
  const br = branch ?? me.branch;
  const [cat, setCat] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("카드");
  const [err, setErr] = useState("");
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const amt = Number(amount.replace(/\D/g, ""));
  const catName = cats.find((c) => c.id === cat)?.name ?? "";
  const bigOwner = me.tier === "manager" && amt >= 500000;
  const request = reqOnly || bigOwner;

  function check() {
    if (!cat) return setErr("계정을 골라 주세요");
    if (!amt) return setErr("금액을 입력해 주세요");
    setErr("");
    if (request) return save(); else setAsk(true);
  }
  async function save() {
    setBusy(true);
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const { error } = request
      ? await sb.rpc("approval_request", { p_branch: br, p_kind: "expense", p_target_type: "expense", p_target_id: "", p_payload: { category_id: cat, method, day: today }, p_amount: amt, p_reason: memo.trim() })
      : await sb.rpc("expense_add", { p_branch: br, p_day: today, p_category_id: cat, p_amount: amt, p_method: method, p_memo: memo.trim() });
    setBusy(false); setAsk(false);
    if (error) return setErr(/approval_request/.test(error.message) ? "요청 기능이 아직 준비 중이에요. (DB 070 실행 후 돼요)" : friendly(error.message));
    onDone(`${me.name} ${me.title || TIER_LABEL[me.tier]} · 오늘 ${hm()} · ${catName} ${amt.toLocaleString()}원 ${request ? "요청 · 승인을 기다려요" : "등록"}`);
    setCat(""); setMemo(""); setAmount("");
  }

  return (
    <div className="sl3-form">
      <b className="sl3-ft">{reqOnly ? "지출 요청" : "지출 등록"}</b>
      <label>계정</label>
      <div className="sl3-chips">{cats.map((c) => <button key={c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.name}</button>)}</div>
      {cats.length === 0 && <p className="sl3-hint">등록된 계정이 없어요. 매출 메뉴 &gt; 수입 · 지출 계정에서 먼저 만들어 주세요.</p>}
      <label>내용</label>
      <input className="inp" placeholder="예: 관리실 장갑" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <label>금액</label>
      <div className="sl3-amt"><input className="inp num" inputMode="numeric" placeholder="0" value={amt ? amt.toLocaleString() : ""} onChange={(e) => setAmount(e.target.value)} /><span>원</span></div>
      <label>수단</label>
      <div className="sl3-chips">{METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{ML[m] ?? m}</button>)}</div>
      <p className="sl3-hint">{request ? (bigOwner ? "50만 원 이상은 대표관리자가 승인해요. 기록에 남아요." : "관리자 이상이 처리해요. 기록에 남아요.") : "등록하면 바로 장부에 들어가요. 기록에 남아요."}</p>
      {err && <p className="sl-err" style={{ margin: 0 }}>{err}</p>}
      <div><button className="btn p sl3-go" disabled={busy} onClick={check}>{request ? "지출 요청" : "지출 등록"}</button></div>
      {ask && (
        <Confirm busy={busy} onClose={() => setAsk(false)} onOk={save} title="이 지출을 등록할까요?" ok="지출 등록"
          lines={[`${catName} · ${memo.trim() || "내용 없음"} · ${br}`, `금액 ${amt.toLocaleString()}원 · ${ML[method] ?? method}`, "등록하면 바로 반영돼요."]} />
      )}
    </div>
  );
}
