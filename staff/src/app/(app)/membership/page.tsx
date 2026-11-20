"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won, todayKST, downloadCsv } from "@/lib/sales";
import { BranchOne, Kpis, friendly, useBranchPick } from "./ui";

type Row = {
  id: string; customer_key: string; customer: string | null; manager: string | null; name: string; kind: string;
  sold_on: string | null; end_on: string | null; total: number; used: number; remain: number; remain_amt: number;
  unpaid: number; st: "active" | "soon" | "expired";
};
type Data = {
  kpi: { customers: number; remain_cnt: number; remain_amt: number; soon: number };
  by_product: { name: string; kind: string; n: number; remain_cnt: number; remain_amt: number }[];
  rows: Row[];
};

const FILTERS = [
  { v: "active", label: "사용 중" },
  { v: "soon", label: "만료 임박" },
  { v: "expired", label: "끝난 것" },
  { v: "all", label: "전체" },
];
const ST = { active: { t: "사용 중", c: "ok" }, soon: { t: "임박", c: "warn" }, expired: { t: "끝남", c: "" } } as const;

export default function Holdings() {
  const me = useMe();
  const router = useRouter();
  const [branch, setBranch] = useState(useBranchPick());
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("membership_holdings", { p_branch: branch, p_filter: filter }).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : data ? "" : "이 화면을 볼 권한이 없어요");
      setData((data as Data) ?? null);
      setLoading(false);
    });
    return () => { on = false; };
  }, [branch, filter]);

  const rows = useMemo(() => {
    const s = q.trim();
    return (data?.rows ?? []).filter((r) => !s || (r.customer ?? "").includes(s) || r.name.includes(s));
  }, [data, q]);

  const k = data?.kpi;
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg">
          {FILTERS.map((f) => <button key={f.v} className={filter === f.v ? "on" : ""} onClick={() => setFilter(f.v)}>{f.label}</button>)}
        </div>
        <input className="inp" style={{ maxWidth: 240 }} placeholder="고객명 또는 회원권명" value={q} onChange={(e) => setQ(e.target.value)} />
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <BranchOne value={branch} onChange={setBranch} />
          {canSee(me, "export.excel") && (
            <button className="btn sm" disabled={!rows.length} onClick={() => downloadCsv(`보유회원권_${branch}_${todayKST()}.csv`,
              ["고객명", "담당", "회원권", "종류", "구매일", "만료일", "전체", "사용", "남은 회차", "남은 금액", "미수", "상태"],
              rows.map((r) => [r.customer, r.manager, r.name, r.kind, r.sold_on, r.end_on, r.total, r.used, r.remain, r.remain_amt, r.unpaid, ST[r.st].t]))}>엑셀 내려받기</button>
          )}
        </span>
      </div>

      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      {k && (
        <Kpis items={[
          { label: "보유 고객", value: `${k.customers.toLocaleString()}명` },
          { label: "남은 회차 합", value: `${k.remain_cnt.toLocaleString()}회` },
          { label: "남은 금액 합", value: `${won(k.remain_amt)}원`, strong: true },
          { label: "만료 임박 (7일·2회 이하)", value: `${k.soon.toLocaleString()}건` },
        ]} />
      )}

      {data && data.by_product.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", fontWeight: 700 }}>회원권별 요약</div>
          <table className="t">
            <thead><tr><th>회원권</th><th>종류</th><th style={{ textAlign: "right" }}>건수</th><th style={{ textAlign: "right" }}>남은 회차</th><th style={{ textAlign: "right" }}>남은 금액</th></tr></thead>
            <tbody>
              {data.by_product.map((p) => (
                <tr key={p.name + p.kind}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td><td>{p.kind}</td>
                  <td className="num" style={{ textAlign: "right" }}>{p.n}</td>
                  <td className="num" style={{ textAlign: "right" }}>{p.remain_cnt}</td>
                  <td className="num" style={{ textAlign: "right" }}>{won(p.remain_amt)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>합계</td><td></td>
                <td className="num" style={{ textAlign: "right" }}>{data.by_product.reduce((a, p) => a + p.n, 0)}</td>
                <td className="num" style={{ textAlign: "right" }}>{data.by_product.reduce((a, p) => a + Number(p.remain_cnt), 0)}</td>
                <td className="num" style={{ textAlign: "right" }}>{won(data.by_product.reduce((a, p) => a + Number(p.remain_amt), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="t">
          <thead>
            <tr>
              <th>고객</th><th>담당</th><th>회원권</th><th>구매일</th><th>만료일</th>
              <th style={{ textAlign: "right" }}>전체 / 사용 / 남음</th><th style={{ textAlign: "right" }}>남은 금액</th>
              <th style={{ textAlign: "right" }}>미수</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer", color: r.st === "expired" ? "var(--ink-3)" : undefined }}
                onClick={() => router.push(`/customers/chart?b=${encodeURIComponent(branch)}&k=${encodeURIComponent(r.customer_key)}`)}>
                <td style={{ fontWeight: 600 }}>{r.customer ?? "-"}</td>
                <td>{r.manager || "-"}</td>
                <td>{r.name} <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-xs)" }}>{r.kind}</span></td>
                <td className="num">{r.sold_on ?? "-"}</td>
                <td className="num">{r.end_on ?? "-"}</td>
                <td className="num" style={{ textAlign: "right" }}>{r.total} / {r.used} / <b>{r.remain}</b></td>
                <td className="num" style={{ textAlign: "right" }}>{won(r.remain_amt)}</td>
                <td className="num" style={{ textAlign: "right", color: r.unpaid > 0 ? "var(--red)" : undefined }}>{won(r.unpaid)}</td>
                <td><span className={`badge ${ST[r.st].c}`}>{ST[r.st].t}</span></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !err && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--ink-3)" }}>조건에 맞는 회원권이 없어요</td></tr>
            )}
            {loading && <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--ink-3)" }}>불러오는 중</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>남은 금액은 판매가 ÷ 전체 회차 × 남은 회차로 계산해요. 줄을 누르면 고객 차트가 열려요.</p>
    </>
  );
}
