"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import {
  EMPTY_MSG, errText, hasData, monthRange, reportOf, thisMonth, thisYear, yearRange, dot, type ReportData,
} from "@/lib/stats";
import { useMe } from "@/lib/me";
import { BarChart, BranchSelect, C2Card, C2_ALL, DataTable, Empty, ExportBtns, Info, Pop, StTitle, c2Label, monthOptions, useFilterReady, useStats, yearOptions, ymLabel, type C2Val } from "../../ui";

type RangeMode = "month" | "year" | "custom";

export default function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const def = reportOf(id);
  const { branch } = useStats();
  const t = todayKST();
  const [year, setYear] = useState(thisYear());
  const [rmode, setRmode] = useState<RangeMode>(def?.defRange === "year" ? "year" : "month");
  const [ym, setYm] = useState(thisMonth());
  const [from, setFrom] = useState(`${t.slice(0, 8)}01`);
  const [to, setTo] = useState(t);
  const [data, setData] = useState<ReportData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [c2, setC2] = useState<C2Val>(C2_ALL);
  const [tick, setTick] = useState(0);
  const ready = useFilterReady();
  const me = useMe();

  // 지금 고른 기간
  const lastM = year === thisYear() ? +thisMonth().slice(5, 7) : 12;
  let p = yearRange(year), label = `${year}.01 – ${year}.${String(lastM).padStart(2, "0")}`;
  if (def?.period === "range") {
    if (rmode === "month") { p = monthRange(ym); label = ymLabel(ym); }
    else if (rmode === "year") { p = yearRange(year); label = `${year}년`; }
    else { p = { from, to }; label = `${dot(from)} ~ ${dot(to)}`; }
  } else if (def?.period === "last12") { p = monthRange(ym); label = `${ymLabel(ym)}까지 1년`; }
  else if (def?.period === "now") { p = { from: t, to: t }; label = "오늘 기준"; }
  if (def?.id === "sales_year" || def?.id === "cust_new") label = `${year - 2}~${year}년`;

  useEffect(() => {
    if (!def) return;
    let live = true;
    setBusy(true); setErr("");
    const opts = ready && def.pay ? { staff: c2.staff, progs: c2.progs, groups: c2.groups } : {};
    sb.rpc("stats_report", { p_id: def.id, p_branch: branch, p_from: p.from, p_to: p.to, p_opts: opts }).then(({ data, error }) => {
      if (!live) return;
      setBusy(false);
      if (error) { setErr(errText(error)); setData(null); return; }
      setData(data as ReportData);
    });
    return () => { live = false; };
  }, [def, branch, p.from, p.to, c2, ready, tick]);

  if (!def) return <Empty text="없는 리포트예요" sub="리포트 목록에서 다시 골라 주세요." />;
  const ok = hasData(data);
  const unit = data?.chart ? (data.cols.find((c) => c[0] === data.chart!.bars[0])?.[2] ?? "num") : "num";
  const rankLike = def.id.endsWith("_top") || def.id === "visit_rank" || def.id === "cust_rank";
  const metaBranch = data?.branch ?? (branch || "전 지점");

  return (
    <>
      <StTitle back title={def.title} meta={`${metaBranch} · ${def.span}`} />

      <div className="st3-bar st-noprint">
        <span className="st3-l">기간</span>
        <Pop label={label} cls="st3-period">
          <div className="st-filter">
            {def.period === "now" && <span className="st-muted">지금 기준으로 봐요</span>}
            {(def.period === "year") && (
              <select className="sel st-sel" aria-label="연도" value={year} onChange={(e) => setYear(+e.target.value)}>
                {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
            )}
            {def.period === "range" && (
              <>
                <div className="seg" role="tablist" aria-label="기간">
                  {([["month", "월"], ["year", "연도"], ["custom", "기간"]] as const).map(([k, l]) => (
                    <button key={k} className={rmode === k ? "on" : ""} aria-selected={rmode === k} role="tab" onClick={() => setRmode(k)}>{l}</button>
                  ))}
                </div>
                {rmode === "month" && (
                  <select className="sel st-sel" aria-label="월" value={ym} onChange={(e) => setYm(e.target.value)}>
                    {monthOptions().map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
                  </select>
                )}
                {rmode === "year" && (
                  <select className="sel st-sel" aria-label="연도" value={year} onChange={(e) => setYear(+e.target.value)}>
                    {yearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
                  </select>
                )}
                {rmode === "custom" && (
                  <span className="st-range">
                    <input className="inp" type="date" aria-label="시작일" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
                    <span>~</span>
                    <input className="inp" type="date" aria-label="종료일" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
                  </span>
                )}
              </>
            )}
            {def.period === "last12" && (
              <select className="sel st-sel" aria-label="기준 월" value={ym} onChange={(e) => setYm(e.target.value)}>
                {monthOptions().map((m) => <option key={m} value={m}>{ymLabel(m)}까지</option>)}
              </select>
            )}
          </div>
        </Pop>
        <span className="st3-l">지점</span>
        {me.tier === "owner" ? <BranchSelect /> : <span className="btn st3-box st3-static">{me.branch}</span>}
        {def.pay && (
          <>
            <span className="st3-l">직원</span>
            <span className="btn st3-box st3-static">{me.tier === "staff" ? "나 (본인)" : c2Label(c2.staff)}</span>
            <span className="st3-l">구분</span>
            <span className="btn st3-box st3-static">{c2Label(c2.groups)}</span>
          </>
        )}
        <Info text={`${def.desc}.${data?.note ? ` ${data.note}` : ""}${data && !data.money && def.money ? " 매출 권한이 없어서 금액 칸은 빠져 있어요." : ""}${def.pay ? "" : " 이 리포트는 결제 기록이 아니라서 직원·관리·구분 조건은 없어요."}`} />
        <div className="st-sp" />
        <button className="btn p st3-go" onClick={() => setTick((t) => t + 1)}>조회</button>
        {data && <ExportBtns name={`${def.title}_${metaBranch}_${label}`} cols={data.cols} rows={data.rows} disabled={!ok} />}
      </div>
      {def.pay && <C2Card value={c2} onGo={setC2} ready={ready} />}

      {err ? <Empty text={err} />
        : !data ? <div className="st-skel" aria-busy="true">불러오는 중…</div>
        : !ok ? <Empty text={`${label}에는 보여 줄 숫자가 없어요`} sub={EMPTY_MSG[def.empty]} />
        : (
          <div className={busy ? "st-busy" : ""}>
            {data.chart && !rankLike && (
              <div className="card st-chart-card">
                <BarChart rows={data.rows} x={data.chart.x} bars={data.chart.bars} names={data.chart.names} unit={unit} />
              </div>
            )}
            {rankLike
              ? <DataTable cols={data.cols.filter((c) => c[0] !== "rank")} rows={data.rows.map((r) => ({ ...r, label: `${r.rank} ${r.label}` }))} total={false} />
              : <DataTable cols={data.cols} rows={data.rows} />}
          </div>
        )}
    </>
  );
}
