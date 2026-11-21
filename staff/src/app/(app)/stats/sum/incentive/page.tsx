"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { errText, monthRange, thisMonth, type Col, type Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, Info, monthOptions, useStats, ymLabel } from "../../ui";

type Inc = { rows: Row[]; branch: string; can_edit: boolean; rates: Record<string, { rate?: number; per?: number }> | null };
const COLS: Col[] = [
  ["staff", "직원", "text"], ["title", "직무", "text"], ["sales", "매출", "won"], ["rate", "요율", "pct"], ["inc", "매출 인센티브", "won"],
  ["svc", "관리 횟수", "num"], ["allow", "관리 수당", "won"], ["total", "합계", "won"],
];

export default function Incentive() {
  const me = useMe();
  const { branch } = useStats();
  const br = branch ?? me.branch; // 인센티브는 지점마다 따로 (전 지점이면 내 지점)
  const [ym, setYm] = useState(thisMonth());
  const [d, setD] = useState<Inc | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Record<string, { rate: string; per: string }> | null>(null);
  const [saving, setSaving] = useState(false);
  const money = canSee(me, "sales.others") || canSee(me, "sales.own");

  const load = useCallback(() => {
    const r = monthRange(ym);
    setErr("");
    sb.rpc("stats_incentive", { p_branch: br, p_from: r.from, p_to: r.to }).then(({ data, error }) => {
      if (error) { setErr(errText(error)); setD(null); return; }
      setD(data as Inc);
    });
  }, [br, ym]);
  useEffect(() => { load(); }, [load]);

  function openEdit() {
    if (!d) return;
    const e: Record<string, { rate: string; per: string }> = {};
    d.rows.forEach((r) => { const n = String(r.staff); e[n] = { rate: String(r.rate ?? 0), per: String(r.per ?? 0) }; });
    setEdit(e);
  }
  async function save() {
    if (!edit) return;
    setSaving(true);
    const v: Record<string, { rate: number; per: number }> = {};
    Object.entries(edit).forEach(([n, x]) => { v[n] = { rate: Math.max(0, Math.min(100, Number(x.rate) || 0)), per: Math.max(0, Math.round(Number(x.per) || 0)) }; });
    const { error } = await sb.rpc("stats_incentive_save", { p_branch: br, p_rates: v });
    setSaving(false);
    if (error) { setErr(errText(error)); return; }
    setEdit(null); load();
  }

  const closed = ym < thisMonth();
  if (!money) return <Empty text="인센티브는 매출 권한이 있는 직원에게만 보여요" sub="대표관리자에게 '본인 매출 보기' 권한을 요청해 주세요." />;
  return (
    <>
      <div className="st-dhead">
        <h2>인센티브</h2>
        <span className="st-meta">{br} · {ymLabel(ym)}</span>
        <Info text="매출 인센티브 = 매출 × 요율, 관리 수당 = 관리 횟수 × 1회 수당이에요. 요율은 대표관리자가 '요율 설정'에서 정해요. 관리자·직원은 자기 몫만 봐요." />
        <div className="st-sp" />
        <select className="sel st-sel st-noprint" aria-label="월" value={ym} onChange={(e) => setYm(e.target.value)}>
          {monthOptions().map((m) => <option key={m} value={m}>{ymLabel(m)}</option>)}
        </select>
        {d?.can_edit && !edit && <button className="btn sm st-noprint" onClick={openEdit}>요율 설정</button>}
        {d && <ExportBtns name={`인센티브_${br}_${ymLabel(ym)}`} cols={COLS} rows={d.rows} disabled={!d.rows.length} />}
      </div>
      {!closed && <div className="st-warn">{+ym.slice(5, 7)}월 마감 전이라 미리보기예요. 매출이나 요율이 바뀌면 숫자도 바뀌어요.</div>}

      {edit && (
        <div className="card st-edit">
          <div className="st-edit-hd"><b>요율 설정 · {br}</b><span className="st-muted">오늘부터 적용돼요</span></div>
          <div className="st-edit-list">
            {Object.entries(edit).map(([n, x]) => (
              <div key={n} className="st-edit-row">
                <span className="nm">{n}</span>
                <label><span>요율</span><input className="inp" inputMode="decimal" value={x.rate} onChange={(e) => setEdit({ ...edit, [n]: { ...x, rate: e.target.value } })} /><em>%</em></label>
                <label><span>1회 수당</span><input className="inp" inputMode="numeric" value={x.per} onChange={(e) => setEdit({ ...edit, [n]: { ...x, per: e.target.value.replace(/\D/g, "") } })} /><em>원</em></label>
              </div>
            ))}
            {!Object.keys(edit).length && <p className="st-muted">이 지점에 등록된 직원이 없어요. 설정 &gt; 직원에서 먼저 등록해 주세요.</p>}
          </div>
          <div className="st-cond-go">
            <button className="btn" onClick={() => setEdit(null)}>취소</button>
            <button className="btn p" disabled={saving} onClick={save}>{saving ? "저장 중" : "저장"}</button>
          </div>
        </div>
      )}

      {err ? <Empty text={err} />
        : !d ? <div className="st-skel">불러오는 중…</div>
        : !d.rows.length ? <Empty text="보여 줄 직원이 없어요" sub="설정 > 직원에서 직원을 등록하면 여기에 나와요." />
        : <DataTable cols={COLS} rows={d.rows} />}
    </>
  );
}
