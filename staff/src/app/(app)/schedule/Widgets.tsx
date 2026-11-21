"use client";
// 현황보드 위젯 (뷰티사랑넷 현황보드 위젯 항목 + 유효고객 · 예약/매출 추이 그래프)
// 데이터: board_widget RPC (SQL 092). 함수가 없거나 권한이 없으면 그 위젯은 숨겨요.
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";

export type WKey =
  | "rsv_status" | "rsv_trend" | "rsv_list"
  | "sales_status" | "sales_trend" | "sales_quarter" | "sales_method" | "sales_staff" | "rank_service" | "rank_goods" | "rank_customer"
  | "cust_status" | "cust_visit" | "cust_absent" | "noshow_rank"
  | "mem_info" | "mem_expiring";

export type WCat = "예약" | "매출" | "고객" | "회원권";
export const BOARD: { k: WKey; cat: WCat; l: string; d: string }[] = [
  { k: "rsv_status", cat: "예약", l: "예약 현황", d: "오늘·내일·이번 주·이번 달 예약, 취소, 노쇼, 신규, 결제 완료" },
  { k: "rsv_trend", cat: "예약", l: "예약 추이", d: "일·주·월 단위 예약 건수 막대그래프" },
  { k: "rsv_list", cat: "예약", l: "담당자별 예약 목록", d: "오늘·내일·모레·3일 후 담당자별 시간, 고객, 관리" },
  { k: "sales_status", cat: "매출", l: "매출 현황", d: "오늘·이번 주·이번 달·지난달 구분별 건수와 결제수단별 금액" },
  { k: "sales_trend", cat: "매출", l: "매출 추이", d: "일·주·월 단위 매출 곡선그래프" },
  { k: "sales_quarter", cat: "매출", l: "분기별 매출 비교", d: "최근 3년 분기별 매출 막대그래프" },
  { k: "sales_method", cat: "매출", l: "결제수단별 매출", d: "카드·현금·계좌이체·NPay 비율 그래프" },
  { k: "sales_staff", cat: "매출", l: "담당자별 매출", d: "이번 달·지난달 담당자별 매출" },
  { k: "rank_service", cat: "매출", l: "관리별 매출 순위", d: "많이 팔린 관리 순서" },
  { k: "rank_goods", cat: "매출", l: "제품별 매출 순위", d: "많이 팔린 제품 순서" },
  { k: "rank_customer", cat: "매출", l: "고객 매출 순위", d: "결제 금액이 많은 고객 순서" },
  { k: "cust_status", cat: "고객", l: "고객 현황", d: "전체 고객, 유효고객, 이번 달·지난달 신규 방문" },
  { k: "cust_visit", cat: "고객", l: "고객 방문 현황", d: "어제·오늘·이번 주·이번 달 신규, 취소, 노쇼, 총 방문" },
  { k: "cust_absent", cat: "고객", l: "미방문 고객 현황", d: "마지막 방문 뒤 15·30·45·60일 지난 고객 수" },
  { k: "noshow_rank", cat: "고객", l: "노쇼·취소 고객 순위", d: "노쇼·취소가 많은 고객 순서" },
  { k: "mem_info", cat: "회원권", l: "회원권 정보", d: "회차 회원권 보유 고객과 남은 회차, 기간 회원권 보유 고객" },
  { k: "mem_expiring", cat: "회원권", l: "만료 예정 회원권", d: "일주일·한 달 안에 끝나는 회원권" },
];
export const BOARD_DEFAULT: WKey[] = ["rsv_status", "rsv_trend", "sales_status", "sales_trend", "cust_status", "cust_visit", "mem_info", "mem_expiring", "rsv_list"];

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;
const man = (n: number) => (Math.abs(n) >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString()}만` : Math.round(n).toLocaleString());

// 위젯 데이터 불러오기. null = 불러오는 중, "hide" = 숨김(함수 없음·권한 없음)
function useW<T>(key: WKey, branch: string, opt: string | null) {
  const [d, setD] = useState<T | null | "hide">(null);
  useEffect(() => {
    let on = true;
    setD(null);
    sb.rpc("board_widget", { p_key: key, p_branch: branch, p_opt: opt }).then(({ data, error }) => {
      if (!on) return;
      if (error || !data || (data as { locked?: boolean }).locked) return setD("hide");
      setD(data as T);
    });
    return () => { on = false; };
  }, [key, branch, opt]);
  return d;
}

function Seg<T extends string>({ v, set, opts }: { v: T; set: (x: T) => void; opts: [T, string][] }) {
  return (
    <div className="wseg">
      {opts.map(([k, l]) => <button key={k} className={v === k ? "on" : ""} onClick={() => set(k)}>{l}</button>)}
    </div>
  );
}

function Shell({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card w wb">
      <div className="wt"><b>{title}</b>{right && <span className="r">{right}</span>}</div>
      {children}
    </div>
  );
}

function Grid({ cells }: { cells: [string, string | number][] }) {
  return (
    <div className="wgrid" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map(([l, v]) => <div key={l}><div className="v num">{typeof v === "number" ? v.toLocaleString() : v}</div><div className="l">{l}</div></div>)}
    </div>
  );
}

// ───────── 그래프 (막대 · 곡선) ─────────
// 아래 글자는 처음 · 1/3 · 2/3 · 끝 4곳만 (겹치지 않게)
const ticks = (n: number) => (n <= 4 ? [...Array(n).keys()] : [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])]);
const anchor = (i: number, n: number) => (i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle");
function Bars({ data, series }: { data: { x: string }[]; series: { k: string; c: string; l: string }[] }) {
  const W = 232, H = 96, n = data.length || 1;
  const max = Math.max(1, ...data.flatMap((r) => series.map((s) => Number((r as Record<string, unknown>)[s.k] ?? 0))));
  const bw = (W / n) * 0.7 / series.length;
  return (
    <div className="wchart">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="막대그래프">
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
        {data.map((r, i) => series.map((s, j) => {
          const v = Number((r as Record<string, unknown>)[s.k] ?? 0);
          const h = (v / max) * (H - 10);
          const x = (W / n) * i + (W / n) * 0.15 + bw * j;
          return <rect key={`${i}${s.k}`} x={x} y={H - h} width={Math.max(bw - 1, 2)} height={h} rx="1.5" fill={s.c}><title>{`${r.x} ${s.l} ${v.toLocaleString()}`}</title></rect>;
        }))}
        {ticks(n).map((i) => (
          <text key={i} x={i === 0 ? 0 : i === n - 1 ? W : (W / n) * (i + 0.5)} y={H + 12} textAnchor={anchor(i, n)} fontSize="9" fontWeight="600" fill="var(--ink-3)">{data[i].x}</text>
        ))}
      </svg>
      {series.length > 1 && <div className="wleg">{series.map((s) => <span key={s.k}><i style={{ background: s.c }} />{s.l}</span>)}</div>}
    </div>
  );
}

function Line({ data, k }: { data: { x: string }[]; k: string }) {
  const W = 232, H = 96, n = data.length;
  const vals = data.map((r) => Number((r as Record<string, unknown>)[k] ?? 0));
  const max = Math.max(1, ...vals);
  const pt = (v: number, i: number) => [n > 1 ? (W - 8) * (i / (n - 1)) + 4 : W / 2, H - (v / max) * (H - 12)] as const;
  const pts = vals.map(pt);
  // 부드러운 곡선 (가운데 점 기준 베지어)
  const path = pts.map(([x, y], i) => {
    if (i === 0) return `M${x},${y}`;
    const [px, py] = pts[i - 1]; const cx = (px + x) / 2;
    return `C${cx},${py} ${cx},${y} ${x},${y}`;
  }).join(" ");
  return (
    <div className="wchart">
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="곡선그래프">
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--line)" />
        {n > 0 && <path d={`${path} L${pts[n - 1][0]},${H} L${pts[0][0]},${H} Z`} fill="var(--red-50)" />}
        <path d={path} fill="none" stroke="var(--red)" strokeWidth="2" />
        {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" stroke="var(--red)" strokeWidth="1.5"><title>{`${data[i].x} ${won(vals[i])}`}</title></circle>)}
        {ticks(n).map((i) => (
          <text key={i} x={i === 0 ? 0 : i === n - 1 ? W : pts[i][0]} y={H + 12} textAnchor={anchor(i, n)} fontSize="9" fontWeight="600" fill="var(--ink-3)">{data[i].x}</text>
        ))}
      </svg>
    </div>
  );
}

function RankList({ rows, unit }: { rows: { l: string; v: number; n?: number }[]; unit: "won" | "cnt" }) {
  if (!rows.length) return <div className="wnone">아직 기록이 없어요</div>;
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="wrank">
      {rows.map((r, i) => (
        <div key={i} className="wr">
          <span className="no num">{i + 1}</span>
          <span className="nm">{r.l}</span>
          <span className="vv num">{unit === "won" ? man(r.v) : `${r.v}건`}</span>
          <i style={{ width: `${(100 * r.v) / max}%` }} />
        </div>
      ))}
    </div>
  );
}

// ───────── 위젯 ─────────
export function BoardWidget({ k, branch }: { k: WKey; branch: string }) {
  switch (k) {
    case "rsv_status": return <RsvStatus branch={branch} />;
    case "rsv_trend": return <RsvTrend branch={branch} />;
    case "rsv_list": return <RsvList branch={branch} />;
    case "sales_status": return <SalesStatus branch={branch} />;
    case "sales_trend": return <SalesTrend branch={branch} />;
    case "sales_quarter": return <SalesQuarter branch={branch} />;
    case "sales_method": return <SalesMethod branch={branch} />;
    case "sales_staff": case "rank_service": case "rank_goods": case "rank_customer": return <SalesRank k={k} branch={branch} />;
    case "cust_status": return <CustStatus branch={branch} />;
    case "cust_visit": return <CustVisit branch={branch} />;
    case "cust_absent": return <CustAbsent branch={branch} />;
    case "noshow_rank": return <NoshowRank branch={branch} />;
    case "mem_info": return <MemInfo branch={branch} />;
    case "mem_expiring": return <MemExpiring branch={branch} />;
  }
}

function RsvStatus({ branch }: { branch: string }) {
  const [p, setP] = useState<"today" | "tomorrow" | "week" | "month">("today");
  const d = useW<{ rsv: number; cancel: number; noshow: number; new: number; done: number }>("rsv_status", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="예약 현황">
      <Seg v={p} set={setP} opts={[["today", "오늘"], ["tomorrow", "내일"], ["week", "이번 주"], ["month", "이번 달"]]} />
      <Grid cells={d ? [["예약", d.rsv], ["취소", d.cancel], ["노쇼", d.noshow], ["신규", d.new], ["결제 완료", d.done]] : [["예약", "-"], ["취소", "-"], ["노쇼", "-"], ["신규", "-"], ["결제 완료", "-"]]} />
    </Shell>
  );
}

function RsvTrend({ branch }: { branch: string }) {
  const [p, setP] = useState<"day" | "week" | "month">("day");
  const d = useW<{ x: string; rsv: number; done: number; cancel: number }[]>("rsv_trend", branch, p);
  if (d === "hide") return null;
  const sum = d ? d.reduce((a, r) => a + r.rsv, 0) : 0;
  return (
    <Shell title="예약 추이" right={<span className="cap num">합계 {sum.toLocaleString()}건</span>}>
      <Seg v={p} set={setP} opts={[["day", "일간 14일"], ["week", "주간 12주"], ["month", "월간 12개월"]]} />
      {d ? <Bars data={d} series={[{ k: "rsv", c: "var(--ink)", l: "예약" }, { k: "cancel", c: "var(--red-200)", l: "취소·노쇼" }]} /> : <div className="wnone">불러오는 중…</div>}
    </Shell>
  );
}

function RsvList({ branch }: { branch: string }) {
  const [p, setP] = useState<"0" | "1" | "2" | "3">("0");
  const d = useW<{ staff: string; rows: { id: string; time: string; customer: string; program: string; status: string }[] }[]>("rsv_list", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="담당자별 예약 목록">
      <Seg v={p} set={setP} opts={[["0", "오늘"], ["1", "내일"], ["2", "모레"], ["3", "3일 후"]]} />
      {d && d.length === 0 && <div className="wnone">예약이 없어요</div>}
      {d?.map((g) => (
        <div key={g.staff} className="wgrp">
          <div className="gh">{g.staff}<span className="cap num">{g.rows.length}건</span></div>
          {g.rows.map((r) => (
            <div key={r.id} className="wrow"><span className="num t">{r.time.slice(0, 5)}</span><span className="c">{r.customer}</span><span className="p">{r.program}</span></div>
          ))}
        </div>
      ))}
    </Shell>
  );
}

function SalesStatus({ branch }: { branch: string }) {
  const [p, setP] = useState<"today" | "week" | "month" | "lastmonth">("month");
  const d = useW<{ care: number; mem: number; goods: number; etc: number; cash: number; card: number; account: number; npay: number; total: number }>("sales_status", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="매출 현황">
      <Seg v={p} set={setP} opts={[["today", "일간"], ["week", "주간"], ["month", "월간"], ["lastmonth", "지난달"]]} />
      <Grid cells={d ? [["관리", `${d.care}건`], ["회원권", `${d.mem}건`], ["제품", `${d.goods}건`], ["기타", `${d.etc}건`]] : [["관리", "-"], ["회원권", "-"], ["제품", "-"], ["기타", "-"]]} />
      <div className="wsum">
        {([["카드", d?.card], ["현금", d?.cash], ["계좌이체", d?.account], ["NPay", d?.npay]] as const).map(([l, v]) => (
          <div key={l} className="wl">{l}<span className="r num">{v == null ? "-" : won(v)}</span></div>
        ))}
        <div className="wtot">총매출<b className="num">{d ? won(d.total) : "-"}</b></div>
      </div>
    </Shell>
  );
}

function SalesTrend({ branch }: { branch: string }) {
  const [p, setP] = useState<"day" | "week" | "month">("day");
  const d = useW<{ x: string; amount: number }[]>("sales_trend", branch, p);
  if (d === "hide") return null;
  const sum = d ? d.reduce((a, r) => a + r.amount, 0) : 0;
  return (
    <Shell title="매출 추이" right={<span className="cap num">합계 {man(sum)}원</span>}>
      <Seg v={p} set={setP} opts={[["day", "일간 14일"], ["week", "주간 12주"], ["month", "월간 12개월"]]} />
      {d ? <Line data={d} k="amount" /> : <div className="wnone">불러오는 중…</div>}
    </Shell>
  );
}

function SalesQuarter({ branch }: { branch: string }) {
  const d = useW<{ year: number; q: number[] }[]>("sales_quarter", branch, null);
  if (d === "hide") return null;
  const C = ["var(--line-strong)", "var(--ink-4)", "var(--red)"];
  const rows = [1, 2, 3, 4].map((q) => ({ x: `${q}분기`, ...Object.fromEntries((d || []).map((y) => [String(y.year), y.q[q - 1]])) }));
  return (
    <Shell title="분기별 매출 비교">
      {d ? <Bars data={rows} series={d.map((y, i) => ({ k: String(y.year), c: C[i + 3 - d.length] ?? "var(--ink)", l: `${y.year}년` }))} /> : <div className="wnone">불러오는 중…</div>}
    </Shell>
  );
}

function SalesMethod({ branch }: { branch: string }) {
  const [p, setP] = useState<"month" | "lastmonth">("month");
  const d = useW<{ l: string; v: number }[]>("sales_method", branch, p);
  if (d === "hide") return null;
  const tot = d ? d.reduce((a, r) => a + Math.max(r.v, 0), 0) : 0;
  return (
    <Shell title="결제수단별 매출">
      <Seg v={p} set={setP} opts={[["month", "이번 달"], ["lastmonth", "지난달"]]} />
      {d && <div className="wstack">{d.filter((r) => r.v > 0).map((r, i) => <i key={r.l} title={`${r.l} ${won(r.v)}`} style={{ flex: r.v, background: ["var(--ink)", "var(--red)", "var(--ink-4)", "var(--grn)", "var(--amb)"][i % 5] }} />)}</div>}
      {d?.map((r, i) => (
        <div key={r.l} className="wl"><span className="dot" style={{ background: ["var(--ink)", "var(--red)", "var(--ink-4)", "var(--grn)", "var(--amb)"][i % 5] }} />{r.l}
          <span className="r num">{won(r.v)}<span className="cap"> {tot ? Math.round((100 * Math.max(r.v, 0)) / tot) : 0}%</span></span></div>
      ))}
    </Shell>
  );
}

function SalesRank({ k, branch }: { k: "sales_staff" | "rank_service" | "rank_goods" | "rank_customer"; branch: string }) {
  const [p, setP] = useState<"month" | "lastmonth">("month");
  const d = useW<{ l: string; v: number; n: number }[]>(k, branch, p);
  if (d === "hide") return null;
  return (
    <Shell title={BOARD.find((b) => b.k === k)!.l}>
      <Seg v={p} set={setP} opts={[["month", "이번 달"], ["lastmonth", "지난달"]]} />
      {d ? <RankList rows={d} unit="won" /> : <div className="wnone">불러오는 중…</div>}
    </Shell>
  );
}

function CustStatus({ branch }: { branch: string }) {
  const d = useW<{ total: number; valid: number; new_this: number; new_last: number }>("cust_status", branch, null);
  if (d === "hide") return null;
  const row = (l: string, v: number | undefined, hint?: string) => (
    <div className="wl">{l}{hint && <span className="cap" style={{ marginLeft: 4 }}>{hint}</span>}<span className="r num"><b>{v == null ? "-" : v.toLocaleString()}</b>명</span></div>
  );
  return (
    <Shell title="고객 현황" right={<Link href="/customers" className="cap">고객 목록</Link>}>
      {row("전체 고객", d?.total)}
      {row("유효고객", d?.valid, "90일 안 방문·회원권 사용 중")}
      {row("이번 달 신규 방문", d?.new_this)}
      {row("지난달 신규 방문", d?.new_last)}
    </Shell>
  );
}

function CustVisit({ branch }: { branch: string }) {
  const [p, setP] = useState<"yesterday" | "today" | "week" | "month">("today");
  const d = useW<{ new: number; cancel: number; noshow: number; visit: number }>("cust_visit", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="고객 방문 현황">
      <Seg v={p} set={setP} opts={[["yesterday", "어제"], ["today", "오늘"], ["week", "이번 주"], ["month", "이번 달"]]} />
      <Grid cells={d ? [["신규", d.new], ["취소", d.cancel], ["노쇼", d.noshow], ["총 방문", d.visit]] : [["신규", "-"], ["취소", "-"], ["노쇼", "-"], ["총 방문", "-"]]} />
    </Shell>
  );
}

function CustAbsent({ branch }: { branch: string }) {
  const d = useW<{ d15: number; d30: number; d45: number; d60: number }>("cust_absent", branch, null);
  if (d === "hide") return null;
  return (
    <Shell title="미방문 고객 현황" right={<Link href="/customers" className="cap">고객 목록</Link>}>
      <Grid cells={d ? [["15일", d.d15], ["30일", d.d30], ["45일", d.d45], ["60일", d.d60]] : [["15일", "-"], ["30일", "-"], ["45일", "-"], ["60일", "-"]]} />
      <div className="cap" style={{ marginTop: 8 }}>마지막 방문 뒤 지난 날짜</div>
    </Shell>
  );
}

function NoshowRank({ branch }: { branch: string }) {
  const [p, setP] = useState<"month" | "3m" | "all">("3m");
  const d = useW<{ l: string; noshow: number; cancel: number }[]>("noshow_rank", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="노쇼·취소 고객 순위">
      <Seg v={p} set={setP} opts={[["month", "이번 달"], ["3m", "3개월"], ["all", "전체"]]} />
      {d && d.length === 0 && <div className="wnone">노쇼·취소 고객이 없어요</div>}
      {d?.map((r, i) => (
        <div key={i} className="wl"><span className="num" style={{ width: 20, fontWeight: 700 }}>{i + 1}</span>{r.l}
          <span className="r" style={{ display: "flex", gap: 4 }}>{r.noshow > 0 && <span className="bdg amb">노쇼 {r.noshow}</span>}{r.cancel > 0 && <span className="bdg red">취소 {r.cancel}</span>}</span></div>
      ))}
    </Shell>
  );
}

function MemInfo({ branch }: { branch: string }) {
  const d = useW<{ cnt_customers: number; cnt_left: number; period_customers: number }>("mem_info", branch, null);
  if (d === "hide") return null;
  return (
    <Shell title="회원권 정보" right={<Link href="/membership" className="cap">회원권</Link>}>
      <div className="cap" style={{ fontWeight: 700, color: "var(--ink-3)" }}>회차 회원권</div>
      <div className="wl">보유 고객<span className="r num"><b>{d ? d.cnt_customers.toLocaleString() : "-"}</b>명</span></div>
      <div className="wl">남은 회차<span className="r num"><b>{d ? d.cnt_left.toLocaleString() : "-"}</b>회</span></div>
      <div className="cap" style={{ fontWeight: 700, color: "var(--ink-3)", marginTop: 4 }}>기간 회원권</div>
      <div className="wl">보유 고객<span className="r num"><b>{d ? d.period_customers.toLocaleString() : "-"}</b>명</span></div>
    </Shell>
  );
}

function MemExpiring({ branch }: { branch: string }) {
  const [p, setP] = useState<"week" | "month">("week");
  const d = useW<{ customer: string; name: string; kind: string; end_on: string; left_n: number | null; amount_left: number | null }[]>("mem_expiring", branch, p);
  if (d === "hide") return null;
  return (
    <Shell title="만료 예정 회원권" right={<span className="cnt num">{d ? d.length : "-"}</span>}>
      <Seg v={p} set={setP} opts={[["week", "일주일 안"], ["month", "한 달 안"]]} />
      {d && d.length === 0 && <div className="wnone">끝나는 회원권이 없어요</div>}
      {d?.slice(0, 8).map((r, i) => (
        <div key={i} className="wrow">
          <span className="num t">{r.end_on.slice(5).replace("-", ".")}</span>
          <span className="c">{r.customer}</span>
          <span className="p num">{r.kind === "회차" ? `${r.left_n ?? 0}회 남음` : r.amount_left ? man(r.amount_left) : "기간"}</span>
        </div>
      ))}
      {d && d.length > 8 && <Link href="/membership" className="wl" style={{ color: "var(--ink-3)", fontWeight: 600 }}>{d.length - 8}건 더 보기</Link>}
    </Shell>
  );
}
