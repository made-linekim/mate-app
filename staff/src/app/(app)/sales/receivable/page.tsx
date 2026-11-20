"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won, todayKST, downloadCsv } from "@/lib/sales";
import { SalesTable, Kpi, Z, useSales, useExport, mdy, friendly } from "../ui";

type Row = { branch: string; customer_key: string; customer_name: string; phone: string | null; issued: number; settled: number; balance: number; last_day: string | null };

export default function Receivables() {
  const me = useMe();
  const { branch } = useSales();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [plus, setPlus] = useState(true);
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

  // 서버는 잔액이 0 이 아닌 고객만 줘요. 체크하면 받을 돈(잔액 > 0)만, 풀면 더 받은 고객(잔액 < 0)도 보여요.
  const list = plus ? rows.filter((r) => Number(r.balance) > 0) : rows;
  const total = list.reduce((a, r) => a + Number(r.balance), 0);

  useExport(list.length ? () => downloadCsv(`미수금_${todayKST()}.csv`,
    ["지점", "고객명", "연락처", "미수발생", "미수정산", "미수잔액", "최근 거래일"],
    list.map((r) => [r.branch, r.customer_name, r.phone, r.issued, r.settled, r.balance, r.last_day])) : null);

  const showBranch = me.tier === "owner" && !branch;

  return (
    <>
      <form className="sl-row" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <label className="sl-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input className="inp" placeholder="고객 이름 · 뒤 4자리" value={q}
            onChange={(e) => { setQ(e.target.value); if (!e.target.value) setQuery(""); }} />
        </label>
        <label className="sl-check"><input type="checkbox" checked={plus} onChange={(e) => setPlus(e.target.checked)} />0원 아닌 고객만</label>
      </form>
      <div className="sl-kpis one">
        <Kpi label="미수금 합" value={loading ? "-" : won(total)} unit="원" sub={`${list.length.toLocaleString()}명`} em />
      </div>
      {err && <p className="sl-err">{err}</p>}
      <div className="sl-card">
        <div className="sl-scroll">
          <table className="sl-t">
            <thead>
              <tr>
                <th>고객</th>{showBranch && <th>지점</th>}<th>연락처</th>
                <th className="r">미수금</th><th>최근 발생일</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.branch}:${r.customer_key}`}>
                  <td className="nm">{r.customer_name}</td>{showBranch && <td>{r.branch}</td>}
                  <td>{r.phone || "-"}</td>
                  <td className="r" style={{ color: Number(r.balance) < 0 ? "var(--grn)" : undefined }}><Z n={Number(r.balance)} /></td>
                  <td>{mdy(r.last_day)}</td>
                  <td><button className="btn sm" onClick={() => setPick(r)}>정산</button></td>
                </tr>
              ))}
              {!loading && list.length === 0 && !err && <tr><td colSpan={6} className="sl-empty">남은 미수금이 없어요</td></tr>}
              {loading && <tr><td colSpan={6} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr className="sum"><td>합계</td>{showBranch && <td />}<td /><td className="r">{won(total)}</td><td /><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {pick && (
        <>
          <div className="dim" onClick={() => setPick(null)} />
          <div className="drawer lg">
            <div className="hd">{pick.customer_name} 미수 정산</div>
            <div className="bd">
              <p style={{ margin: 0 }} className="num">잔액 <b style={{ color: "var(--red)" }}>{won(pick.balance)}원</b> · 발생 {won(pick.issued)} · 정산 {won(pick.settled)}</p>
              <p className="sl-note">정산 결제는 예약표의 결제 처리에서 &lsquo;미수금 정산&rsquo;으로 받아요. 아래는 이 고객의 미수 내역이에요.</p>
              <SalesTable inline csvName={`미수내역_${pick.customer_name}`}
                cols={["when", "staff", "kind", "content", "memo", "amount", "unpaid", "settled"]}
                query={{ tab: "receivable", range: { from: "2000-01-01", to: todayKST() }, branch: pick.branch, customer_key: pick.customer_key }} />
            </div>
            <div className="ft"><button className="btn" onClick={() => setPick(null)}>닫기</button></div>
          </div>
        </>
      )}
    </>
  );
}
