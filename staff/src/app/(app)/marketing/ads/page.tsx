"use client";
import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/me";
import { TIER_LABEL, type Tier } from "@/lib/sb";
import { Head, Info, Blocked, Modal, Collect, useMk, useRpc, rpc, periodRange, periodText, periodShort, man, n0, pct, when, canBudget, canEdit, type Job } from "../ui";

/* 시안 v3b U-PC-MKT-1 광고 (+ 권한잠금 · 끄기확인 · 바꾸기확인) */
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
    <div className="mx-ads">
      <Head title="광고" meta={periodText(period)} />
      <Info>{owner
        ? "광고비 변경과 끄기는 대표관리자만 할 수 있습니다. 바꾸면 변경 기록에 이름과 직급이 남습니다. 관리자·직원은 보기만 합니다."
        : "광고비 변경과 끄기는 대표관리자만 할 수 있습니다. 금액은 보이지만 바꾸기와 끄기는 눌러지지 않습니다."}</Info>
      <div className="body">
        {err ? <Blocked err={err} /> : (
          <>
            <div className="kpis">
              <div className="kpi"><label>광고비</label><b>{man(spend)}</b><div className="h">{periodShort(period)} · {branch}</div></div>
              <div className="kpi"><label>유입</label><b>{n0(inflow)}</b><div className="h">클릭·문의 합</div></div>
              <div className="kpi"><label>예약 전환</label><b>{pct(reserve, inflow)}</b><div className="h">유입 대비 예약 {reserve}건</div></div>
              <div className="kpi"><label>등록당 비용</label><b>{reg ? man(Math.round(spend / reg)) : "—"}</b><div className="h">{reg ? `등록 ${reg}건 기준` : "등록 자료 없음"}</div></div>
            </div>
            <div className="sec">
              <div className="sech"><h2>채널별 현황</h2><span className="sp" /><span className="sub">연결 상태는 보이지만 키 값은 보이지 않습니다.</span></div>
              <div className="wrap mb-scroll"><table className="tbl mx-ads-t">
                <thead><tr><th>채널</th><th>연결</th><th className="num">광고비</th><th className="num">노출</th><th className="num">유입</th><th className="num">예약</th><th className="num">등록</th><th>진행</th></tr></thead>
                <tbody>
                  {!data && <tr><td colSpan={8} className="mx-empty">불러오는 중…</td></tr>}
                  {data && rows.length === 0 && <tr><td colSpan={8} className="mx-empty">연결된 광고 채널이 없습니다</td></tr>}
                  {rows.map((x) => {
                    const on = x.connected ? x.live > 0 : x.manual;
                    return (
                      <tr key={x.channel}>
                        <td data-label="채널">{x.channel}</td>
                        <td data-label="연결">{x.connected ? <span className="badge ok">연결됨</span> : <span className="badge line">직접 입력</span>}</td>
                        <td className="num" data-label="광고비">{owner
                          ? <div className="amtrow"><span>{n0(x.spend)}</span> <button className="btn sm" onClick={() => setBudget(x)}>바꾸기</button></div>
                          : n0(x.spend)}</td>
                        <td className="num" data-label="노출">{x.imp == null ? "—" : n0(x.imp)}</td>
                        <td className="num" data-label="유입">{n0(x.inflow)}</td>
                        <td className="num" data-label="예약">{n0(x.reserve)}</td>
                        <td className="num" data-label="등록">{n0(x.reg)}</td>
                        <td data-label="진행">
                          {on ? <span className="badge ok">진행</span> : <span className="badge">{x.connected ? "꺼짐" : "입력 없음"}</span>}{" "}
                          {owner ? <button className="btn sm" disabled={!on} onClick={() => setOff(x)}>끄기</button> : <button className="btn sm off" disabled>끄기</button>}
                          {owner && !x.connected && canEdit(me) && <>{" "}<button className="btn sm" onClick={() => setManual(x)}>직접 입력</button></>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
            <Collect jobs={(data?.jobs ?? []).filter((j) => j.job.startsWith("ads-"))} fail={data?.fails ? `최근 7일 실패 ${data.fails}건` : "최근 7일 실패 없음"}>
              <div className="crow"><span className="meta">연결 키는 이 화면에 보이지 않습니다. <Link className="link" href="/settings">설정 › 운영 › 연결</Link>에서 관리합니다.</span></div>
              {owner && (
                <div className="sec">
                  <div className="sech"><h2>변경 기록</h2><span className="sub">최근 변경 · 직급을 함께 남깁니다</span></div>
                  <div className="wrap mb-scroll"><table className="tbl">
                    <thead><tr><th>시각</th><th>변경한 사람</th><th>직급</th><th>내용</th></tr></thead>
                    <tbody>
                      {(data?.log ?? []).length === 0 && <tr><td colSpan={4} className="mx-empty">아직 변경 기록이 없습니다</td></tr>}
                      {(data?.log ?? []).map((l, i) => (
                        <tr key={i}><td data-label="시각">{when(l.at)}</td><td data-label="변경한 사람">{l.by}</td><td data-label="직급">{TIER_LABEL[l.tier] ?? l.tier}</td><td data-label="내용">{l.body}</td></tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </Collect>
          </>
        )}
      </div>

      {budget && <BudgetModal row={budget} branch={branch} onClose={() => setBudget(null)} onDone={() => { setBudget(null); toast("월 광고비를 바꿨어요"); reload(); }} />}
      {off && (
        <Modal title={`${off.channel} 광고를 끌까요?`} onClose={() => setOff(null)} foot={<>
          <button className="btn" onClick={() => setOff(null)}>취소</button>
          <button className="btn p" onClick={async () => {
            try { await rpc("mkt_ad_off_request", { p_branch: branch, p_channel: off.channel }); toast("끄기 요청을 기록했어요"); reload(); }
            catch (e) { toast((e as Error).message); }
            setOff(null);
          }}>끄기</button>
        </>}>
          <p>끄기 요청을 남깁니다. {branch}에만 적용됩니다.</p>
          <p>광고 매체 연결 전이라 실제 끄기는 {off.channel} 광고 관리자에서 해요.</p>
          <p>변경 기록에 이름과 직급이 남아요.</p>
        </Modal>
      )}
      {manual && <ManualModal row={manual} branch={branch} from={r.from} onClose={() => setManual(null)} onDone={() => { setManual(null); toast("저장했어요"); reload(); }} />}
    </div>
  );
}

function BudgetModal({ row, branch, onClose, onDone }: { row: Row; branch: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState("");
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const num = Number(v.replace(/\D/g, "") || 0);
  return (
    <Modal title={`${row.channel} 광고비를 바꿀까요?`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={busy || !v} onClick={async () => {
        setBusy(true);
        try { await rpc("mkt_budget_set", { p_branch: branch, p_channel: row.channel, p_monthly: num }); onDone(); }
        catch (x) { setE((x as Error).message); setBusy(false); }
      }}>바꾸기</button>
    </>}>
      <div className="diff">
        <div className="r"><span className="k">현재</span><span className="v">{(row.budget ?? row.spend).toLocaleString()}원</span></div>
        <div className="r"><span className="k">바꿀 금액</span><input className="inp sm" inputMode="numeric" value={v ? num.toLocaleString() : ""} onChange={(x) => setV(x.target.value)} placeholder="0" autoFocus aria-label="바꿀 금액" /><span className="unit">원</span></div>
      </div>
      <p>MERA 월 예산이 바뀌어요. 광고 매체 예산은 광고 관리자에서 바꿔요.</p>
      <p>변경 기록에 이름과 직급이 남아요.</p>
      {e && <p className="err">{e}</p>}
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
      <p className="help">{branch} · {from.slice(5).replace("-", ".")} 시작 주. 당근 비즈센터 숫자를 그대로 옮겨 적어 주세요.</p>
      <div className="grid">
        {F("spend", "광고비(원)", !canBudget(me))}
        {F("inflow", "유입(클릭)")}
        {F("reserve", "예약")}
        {F("reg", "등록")}
      </div>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
