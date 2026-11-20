"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

type Row = {
  key: string; branch: string; customer_no: string | null; name: string; phone: string | null; manager: string | null;
  registered_on: string | null; last_visit_on: string | null; membership: string | null; has_membership: boolean | null;
  min_remaining: number | null; ends_on: string | null; source: string | null; tags: string | null; total: number;
};
const FILTERS = [
  { k: "all", l: "전체" }, { k: "member", l: "회원권 보유" }, { k: "expiring", l: "만료 임박" }, { k: "dormant", l: "60일 미방문" },
];
const PAGE = 50;

export default function Customers() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [branch, setBranch] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("q"); if (v) { setQ(v); setQuery(v); } }, []);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("customer_list", { p_q: query || null, p_branch: branch, p_filter: filter, p_limit: PAGE, p_offset: page * PAGE })
      .then(({ data, error }) => {
        if (!on) return;
        setErr(error ? error.message : "");
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
    return () => { on = false; };
  }, [query, filter, branch, page]);

  const total = rows[0]?.total ?? 0;
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const expiring = (r: Row) => r.has_membership && ((r.min_remaining ?? 99) <= 2 || (!!r.ends_on && r.ends_on <= in7 && r.ends_on >= today));

  return (
    <>
      <header className="top">
        <h1>고객</h1>
        <span className="sub num">{loading ? "" : `${total.toLocaleString()}명`}</span>
      </header>
      <div className="page">
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
          onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(q.trim()); }}>
          <input className="inp" style={{ maxWidth: 320 }} placeholder="이름, 연락처 뒤 4자리, 고객번호" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn">검색</button>
          {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); setPage(0); }}>지우기</button>}
        </form>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {FILTERS.map((f) => (
            <button key={f.k} className={`chip ${filter === f.k ? "on" : ""}`} onClick={() => { setFilter(f.k); setPage(0); }}>{f.l}</button>
          ))}
          {me.tier === "owner" && (
            <div className="seg" style={{ marginLeft: "auto" }}>
              {[null, ...BRANCHES].map((b) => (
                <button key={b ?? "all"} className={branch === b ? "on" : ""} onClick={() => { setBranch(b); setPage(0); }}>{b ?? "전 지점"}</button>
              ))}
            </div>
          )}
        </div>
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr><th>이름</th><th>연락처</th><th>지점</th><th>담당</th><th>회원권</th><th className="n">잔여</th><th>만료일</th><th>최근 방문</th><th>유입</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.branch}:${r.key}`} style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/customers/chart?b=${encodeURIComponent(r.branch)}&k=${encodeURIComponent(r.key)}`)}>
                  <td style={{ fontWeight: 600 }}>
                    {r.name}
                    {expiring(r) && <span className="badge em" style={{ marginLeft: 6 }}>만료 임박</span>}
                  </td>
                  <td className="num">{r.phone || "-"}</td>
                  <td>{r.branch}</td>
                  <td>{r.manager || "-"}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.membership || "-"}</td>
                  <td className="n">{r.min_remaining ?? "-"}</td>
                  <td className="num">{r.ends_on ?? "-"}</td>
                  <td className="num">{r.last_visit_on ?? "-"}</td>
                  <td>{r.source || "-"}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && !err && (
                <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--ink-3)" }}>조건에 맞는 고객이 없어요</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {total > PAGE && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, alignItems: "center" }}>
            <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button>
            <span className="num" style={{ fontSize: 13, color: "var(--ink-3)" }}>{page + 1} / {Math.ceil(total / PAGE)}</span>
            <button className="btn sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>다음</button>
          </div>
        )}
      </div>
    </>
  );
}
