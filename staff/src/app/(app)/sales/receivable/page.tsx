"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won, todayKST, downloadCsv } from "@/lib/sales";
import { SalesTable, BranchSeg, friendly } from "../ui";

type Row = { branch: string; customer_key: string; customer_name: string; phone: string | null; issued: number; settled: number; balance: number; last_day: string | null };

export default function Receivables() {
  const me = useMe();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<Row | null>(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("receivable_list", { p_q: query || null, p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as Row[]);
      setLoading(false);
    });
    return () => { on = false; };
  }, [query, branch]);

  const total = rows.reduce((a, r) => a + Number(r.balance), 0);

  return (
    <>
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <input className="inp" style={{ maxWidth: 280 }} placeholder="이름 또는 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">검색</button>
        {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); }}>지우기</button>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <BranchSeg value={branch} onChange={setBranch} />
          {canSee(me, "export.excel") && (
            <button type="button" className="btn sm" disabled={!rows.length} onClick={() => downloadCsv(`미수금_${todayKST()}.csv`,
              ["지점", "고객명", "연락처", "미수발생", "미수정산", "미수잔액", "최근 거래일"],
              rows.map((r) => [r.branch, r.customer_name, r.phone, r.issued, r.settled, r.balance, r.last_day]))}>엑셀 내려받기</button>
          )}
        </span>
      </form>
      <div style={{ display: "flex", gap: 8, margin: "16px 0 8px", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }} className="num">
        {loading ? "불러오는 중" : <>미수 고객 {rows.length.toLocaleString()}명 · 잔액 합계 <b style={{ color: "var(--ink)" }}>{won(total)}원</b></>}
      </div>
      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr>
              {me.tier === "owner" && <th>지점</th>}<th>고객명</th><th>연락처</th>
              <th style={{ textAlign: "right" }}>미수발생</th><th style={{ textAlign: "right" }}>미수정산</th>
              <th style={{ textAlign: "right" }}>미수잔액</th><th>최근 거래일</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.branch}:${r.customer_key}`}>
                {me.tier === "owner" && <td>{r.branch}</td>}
                <td style={{ fontWeight: 600 }}>{r.customer_name}</td>
                <td className="num">{r.phone || "-"}</td>
                <td className="num" style={{ textAlign: "right" }}>{won(r.issued)}</td>
                <td className="num" style={{ textAlign: "right" }}>{won(r.settled)}</td>
                <td className="num" style={{ textAlign: "right", color: r.balance > 0 ? "var(--red)" : "var(--grn)", fontWeight: 700 }}>{won(r.balance)}</td>
                <td className="num">{r.last_day ?? "-"}</td>
                <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => setPick(r)}>내역</button></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--ink-3)" }}>남은 미수금이 없어요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pick && (
        <>
          <div className="dim" onClick={() => setPick(null)} />
          <div className="drawer lg">
            <div className="hd">{pick.customer_name} 미수 내역</div>
            <div className="bd">
              <p style={{ margin: 0 }} className="num">잔액 <b style={{ color: "var(--red)" }}>{won(pick.balance)}원</b> · 발생 {won(pick.issued)} · 정산 {won(pick.settled)}</p>
              <SalesTable csvName={`미수내역_${pick.customer_name}`}
                cols={["when", "staff", "kind", "content", "memo", "amount", "unpaid", "settled"]}
                query={{ tab: "receivable", range: { from: "2000-01-01", to: todayKST() }, branch: pick.branch, customer_key: pick.customer_key }} />
              <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>미수 정산 결제는 예약표의 결제 처리에서 &lsquo;미수금 정산&rsquo;으로 받아요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setPick(null)}>닫기</button></div>
          </div>
        </>
      )}
    </>
  );
}
