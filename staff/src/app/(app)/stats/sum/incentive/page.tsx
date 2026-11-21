"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { errText, monthRange, thisMonth, type Col, type Row } from "@/lib/stats";
import { C2_ALL, DataTable, Empty, ExportBtns, StTitle, useFilterReady, useStats, ymLabel, type C2Val } from "../../ui";
import { SumFilter } from "../filter";

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
  const [c2, setC2] = useState<C2Val>(C2_ALL);
  const ready = useFilterReady();
  const money = canSee(me, "sales.others") || canSee(me, "sales.own");

  const load = useCallback(() => {
    const r = monthRange(ym);
    setErr("");
    if (ready === null) return;
    const args: Record<string, unknown> = { p_branch: br, p_from: r.from, p_to: r.to };
    if (ready) { args.p_progs = c2.progs; args.p_groups = c2.groups; }
    sb.rpc("stats_incentive", args).then(({ data, error }) => {
      if (error) { setErr(errText(error)); setD(null); return; }
      setD(data as Inc);
    });
  }, [br, ym, c2.progs, c2.groups, ready]);
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
  const rows = (d?.rows ?? []).filter((r) => c2.staff === null || c2.staff.includes(String(r.staff)));
  const q = { ...monthRange(ym), label: ymLabel(ym), staff: c2.staff, items: ["amount"], kinds: null, q: "", progs: c2.progs, groups: c2.groups };
  return (
    <>
      {!closed && <div className="st-warn st3-warn">{+ym.slice(5, 7)}월 마감 전에는 미리보기예요. 요율이 바뀌면 이 숫자도 바뀌어요.</div>}
      <StTitle title="인센티브" meta={`${br} · ${+ym.slice(5, 7)}월`} />
      <SumFilter query={q} ready={ready} compact monthOnly help={`${+ym.slice(5, 7)}월 · ${br} · 조회됨`}
        onApply={(n) => { setYm(n.from.slice(0, 7)); setC2({ staff: n.staff, progs: n.progs, groups: n.groups }); }}
        right={<>
          {d?.can_edit && !edit && <button className="btn st-noprint" onClick={openEdit}>요율 설정</button>}
          {d && <ExportBtns name={`인센티브_${br}_${ymLabel(ym)}`} cols={COLS} rows={rows} disabled={!rows.length} />}
        </>} />

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
        : !rows.length ? <Empty text="보여 줄 직원이 없어요" sub="설정 > 직원에서 직원을 등록하면 여기에 나와요." />
        : <DataTable cols={COLS} rows={rows} noSum={["rate"]} />}
      <p className="st3-note">매출 인센티브 = 매출 × 요율, 관리 수당 = 관리 횟수 × 1회 수당이에요. 요율은 대표관리자가 정해요. 관리자·직원은 자기 몫만 봐요.</p>
    </>
  );
}
