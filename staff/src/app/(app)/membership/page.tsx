"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won, todayKST, downloadCsv } from "@/lib/sales";
import { MbKpi, friendly, useMb } from "./ui";

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
const n = (v: number) => Number(v).toLocaleString();
const md = (d: string | null) => (d ? `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` : "");

export default function Holdings() {
  const me = useMe();
  const router = useRouter();
  const { branch, q } = useMb();
  const [filter, setFilter] = useState("active");
  const [prod, setProd] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

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
    return (data?.rows ?? []).filter((r) => (!s || (r.customer ?? "").includes(s) || r.name.includes(s)) && (!prod || r.name === prod));
  }, [data, q, prod]);

  // 고객당 한 줄로 묶기 (회원권 여러 장은 한 칸 안에)
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; customer: string | null; manager: string | null; items: Row[]; remain: number; remain_amt: number; unpaid: number; st: Row["st"] }>();
    for (const r of rows) {
      let g = m.get(r.customer_key);
      if (!g) { g = { key: r.customer_key, customer: r.customer, manager: r.manager, items: [], remain: 0, remain_amt: 0, unpaid: 0, st: "expired" }; m.set(r.customer_key, g); }
      g.items.push(r);
      if (r.st !== "expired") { g.remain += Number(r.remain); g.remain_amt += Number(r.remain_amt); }
      g.unpaid += Number(r.unpaid);
      if (r.st === "soon" || (r.st === "active" && g.st === "expired")) g.st = r.st;
    }
    return [...m.values()];
  }, [rows]);

  // 회원권별 요약: 보유 고객 수는 지금 받은 목록에서 고객 수로 셈
  const full = (data?.rows.length ?? 0) < 500; // 서버는 목록을 500줄까지만 줘요
  const byProd = useMemo(() => (data?.by_product ?? []).map((p) => {
    const custs = new Set((data?.rows ?? []).filter((r) => r.name === p.name && r.kind === p.kind).map((r) => r.customer_key));
    const cnt = Number(p.remain_cnt), amt = Number(p.remain_amt);
    return { ...p, custs: full ? custs.size : p.n, unit: p.kind === "회차" && cnt > 0 ? Math.round(amt / cnt) : null };
  }), [data, full]);
  const sumCusts = full ? new Set((data?.rows ?? []).map((r) => r.customer_key)).size : byProd.reduce((a, p) => a + p.custs, 0);

  function show(name: string | null) {
    setProd(name);
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const k = data?.kpi;
  return (
    <>
      {err && <p className="mb-err">{err}</p>}
      <div className="mb-kpis">
        <MbKpi label="보유 고객" value={k ? n(k.customers) : "-"} unit="명" sub="끝나지 않은 회원권 1개 이상" />
        <MbKpi label="남은 회차 합" value={k ? n(k.remain_cnt) : "-"} unit="회" />
        <MbKpi label="남은 금액 합" value={k ? won(k.remain_amt) : "-"} unit="원" sub="판매가 ÷ 전체 회차 × 남은 회차" em />
        <MbKpi label="만료 임박" value={k ? n(k.soon) : "-"} unit="건" sub="7일 안 만료 · 2회 이하 남음" />
      </div>

      <div className="mb-card">
        <div className="mb-hd">
          <h2>회원권별 요약</h2><span className="meta">{byProd.length}종</span>
          <div className="act">
            <div className="seg">
              {FILTERS.map((f) => <button key={f.v} className={filter === f.v ? "on" : ""} onClick={() => setFilter(f.v)}>{f.label}</button>)}
            </div>
            <button className="mb-link" onClick={() => show(null)}>고객별 목록 열기</button>
          </div>
        </div>
        <div className="mb-scroll">
          <table className="mb-t">
            <thead>
              <tr>
                <th>회원권</th><th className="r">보유 고객</th><th className="r">남은 회차</th><th className="r">1회 단가</th>
                <th className="r">남은 금액</th><th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {byProd.map((p) => (
                <tr key={p.name + p.kind}>
                  <td>{p.name}{p.kind !== "회차" && <span className="mute"> · {p.kind}</span>}</td>
                  <td className="r">{n(p.custs)}</td>
                  <td className="r">{p.kind === "회차" ? n(p.remain_cnt) : "-"}</td>
                  <td className="r">{p.unit != null ? won(p.unit) : "-"}</td>
                  <td className="r">{won(p.remain_amt)}</td>
                  <td><button className="btn sm" onClick={() => show(p.name)}>고객 보기</button></td>
                </tr>
              ))}
              {!loading && byProd.length === 0 && !err && <tr><td colSpan={6} className="mb-empty">조건에 맞는 회원권이 없어요</td></tr>}
              {loading && !data && <tr><td colSpan={6} className="mb-empty">불러오는 중</td></tr>}
            </tbody>
            {byProd.length > 0 && (
              <tfoot>
                <tr>
                  <td>합계</td>
                  <td className="r">{n(sumCusts)}</td>
                  <td className="r">{n(byProd.reduce((a, p) => a + (p.kind === "회차" ? Number(p.remain_cnt) : 0), 0))}</td>
                  <td />
                  <td className="r">{won(byProd.reduce((a, p) => a + Number(p.remain_amt), 0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="mb-card" ref={listRef} style={{ scrollMarginTop: 16 }}>
        <div className="mb-hd">
          <h2>고객별 보유 회원권</h2>
          <span className="meta">{groups.length.toLocaleString()}명{prod ? ` · ${prod}` : ""}</span>
          {prod && <button className="btn t sm" onClick={() => setProd(null)}>회원권 필터 풀기</button>}
          <div className="act">
            {canSee(me, "export.excel") && (
              <button className="btn sm" disabled={!rows.length} onClick={() => downloadCsv(`보유회원권_${branch}_${todayKST()}.csv`,
                ["고객명", "담당", "회원권", "종류", "구매일", "만료일", "전체", "사용", "남은 회차", "남은 금액", "미수", "상태"],
                rows.map((r) => [r.customer, r.manager, r.name, r.kind, r.sold_on, r.end_on, r.total, r.used, r.remain, r.remain_amt, r.unpaid, ST[r.st].t]))}>엑셀 다운</button>
            )}
          </div>
        </div>
        <div className="mb-scroll">
          <table className="mb-t">
            <thead>
              <tr>
                <th>고객</th><th>담당</th><th>가진 회원권 (남은 회차 · 만료일)</th>
                <th className="r">남은 회차</th><th className="r">남은 금액</th><th className="r">미수</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.key} className={`go ${g.st === "expired" ? "off" : ""}`} style={{ verticalAlign: g.items.length > 1 ? "top" : "middle" }}
                  onClick={() => router.push(`/customers/chart?b=${encodeURIComponent(branch)}&k=${encodeURIComponent(g.key)}`)}>
                  <td className="nm" style={{ paddingTop: g.items.length > 1 ? 14 : undefined }}>{g.customer ?? "-"}{g.items.length > 1 && <span className="mute" style={{ fontWeight: 400 }}> · {g.items.length}개</span>}</td>
                  <td style={{ paddingTop: g.items.length > 1 ? 14 : undefined }}>{g.manager || "-"}</td>
                  <td className="items">
                    {g.items.map((r) => (
                      <div key={r.id}>
                        <span>{r.name}</span>
                        <span className="mute">{r.kind === "회차" ? `${r.remain}회 남음` : r.kind}{r.end_on ? ` · ${md(r.end_on)}` : ""}</span>
                        {r.st !== "active" && <span className={`badge ${ST[r.st].c}`}>{ST[r.st].t}</span>}
                      </div>
                    ))}
                  </td>
                  <td className="r" style={{ paddingTop: g.items.length > 1 ? 14 : undefined }}><b>{g.remain}</b></td>
                  <td className="r" style={{ paddingTop: g.items.length > 1 ? 14 : undefined }}>{won(g.remain_amt)}</td>
                  <td className="r" style={{ paddingTop: g.items.length > 1 ? 14 : undefined, color: g.unpaid > 0 ? "var(--red)" : undefined }}>{won(g.unpaid)}</td>
                  <td style={{ paddingTop: g.items.length > 1 ? 10 : undefined }}><span className={`badge ${ST[g.st].c}`}>{ST[g.st].t}</span></td>
                </tr>
              ))}
              {!loading && groups.length === 0 && !err && <tr><td colSpan={7} className="mb-empty">조건에 맞는 회원권이 없어요</td></tr>}
              {loading && <tr><td colSpan={7} className="mb-empty">불러오는 중</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mb-note">고객을 누르면 고객 차트가 열려요.</p>
    </>
  );
}
