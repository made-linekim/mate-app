"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { errText, fmt, type Col, type Row } from "@/lib/stats";
import { C2Card, C2_ALL, DataTable, Empty, ExportBtns, Info, Pop, StTitle, useStats, type C2Val } from "../../ui";

type Remain = {
  kpi: { customers: number; left: number; amount: number | null; soon: number; points?: number | null };
  products: Row[]; customers: Row[]; managers: string[]; money: boolean; branch: string;
};
const SHOW = 30;

export default function RemainMembership() {
  const { branch } = useStats();
  const me = useMe();
  const own = me.tier === "staff";
  const [mgr, setMgr] = useState(own ? me.name : "");
  const [d, setD] = useState<Remain | null>(null);
  const [err, setErr] = useState("");
  const [onlySoon, setOnlySoon] = useState(false);
  const [more, setMore] = useState(false);
  const [c2, setC2] = useState<C2Val>(C2_ALL);
  const [hide, setHide] = useState<string[]>(["amount"]); // 시안: 고객별 표는 남은 금액 없이 (열 고르기로 켜요)
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setErr("");
    sb.rpc("stats_remain", { p_branch: branch, p_manager: mgr || null }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setErr(errText(error)); setD(null); return; }
      setD(data as Remain);
    });
    return () => { live = false; };
  }, [branch, mgr, tick]);

  // C2: 직원 = 담당, 관리 = 회원권 이름에 관리 이름이 들어간 것
  const progOk = (name: unknown) => c2.progs === null || c2.progs.some((g) => String(name ?? "").includes(g));
  const staffOk = (m: unknown) => c2.staff === null || c2.staff.includes(String(m ?? ""));
  const pCols: Col[] = [["name", "회원권", "text"], ["holders", "보유", "num"], ["left", "남은 회차", "num"],
    ...(d?.money ? ([["unit", "단가", "won"], ["amount", "남은 금액", "won"]] as Col[]) : [])];
  const allC: Col[] = [["name", "고객", "text"], ["manager", "담당", "text"], ["point", "포인트", "won"], ["membership", "회원권", "text"], ["remain", "잔여 / 만료일", "text"],
    ...(d?.money ? ([["amount", "남은 금액", "won"]] as Col[]) : []), ["status", "상태", "text"]];
  const cCols = allC.filter((c) => !hide.includes(c[0]));
  const cust: Row[] = (d?.customers ?? []).filter((c) => (!onlySoon || c.status === "임박") && staffOk(c.manager) && progOk(c.membership)).map((c) => ({
    ...c, remain: `${c.left != null ? `잔여 ${c.left}회` : "기간권"}${c.end_on ? ` / ${String(c.end_on).slice(5).replace(/-/g, ".")}` : ""}`,
  }));
  const prods = (d?.products ?? []).filter((p) => progOk(p.name));
  const filtered = c2.staff !== null || c2.progs !== null;
  const kpi = d && (filtered ? {
    customers: new Set(cust.map((c) => c.name)).size, left: cust.reduce((a, c) => a + Number(c.left ?? 0), 0),
    amount: cust.reduce((a, c) => a + Number(c.amount ?? 0), 0), points: cust.reduce((a, c) => a + Number(c.point ?? 0), 0),
  } : { ...d.kpi, points: d.kpi.points ?? null });
  const soon = (d?.customers ?? []).filter((c) => c.status === "임박" && staffOk(c.manager) && progOk(c.membership)).length;

  return (
    <>
      <StTitle title="잔여 회원권" meta={`${d?.branch ?? branch ?? "전 지점"} · 전체 집계`} />
      <div className="st3-bar st-noprint">
        <span className="st3-help">{d?.branch ?? branch ?? "전 지점"} · 전체</span>
        {own ? <span className="btn st3-box st3-static">담당 {me.name}</span> : (
          <select className="sel st3-ym st3-s32" aria-label="담당" value={mgr} onChange={(e) => setMgr(e.target.value)}>
            <option value="">담당 전체</option>
            {(d?.managers ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <button className="btn p st3-go" onClick={() => setTick((t) => t + 1)}>조회</button>
        <Info text={`쓰고 있는 회원권만 모았어요. 남은 회차가 2회 이하이거나 만료가 2주 안이면 '임박'이에요.${d && !d.money ? " 매출 권한이 없어서 금액은 빠져 있어요." : " 남은 금액은 남은 회차 × 단가예요."}`} />
        <div className="st-sp" />
        <Pop label="열 고르기">
          <div className="st3-pop-list">
            <b>고객별 표에 보일 칸</b>
            {allC.slice(1).map(([k, l]) => (
              <label key={k} className="ck"><input type="checkbox" checked={!hide.includes(k)} onChange={() => setHide(hide.includes(k) ? hide.filter((x) => x !== k) : [...hide, k])} />{l}</label>
            ))}
          </div>
        </Pop>
        {d && <ExportBtns name={`잔여회원권_${d.branch}`} cols={cCols} rows={cust} disabled={!cust.length} />}
      </div>
      <C2Card value={c2} onGo={setC2} ready />

      {err ? <Empty text={err} /> : !d || !kpi ? <div className="st-skel">불러오는 중…</div> : (
        <>
          <div className="st-kpis">
            <div className="st-kpi"><b>{fmt(kpi.customers, "num")}</b><span>보유 고객</span></div>
            <div className="st-kpi"><b>{fmt(kpi.left, "num")}회</b><span>남은 회차</span></div>
            {d.money && <div className="st-kpi"><b>{fmt(kpi.amount, "won")}</b><span>남은 금액 합</span></div>}
            <div className="st-kpi"><b>{kpi.points == null ? "—" : fmt(kpi.points, "won")}</b><span>포인트{kpi.points == null ? " · DB 기록 없음" : ""}</span></div>
          </div>

          {!prods.length ? <Empty text="쓰고 있는 회원권이 없어요" sub="회원권을 팔거나 옛 시스템 회원권을 옮기면 여기에 모여요." /> : (
            <>
              <h3 className="st-h3">회원권별 요약</h3>
              <DataTable cols={pCols} rows={prods} noSum={["unit"]} />
              <h3 className="st-h3">고객별
                <button className={`st3-chip ${onlySoon ? "on" : ""}`} aria-pressed={onlySoon} onClick={() => setOnlySoon(!onlySoon)}>임박만 {soon}건</button>
              </h3>
              <DataTable cols={cCols} rows={more ? cust : cust.slice(0, SHOW)} total={false} />
              {cust.length > SHOW && !more && <button className="btn st-more" onClick={() => setMore(true)}>나머지 {cust.length - SHOW}건 보기</button>}
            </>
          )}
        </>
      )}
    </>
  );
}
