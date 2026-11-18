"use client";
import { useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { SalesTable, PeriodPicker, Cond, friendly, type Range } from "../ui";

type Hit = { key: string; branch: string; name: string; phone: string | null; membership: string | null; last_visit_on: string | null };

export default function CustomerSales() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<Hit | null>(null);
  const [range, setRange] = useState<Range>({ from: "2000-01-01", to: todayKST() });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const { data, error } = await sb.rpc("customer_list", { p_q: v, p_branch: null, p_filter: "all", p_limit: 20, p_offset: 0 });
    setErr(error ? friendly(error.message) : "");
    setHits((data ?? []) as Hit[]);
    setPick(null);
  }

  return (
    <>
      <div className="card">
        <div className="hd"><h2>고객 검색</h2><span className="meta">이름이나 연락처 뒤 4자리로 찾아요</span></div>
        <form style={{ display: "flex", gap: 8 }} onSubmit={search}>
          <input className="inp" style={{ maxWidth: 320 }} placeholder="이름 또는 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn p">검색</button>
        </form>
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        {hits && !pick && (
          <div style={{ marginTop: 16, overflowX: "auto" }}>
            <table className="t">
              <thead><tr><th>이름</th><th>연락처</th><th>지점</th><th>회원권</th><th>최근 방문</th><th></th></tr></thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={`${h.branch}:${h.key}`}>
                    <td style={{ fontWeight: 600 }}>{h.name}</td>
                    <td className="num">{h.phone || "-"}</td>
                    <td>{h.branch}</td>
                    <td>{h.membership || "-"}</td>
                    <td className="num">{h.last_visit_on ?? "-"}</td>
                    <td style={{ textAlign: "right" }}><button className="btn sm" onClick={() => setPick(h)}>매출 보기</button></td>
                  </tr>
                ))}
                {hits.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)" }}>찾는 고객이 없어요</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pick && (
        <div style={{ marginTop: "var(--section-gap)" }}>
          <div className="card" style={{ padding: "4px 20px" }}>
            <Cond label="고객">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <b>{pick.name}</b><span style={{ color: "var(--ink-3)" }}>{pick.branch} · {pick.phone || "-"}</span>
                <button className="btn t sm" onClick={() => setPick(null)}>다른 고객</button>
              </div>
            </Cond>
            <Cond label="조회기간">
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button className={`chip ${range.from === "2000-01-01" ? "on" : ""}`} onClick={() => setRange({ from: "2000-01-01", to: todayKST() })}>전체 기간</button>
                <PeriodPicker value={range} onChange={setRange} />
              </div>
            </Cond>
          </div>
          <SalesTable csvName={`고객별매출_${pick.name}`}
            cols={["when", "staff", "kind", "content", "memo", "time", "amount", "card", "cash", "account", "npay", "unpaid", "settled", "discount", "point", "sessions"]}
            query={{ tab: "customer", range, branch: pick.branch, customer_key: pick.key }} />
        </div>
      )}
    </>
  );
}
