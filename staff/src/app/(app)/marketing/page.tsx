"use client";
import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/me";
import { TIER_LABEL, type Tier } from "@/lib/sb";
import { Head, Info, Blocked, Modal, JobRow, useMk, useRpc, rpc, periodRange, periodText, periodShort, man, n0, pct, when, canBudget, canEdit, type Job } from "./ui";

/* 시안 U-PC-MKT-1 광고 */
type Row = { channel: string; connected: boolean; live: number; spend: number; month_spend: number; budget: number | null; imp: number | null; inflow: number; reserve: number; reg: number; manual: boolean };
type Ads = { rows: Row[]; cap_total: number | null; jobs: Job[] | null; fails: number; log: { at: string; by: string; tier: Tier; body: string }[] | null };

export default function AdsPage() {
  const me = useMe();
  const { branch, period, toast } = useMk();
  const r = periodRange(period);
  const { data, err, reload } = useRpc<Ads>("mkt_ads", { p_branch: branch, p_from: r.from, p_to: r.to });
  const [budget, setBudget] = useState<Row | null>(null);
  const [off, setOff] = useState<Row | null>(null);
  const [manual, setManual] = useState<Row | null>(null);
  const owner = canBudget(me);

  const rows = data?.rows ?? [];
  const spend = rows.reduce((a, x) => a + x.spend, 0);
  const inflow = rows.reduce((a, x) => a + x.inflow, 0);
  const reserve = rows.reduce((a, x) => a + x.reserve, 0);
  const reg = rows.reduce((a, x) => a + x.reg, 0);

  return (
    <>
      <Head title="광고" meta={periodText(period)} />
      <Info>광고비 바꾸기와 끄기는 대표관리자만 할 수 있습니다. 관리자·직원은 보기만 하고, 당근처럼 API가 없는 채널은 관리자가 직접 입력합니다.</Info>
      {err ? <Blocked err={err} /> : (
        <>
          <div className="mk-kpis">
            <div className="mk-kpi"><span className="l">광고비</span><span className="v">{man(spend)}</span><span className="s">{periodShort(period)} · {branch}</span></div>
            <div className="mk-kpi"><span className="l">유입</span><span className="v">{n0(inflow)}</span><span className="s">클릭·문의 합</span></div>
            <div className="mk-kpi"><span className="l">예약 전환</span><span className="v">{pct(reserve, inflow)}</span><span className="s">유입 대비 예약 {reserve}건</span></div>
            <div className="mk-kpi"><span className="l">등록당 비용</span><span className="v">{reg ? man(Math.round(spend / reg)) : "—"}</span><span className="s">{reg ? `등록 ${reg}건 기준` : "등록 자료 없음"}</span></div>
          </div>

          <div className="mk-sec">
            <h2>채널별 현황</h2>
            <span className="meta" style={{ marginLeft: "auto" }}>연결 상태는 보이지만 키 값은 보이지 않습니다.</span>
          </div>
          <div className="mk-card">
            <table className="mk-t">
              <thead><tr><th>채널</th><th>연결</th><th className="r">광고비</th><th className="r">노출</th><th className="r">유입</th><th className="r">예약</th><th className="r">등록</th><th>진행</th></tr></thead>
              <tbody>
                {!data && <tr><td colSpan={8} className="mk-empty">불러오는 중…</td></tr>}
                {rows.map((x) => (
                  <tr key={x.channel}>
                    <td className="nm">{x.channel}</td>
                    <td>{x.connected ? <span className="badge ok">연결됨</span> : <span className="badge">직접 입력</span>}</td>
                    <td className="r key">
                      <span className="money">
                        <span>{n0(x.spend)}{x.budget != null && <span className="sub">월 예산 {man(x.budget)}</span>}</span>
                        {owner && <button className="btn sm mk-pc-only" onClick={() => setBudget(x)}>바꾸기</button>}
                      </span>
                    </td>
                    <td className="r">{x.imp == null ? <span className="z">—</span> : n0(x.imp)}</td>
                    <td className="r">{n0(x.inflow)}</td>
                    <td className="r">{n0(x.reserve)}</td>
                    <td className="r">{n0(x.reg)}</td>
                    <td className="full">
                      <span className="btns">
                        {x.connected
                          ? (x.live > 0 ? <span className="badge ok">진행</span> : <span className="badge">꺼짐</span>)
                          : (x.manual ? <span className="badge ok">입력됨</span> : <span className="badge">입력 없음</span>)}
                        {owner && <button className="btn sm mk-mobile-only" onClick={() => setBudget(x)}>광고비 바꾸기</button>}
                        {owner && x.connected && x.live > 0 && <button className="btn sm" onClick={() => setOff(x)}>끄기</button>}
                        {!x.connected && canEdit(me) && <button className="btn sm" onClick={() => setManual(x)}>직접 입력</button>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.cap_total ? (
            <p style={{ margin: "10px 2px 0", fontSize: "var(--fs-md)", color: "var(--ink-3)" }}>
              이번 달 광고비 {man(rows.reduce((a, x) => a + x.month_spend, 0))} / 월 상한 {man(data.cap_total)} (메타·당근·네이버, 두 지점 합)
            </p>
          ) : null}

          <div className="mk-routine">
            <div className="hd">수집 루틴 상태</div>
            {(data?.jobs ?? []).map((j) => <JobRow key={j.job} j={j} />)}
            <div className="row"><b>실패 기록</b><span className={data?.fails ? "bad" : ""}>{data?.fails ? `최근 7일 실패 ${data.fails}건` : "최근 7일 실패 없음"}</span><span /></div>
            <div className="foot">연결 키는 이 화면에 보이지 않습니다. <b>설정</b>에서 대표관리자가 관리합니다.</div>
            <div className="mk-log">
              <div className="lh"><b>변경 기록</b><span>최근 변경 · 직급을 함께 남깁니다</span></div>
              <div className="mk-card">
                <table className="mk-t">
                  <thead><tr><th>시각</th><th>변경한 사람</th><th>직급</th><th>내용</th></tr></thead>
                  <tbody>
                    {(data?.log ?? []).length === 0 && <tr><td colSpan={4} className="mk-empty">아직 변경 기록이 없습니다</td></tr>}
                    {(data?.log ?? []).map((l, i) => (
                      <tr key={i}><td className="hm">{when(l.at)}</td><td className="nm">{l.by}</td><td className="key">{TIER_LABEL[l.tier] ?? l.tier}</td><td className="full" style={{ whiteSpace: "normal" }}>{l.body}<span className="sub mk-mobile-only">{when(l.at)}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {budget && <BudgetModal row={budget} branch={branch} onClose={() => setBudget(null)} onDone={() => { setBudget(null); toast("월 광고비를 바꿨어요"); reload(); }} />}
      {off && (
        <OffModal row={off} onClose={() => setOff(null)} onDone={async () => {
          try { await rpc("mkt_ad_off_request", { p_branch: branch, p_channel: off.channel }); toast("끄기 요청을 기록했어요"); reload(); }
          catch (e) { toast((e as Error).message); }
          setOff(null);
        }} />
      )}
      {manual && <ManualModal row={manual} branch={branch} from={r.from} onClose={() => setManual(null)} onDone={() => { setManual(null); toast("저장했어요"); reload(); }} />}
    </>
  );
}

function BudgetModal({ row, branch, onClose, onDone }: { row: Row; branch: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(String(row.budget ?? ""));
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = Number(v.replace(/\D/g, "") || 0);
  return (
    <Modal title={`${row.channel} 월 광고비 바꾸기`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={busy || !v} onClick={async () => {
        setBusy(true);
        try { await rpc("mkt_budget_set", { p_branch: branch, p_channel: row.channel, p_monthly: num }); onDone(); }
        catch (x) { setE((x as Error).message); setBusy(false); }
      }}>바꾸기</button>
    </>}>
      <p className="d">지금 {row.budget != null ? `${row.budget.toLocaleString()}원` : "정한 예산 없음"} → <b>{num.toLocaleString()}원</b></p>
      <div className="grid">
        <label htmlFor="bud">월 광고비</label>
        <input id="bud" className="inp" inputMode="numeric" value={v ? num.toLocaleString() : ""} onChange={(x) => setV(x.target.value)} placeholder="예: 500,000" autoFocus />
      </div>
      <p className="h">이번 달 지금까지 {row.month_spend.toLocaleString()}원을 썼습니다. 바꾸면 변경 기록에 이름·직급이 남습니다. {branch}</p>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}

function OffModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const url = row.channel === "메타" ? "https://adsmanager.facebook.com/" : "https://searchad.naver.com/";
  return (
    <Modal title={`${row.channel} 광고를 끌까요?`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <a className="btn" href={url} target="_blank" rel="noreferrer">광고 관리자 열기</a>
      <button className="btn p" onClick={onDone}>끄기 요청 기록</button>
    </>}>
      <p className="d">켜진 광고 {row.live}개 · 이번 기간 광고비 {row.spend.toLocaleString()}원</p>
      <p className="h">광고를 실제로 끄는 일은 아직 {row.channel} 광고 관리자에서 합니다. 여기서는 누가 언제 끄라고 했는지 기록을 남기고, 다음 날 수집에서 꺼짐으로 바뀝니다.</p>
    </Modal>
  );
}

function ManualModal({ row, branch, from, onClose, onDone }: { row: Row; branch: string; from: string; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ spend: "", inflow: "", reserve: "", reg: "" });
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toN = (s: string) => Number(s.replace(/\D/g, "") || 0);
  const F = (k: keyof typeof f, l: string, dis = false) => (
    <><label htmlFor={`m-${k}`}>{l}</label><input id={`m-${k}`} className="inp" inputMode="numeric" disabled={dis} value={f[k]} onChange={(x) => setF({ ...f, [k]: x.target.value })} placeholder={dis ? "대표관리자만" : "0"} /></>
  );
  return (
    <Modal title={`${row.channel} 직접 입력`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={busy} onClick={async () => {
        setBusy(true);
        try {
          await rpc("mkt_manual_set", { p_branch: branch, p_week: from, p_channel: row.channel, p_spend: toN(f.spend), p_inflow: toN(f.inflow), p_reserve: toN(f.reserve), p_reg: toN(f.reg) });
          onDone();
        } catch (x) { setE((x as Error).message); setBusy(false); }
      }}>저장</button>
    </>}>
      <p className="h">{branch} · {from.slice(5).replace("-", ".")} 시작 주. 당근 비즈센터 숫자를 그대로 옮겨 적어 주세요.</p>
      <div className="grid">
        {F("spend", "광고비(원)", !canBudget(me))}
        {F("inflow", "유입(클릭)")}
        {F("reserve", "예약")}
        {F("reg", "등록")}
      </div>
      {e && <p className="err">{e}</p>}
      <p className="h" style={{ marginTop: 12 }}>당근 연결은 <Link href="/settings" style={{ textDecoration: "underline" }}>설정</Link>에서 대표관리자가 할 수 있습니다.</p>
    </Modal>
  );
}
