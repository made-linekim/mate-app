"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { errText, fmt, type Col, type Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, Info, useStats } from "../../ui";

type Remain = {
  kpi: { customers: number; left: number; amount: number | null; soon: number };
  products: Row[]; customers: Row[]; managers: string[]; money: boolean; branch: string;
};
const SHOW = 30;

export default function RemainMembership() {
  const { branch } = useStats();
  const [mgr, setMgr] = useState("");
  const [d, setD] = useState<Remain | null>(null);
  const [err, setErr] = useState("");
  const [onlySoon, setOnlySoon] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let live = true;
    setErr("");
    sb.rpc("stats_remain", { p_branch: branch, p_manager: mgr || null }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setErr(errText(error)); setD(null); return; }
      setD(data as Remain);
    });
    return () => { live = false; };
  }, [branch, mgr]);

  const pCols: Col[] = [["name", "회원권", "text"], ["holders", "보유", "num"], ["left", "남은 회차", "num"],
    ...(d?.money ? ([["unit", "단가", "won"], ["amount", "남은 금액", "won"]] as Col[]) : [])];
  const cCols: Col[] = [["name", "고객", "text"], ["manager", "담당", "text"], ["membership", "회원권", "text"], ["remain", "잔여 / 만료일", "text"],
    ...(d?.money ? ([["amount", "남은 금액", "won"]] as Col[]) : []), ["status", "상태", "text"]];
  const cust = (d?.customers ?? []).filter((c) => !onlySoon || c.status === "임박").map((c) => ({
    ...c, remain: `${c.left != null ? `잔여 ${c.left}회` : "기간권"}${c.end_on ? ` / ${String(c.end_on).slice(2).replace(/-/g, ".")}` : ""}`,
  }));

  return (
    <>
      <div className="st-dhead">
        <h2>잔여 회원권</h2>
        <span className="st-meta">{d?.branch ?? branch ?? "전 지점"} · 지금 기준</span>
        <Info text={`쓰고 있는 회원권만 모았어요. 남은 회차가 2회 이하이거나 만료가 2주 안이면 '임박'이에요.${d && !d.money ? " 매출 권한이 없어서 금액은 빠져 있어요." : " 남은 금액은 남은 회차 × 단가예요. 옛 시스템에서 옮긴 회원권은 단가가 비어 있으면 0으로 보여요."}`} />
        <div className="st-sp" />
        <select className="sel st-sel st-noprint" aria-label="담당" value={mgr} onChange={(e) => setMgr(e.target.value)}>
          <option value="">담당 전체</option>
          {(d?.managers ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {d && <ExportBtns name={`잔여회원권_${d.branch}`} cols={cCols} rows={cust} disabled={!cust.length} />}
      </div>

      {err ? <Empty text={err} /> : !d ? <div className="st-skel">불러오는 중…</div> : (
        <>
          <div className="st-kpis">
            <div className="st-kpi"><b>{fmt(d.kpi.customers, "num")}<small>명</small></b><span>보유 고객</span></div>
            <div className="st-kpi"><b>{fmt(d.kpi.left, "num")}<small>회</small></b><span>남은 회차</span></div>
            {d.money
              ? <div className="st-kpi"><b>{fmt(d.kpi.amount, "won")}<small>원</small></b><span>남은 금액 합</span></div>
              : null}
            <button className={`st-kpi st-kpi-btn ${onlySoon ? "on" : ""}`} onClick={() => setOnlySoon(!onlySoon)} aria-pressed={onlySoon}>
              <b className={d.kpi.soon ? "warn" : ""}>{fmt(d.kpi.soon, "num")}<small>건</small></b><span>임박 {onlySoon ? "· 보는 중" : "· 눌러서 보기"}</span>
            </button>
          </div>

          {!d.products.length ? <Empty text="쓰고 있는 회원권이 없어요" sub="회원권을 팔거나 옛 시스템 회원권을 옮기면 여기에 모여요." /> : (
            <>
              <h3 className="st-h3">회원권별 요약</h3>
              <DataTable cols={pCols} rows={d.products} noSum={["unit"]} />
              <h3 className="st-h3">고객별 <span className="st-muted">{cust.length}건</span></h3>
              <DataTable cols={cCols} rows={more ? cust : cust.slice(0, SHOW)} total={false} />
              {cust.length > SHOW && !more && <button className="btn st-more" onClick={() => setMore(true)}>나머지 {cust.length - SHOW}건 보기</button>}
            </>
          )}
        </>
      )}
    </>
  );
}
