"use client";
/* 매출 > 미수금 (시안 U-PC-SALES-8 · 정산 확인 · 정산 요청 · 요청 보냄 · 정산 완료)
   관리자·대표관리자: 정산 → 확인 창 → 바로 반영 (059 receivable_settle)
   직원: 정산 요청 → 관리자가 정산 (070 approval_request 'receivable_settle') */
import { useEffect, useState } from "react";
import { sb, TIER_LABEL } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won, todayKST, downloadCsv } from "@/lib/sales";
import { SalesTable, Confirm, useSales, useExport, md, friendly } from "../ui";

type Row = {
  branch: string; customer_key: string; customer_name: string; staff_name: string | null; balance: number; last_day: string | null;
  req_id: string | null; req_by: string | null; req_mine: boolean | null;
};
const hm = () => { const d = new Date(Date.now() + 9 * 3600e3); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };
const METHODS = ["카드", "현금", "계좌이체"];

export default function Receivables() {
  const me = useMe();
  const { branch } = useSales();
  const boss = me.tier !== "staff";
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState<Record<string, true>>({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [pick, setPick] = useState<Row | null>(null);
  const [ask, setAsk] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [method, setMethod] = useState("카드");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const [board, setBoard] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    (async () => {
      let { data, error } = await sb.rpc("receivable_board", { p_branch: branch });
      if (error && /receivable_board/.test(error.message)) {
        // 059 실행 전: 예전 목록 (담당·요청은 비어 있어요)
        setBoard(false);
        const r = await sb.rpc("receivable_list", { p_q: null, p_branch: branch });
        error = r.error;
        data = ((r.data ?? []) as Row[]).filter((x) => Number(x.balance) > 0);
      }
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { on = false; };
  }, [branch, tick]);

  const id = (r: Row) => `${r.branch}:${r.customer_key}`;
  const open = rows.filter((r) => !done[id(r)]);
  const total = open.reduce((a, r) => a + Number(r.balance), 0);
  const last = open.reduce<string | null>((a, r) => (r.last_day && (!a || r.last_day > a) ? r.last_day : a), null);

  useExport(rows.length ? () => downloadCsv(`미수금_${todayKST()}.csv`, ["지점", "고객", "담당", "미수금", "최근 발생일"],
    rows.map((r) => [r.branch, r.customer_name, r.staff_name, r.balance, r.last_day])) : null);

  async function settle() {
    if (!ask) return;
    setBusy(true);
    const { error } = await sb.rpc("receivable_settle", { p_branch: ask.branch, p_key: ask.customer_key, p_amount: Number(ask.balance), p_method: method });
    setBusy(false);
    if (error) { setErr(/receivable_settle/.test(error.message) ? "정산 기능이 아직 준비 중이에요. (DB 059 실행 후 돼요)" : friendly(error.message)); setAsk(null); return; }
    setDone({ ...done, [id(ask)]: true });
    setLog(`${me.name} ${me.title || TIER_LABEL[me.tier]} · 오늘 ${hm()} · ${ask.customer_name} ${won(Number(ask.balance))}원 정산`);
    setAsk(null);
  }
  async function request() {
    if (!pick) return;
    if (!reason.trim()) return setErr("사유를 적어 주세요");
    setBusy(true);
    const { error } = await sb.rpc("approval_request", {
      p_branch: pick.branch, p_kind: "receivable_settle", p_target_type: "customer", p_target_id: pick.customer_key,
      p_payload: { customer_name: pick.customer_name }, p_amount: Number(pick.balance), p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) return setErr(/approval_request/.test(error.message) ? "요청 기능이 아직 준비 중이에요. (DB 070 실행 후 돼요)" : friendly(error.message));
    setLog(`${me.name} ${me.title || TIER_LABEL[me.tier]} · 오늘 ${hm()} · ${pick.customer_name} ${won(Number(pick.balance))}원 정산 요청 · 관리자 이상이 처리해요.`);
    setPick(null); setReason(""); setErr(""); setTick((t) => t + 1);
  }

  if (pick) {
    return (
      <div className="sl3-pg">
        <div className="sl3-form">
          <b className="sl3-ft">미수금 정산 요청</b>
          <p className="sl3-line">{pick.customer_name} · 최근 발생 {md(pick.last_day)}</p>
          <p className="sl3-line">정산 금액 {won(Number(pick.balance))}원</p>
          <label>사유</label>
          <textarea className="inp sl3-ta" placeholder="예: 오늘 카드로 받기로 했어요." value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className="sl3-hint">관리자 이상이 처리해요. 자기 요청은 승인할 수 없어요.</p>
          {err && <p className="sl-err" style={{ margin: "0 0 12px" }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn p sl3-go" disabled={busy} onClick={request}>정산 요청</button>
            <button className="btn sl3-go" onClick={() => { setPick(null); setErr(""); }}>닫기</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sl3-pg">
      <div className="sl3-kpis">
        <div className="sl3-kpi"><b className="em">{loading ? "-" : won(total)}</b><span>미수금 합</span></div>
        <div className="sl3-kpi"><b>{open.length.toLocaleString()}명</b><span>미수 고객</span></div>
        <div className="sl3-kpi"><b>{last ? md(last) : "—"}</b><span>가장 최근 발생</span></div>
      </div>
      {err && <p className="sl-err">{err}</p>}
      <div className="sl3-card">
        <div className="sl-scroll">
          <table className="sl3-t sl3-rcv">
            <thead><tr><th>고객</th><th>담당</th><th className="r">미수금</th><th>최근 발생일</th><th className="act" /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const settled = !!done[id(r)];
                return (
                  <tr key={id(r)}>
                    <td className="go" onClick={() => setView(r)} title="눌러서 미수 내역 보기">{r.customer_name}</td>
                    <td>{r.staff_name || <span className="sl-z">—</span>}</td>
                    <td className="r">{settled ? <span className="sl-z">0</span> : won(Number(r.balance))}</td>
                    <td>{md(r.last_day)}</td>
                    <td className="act">
                      {settled ? <span className="badge ok">정산됨</span>
                        : r.req_id && (r.req_mine || !boss) ? <span className="badge warn">기다리는 중</span>
                        : r.req_id ? <button className="sl3-req" onClick={() => setAsk(r)} title="눌러서 정산"><span className="badge warn">요청 대기</span>{r.req_by} {me.tier === "owner" ? "" : ""}</button>
                        : boss ? <button className="btn sm" onClick={() => setAsk(r)}>정산</button>
                        : <button className="btn sm" onClick={() => setPick(r)}>정산 요청</button>}
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && !err && <tr><td colSpan={5} className="sl-empty">남은 미수금이 없어요</td></tr>}
              {loading && rows.length === 0 && <tr><td colSpan={5} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
            {boss && rows.length > 0 && <tfoot><tr><td>합계</td><td /><td className="r">{won(total)}</td><td /><td /></tr></tfoot>}
          </table>
        </div>
      </div>
      {log && <p className="sl3-log">{log}</p>}
      {boss && <p className="sl3-log">요청 대기는 직원이 보낸 건이에요. 자기 요청은 승인 버튼이 없어요.</p>}
      {!board && <p className="sl3-log">담당 · 요청 표시는 DB 059 실행 후 보여요.</p>}
      {ask && (
        <Confirm busy={busy} onClose={() => setAsk(null)} onOk={settle} title="이 미수금을 정산할까요?" ok="정산"
          lines={[`${ask.customer_name} · ${ask.branch}`, `정산 금액 ${won(Number(ask.balance))}원`,
            <span key="m" className="sl3-chips">{METHODS.map((m) => <button key={m} className={method === m ? "on" : ""} onClick={() => setMethod(m)}>{m}</button>)}</span>,
            "정산하면 바로 반영돼요. 되돌릴 수 없어요."]} />
      )}
      {view && (
        <>
          <div className="dim" style={{ zIndex: 60 }} onClick={() => setView(null)} />
          <div className="drawer lg" style={{ zIndex: 61 }}>
            <div className="hd">{view.customer_name} 미수 내역</div>
            <div className="bd">
              <SalesTable inline csvName={`미수내역_${view.customer_name}`}
                cols={["when", "staff", "kind", "content", "memo", "amount", "unpaid", "settled"]}
                query={{ tab: "receivable", range: { from: "2000-01-01", to: todayKST() }, branch: view.branch, customer_key: view.customer_key }} />
            </div>
            <div className="ft"><button className="btn" onClick={() => setView(null)}>닫기</button></div>
          </div>
        </>
      )}
    </div>
  );
}
