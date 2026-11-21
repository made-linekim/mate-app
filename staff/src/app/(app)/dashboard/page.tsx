"use client";
// 대시보드 (시안 1120 U-PC-DASH-1~4): 한눈에 · 목표 · 직원 성장 · 팀전
// 데이터는 dash_* RPC (043_대시보드.sql). 매출 숫자는 서버가 권한 있는 사람에게만 보내요.
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sb, BRANCHES, TIER_LABEL, type Tier } from "@/lib/sb";
import { useMe } from "@/lib/me";
import "./dash.css";

type TabK = "glance" | "goal" | "growth" | "team";
const TABS: { k: TabK; l: string }[] = [
  { k: "glance", l: "한눈에" }, { k: "goal", l: "목표" }, { k: "growth", l: "직원 성장" }, { k: "team", l: "팀전" },
];

const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const monthStart = () => todayKST().slice(0, 8) + "01";
const man = (won: number) => {
  const v = Math.round((won || 0) / 10000);
  return `${v.toLocaleString()}만`;
};
const pct = (a: number, t: number | null | undefined) => (t && t > 0 ? Math.round((100 * (a || 0)) / t) : null);
const md = (d: string) => (d ? `${Number(d.slice(5, 7))}.${d.slice(8, 10)}` : "");
const chartHref = (b: string, k: string) => `/customers/chart?b=${encodeURIComponent(b)}&k=${encodeURIComponent(k)}`;
const notReady = (msg: string) => /does not exist|Could not find|schema cache/i.test(msg);

export default function DashboardPage() {
  return <Suspense fallback={null}><Dashboard /></Suspense>;
}

function Dashboard() {
  const me = useMe();
  const sp = useSearchParams();
  const router = useRouter();
  const tab: TabK = (TABS.find((t) => t.k === sp.get("tab"))?.k) ?? "glance";
  const [branch, setBranch] = useState(me.branch);
  const go = (k: TabK) => router.replace(k === "glance" ? "/dashboard" : `/dashboard?tab=${k}`, { scroll: false });

  return (
    <>
      <nav className="ds-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={t.k === tab ? "on" : ""} onClick={() => go(t.k)}>{t.l}</button>
        ))}
        {me.tier === "owner" && tab !== "team" && (
          <select className="sel ds-br" aria-label="지점" value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
      </nav>
      <div className="page ds">
        {tab === "glance" && <Glance branch={branch} />}
        {tab === "goal" && <Goal branch={branch} />}
        {tab === "growth" && <Growth branch={branch} />}
        {tab === "team" && <Team />}
      </div>
    </>
  );
}

/* ───────── 공통 ───────── */
function useRpc<T>(fn: string, args: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const key = JSON.stringify(args);
  const load = useCallback(() => {
    setErr("");
    sb.rpc(fn, JSON.parse(key)).then(({ data, error }) => {
      if (error) { setErr(notReady(error.message) ? "대시보드 데이터 연결 전이에요. (DB 043 실행 후 보여요)" : error.message); setData(null); }
      else setData(data as T);
    });
  }, [fn, key]);
  useEffect(() => { load(); }, [load]);
  return { data, err, reload: load };
}

// 설명글은 ⓘ 뒤에 접어 둬요 (스킬: 회색 설명 펼쳐 두지 않기). 할 일 버튼만 밖에.
function Note({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ds-note">
      <button className={`ds-i ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 11v5M12 7.5v.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
        누가 무엇을 보나요
      </button>
      {action}
      {open && <p>{children}</p>}
    </div>
  );
}
function Info({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ds-ii" aria-label="설명 보기" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M12 11v5M12 7.5v.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>
      </button>
      {open && <span className="ds-iit">{children}</span>}
    </>
  );
}
function Kpi({ v, l, red }: { v: React.ReactNode; l: React.ReactNode; red?: boolean }) {
  return <div className="card ds-kpi"><b className={`num ${red ? "red" : ""}`}>{v}</b><span>{l}</span></div>;
}
// goal=true 일 때만 100% 넘으면 초록 (순위 막대는 비율이라 초록 안 씀)
function Bar({ p, goal = true }: { p: number | null; goal?: boolean }) {
  const w = Math.max(0, Math.min(100, p ?? 0));
  return <div className="ds-bar"><i style={{ width: `${w}%` }} className={goal && (p ?? 0) >= 100 ? "g" : ""} /></div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="ds-empty">{children}</div>;
}
function Loading({ err }: { err: string }) {
  return err ? <Empty>{err}</Empty> : <Empty>불러오는 중…</Empty>;
}

/* ───────── 1. 한눈에 ───────── */
type Glance = {
  today: string; tier: Tier; show_sales: boolean; show_rank: boolean; show_customers: boolean;
  rsv_today: number; visit_today: number; rereg_done: number; rereg_due: number; risk_count: number;
  rsv_list?: { time: string; key: string; customer: string; staff: string; status: string }[];
  expire_list?: { key: string; customer: string; kind: string; left_n: number; end_on: string }[];
  risk_list?: { key: string; customer: string; reason: string; action: string }[];
  monthly?: { m: number; this: number; last: number }[];
  rank?: { name: string; amount: number }[];
};

function Glance({ branch }: { branch: string }) {
  const { data: d, err } = useRpc<Glance>("dash_glance", { p_branch: branch });
  if (!d) return <Loading err={err} />;
  const mon = Number(d.today.slice(5, 7));
  const note = d.show_rank ? "월 매출과 직원별 매출 순위는 매출 권한이 있는 대표관리자·관리자만 봐요."
    : d.show_sales ? "월 매출은 매출 권한이 있는 사람만 봐요."
    : "한눈에에는 예약·방문·재등록·이탈 위험만 보여요.";
  return (
    <>
      <Note>{note}</Note>
      <div className="ds-g4">
        <Kpi v={d.rsv_today} l="오늘 예약" />
        <Kpi v={d.visit_today} l="오늘 방문" />
        <Kpi v={`${d.rereg_done} / ${d.rereg_due}`} l="이번 달 재등록" />
        <Kpi v={`${d.risk_count}명`} l="이탈 위험" red={d.risk_count > 0} />
      </div>

      {d.show_sales && (
        <div className={d.show_rank ? "ds-g2" : ""}>
          <section className="card ds-card">
            <h2>월 매출 <small>{branch} · 1–{mon}월 · 만 원</small></h2>
            <MonthChart rows={d.monthly ?? []} />
          </section>
          {d.show_rank && (
            <section className="card ds-card">
              <h2>직원별 매출 순위 · {mon}월 <Info>이 순위는 매출 권한이 있는 대표관리자·관리자만 봐요. 결제 때 고른 담당 직원 기준이에요.</Info></h2>
              {(d.rank ?? []).length === 0 ? <Empty>이번 달 매출 기록이 아직 없어요.</Empty> : (
                <div className="ds-rank">
                  {d.rank!.map((r, i) => (
                    <div key={r.name} className={`ds-rrow ${i < 3 ? "t3" : ""}`}>
                      <span className="n num">{i + 1}</span><span className="nm">{r.name}</span>
                      <Bar goal={false} p={(100 * r.amount) / Math.max(d.rank![0].amount, 1)} />
                      <span className="v num">{man(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {d.show_customers ? (
        <div className="ds-g3">
          <section className="card ds-card">
            <h2>오늘 예약</h2>
            <List head={["시간", "고객", "담당"]} cols="ds-c3" empty="오늘 잡힌 예약이 없어요."
              rows={(d.rsv_list ?? []).map((r) => ({ key: r.key + r.time, href: chartHref(branch, r.key),
                cells: [<span key="t" className="num">{r.time}</span>, r.customer, r.staff || "-"] }))} />
          </section>
          <section className="card ds-card">
            <h2>만료 임박 <Info>30일 안에 끝나거나 2회 이하 남은 회원권이에요.</Info></h2>
            <List head={["고객", "잔여", "만료"]} cols="ds-c3b" empty="한 달 안에 끝나는 회원권이 없어요."
              rows={(d.expire_list ?? []).map((r) => ({ key: r.key + r.end_on, href: chartHref(branch, r.key),
                cells: [r.customer, <span key="l" className="num">{r.kind === "회차" ? `${r.left_n}회` : "기간"}</span>, <span key="e" className="num">{md(r.end_on)}</span>] }))} />
          </section>
          <section className="card ds-card">
            <h2>이탈 위험 <Info>회원권이 있는데 21일 넘게 안 왔거나, 14일 안에 끝나는데 다음 예약이 없는 고객이에요.</Info></h2>
            <List head={["고객", "이유", ""]} cols="ds-c3c" empty="이탈 위험 고객이 없어요."
              rows={(d.risk_list ?? []).map((r) => ({ key: r.key, href: r.action === "해피콜" ? "/work?tab=happycall" : chartHref(branch, r.key),
                cells: [r.customer, r.reason, <span key="a" className="ds-act">{r.action}</span>] }))} />
          </section>
        </div>
      ) : (
        <Empty>고객 목록을 볼 권한이 없어서 예약·만료·이탈 명단은 숨겼어요.</Empty>
      )}
    </>
  );
}

function MonthChart({ rows }: { rows: { m: number; this: number; last: number }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.this, r.last]));
  const none = rows.every((r) => !r.this && !r.last);
  if (none) return <div className="ds-none">자료 없음 — 아직 결제 기록이 없어요. 결제를 입력하면 여기에 쌓여요.</div>;
  return (
    <>
      <div className="ds-leg"><span><i className="k" />올해 (만 원)</span><span><i className="l" />작년</span></div>
      <div className="ds-chart">
        {rows.map((r) => (
          <div key={r.m} className="col" title={`${r.m}월 · 올해 ${man(r.this)} · 작년 ${man(r.last)}`}>
            <div className="bars">
              <i className="k" style={{ height: `${Math.max(2, (100 * r.this) / max)}%` }} />
              <i className="l" style={{ height: `${Math.max(2, (100 * r.last) / max)}%` }} />
            </div>
            <span>{r.m}월</span>
          </div>
        ))}
      </div>
    </>
  );
}

const FOLD = 8;
function List({ head, rows, empty, cols }: {
  head: string[]; cols: string; empty: string;
  rows: { key: string; href: string; cells: React.ReactNode[] }[];
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FOLD);
  return (
    <div className={`ds-list ${cols}`}>
      <div className="h">{head.map((h, i) => <span key={i}>{h}</span>)}</div>
      {rows.length === 0 ? <div className="e">{empty}</div> : shown.map((r) => (
        <Link key={r.key} href={r.href} className="r">{r.cells.map((c, i) => <span key={i}>{c}</span>)}</Link>
      ))}
      {rows.length > FOLD && (
        <button className="ds-more" onClick={() => setAll(!all)}>{all ? "접기" : `나머지 ${rows.length - FOLD}명 보기`}</button>
      )}
    </div>
  );
}

/* ───────── 2. 목표 ───────── */
type GV = { target: number | null; actual: number } | null;
type GoalData = {
  month: string; tier: Tier; show_sales: boolean; show_staff: boolean; can_edit: boolean; days_left: number;
  branch?: { sales: GV; visit: GV; rereg: GV };
  staff?: { id: string; name: string; sales: GV; visit: GV; rereg: GV }[];
  logs?: { at: string; by_name: string; by_tier: Tier; metric: string; before: number | null; after: number | null; staff: string }[];
  mine?: { visit: GV; rereg: GV };
};
const MET: Record<string, string> = { sales: "매출", visit: "방문", rereg: "재등록" };
const fmtG = (m: string, v: number | null) => (v == null ? "없음" : m === "sales" ? man(v) : `${v.toLocaleString()}${m === "visit" ? "명" : "명"}`);

function Goal({ branch }: { branch: string }) {
  const [month] = useState(monthStart());
  const { data: d, err, reload } = useRpc<GoalData>("dash_goal", { p_branch: branch, p_month: month });
  const [edit, setEdit] = useState(false);
  if (!d) return <Loading err={err} />;
  const mon = Number(d.month.slice(5, 7));

  if (!d.show_staff) {
    const v = d.mine?.visit, r = d.mine?.rereg;
    return (
      <>
        <Note>직원은 내 목표만 봐요. 방문·재등록 달성률만 보여요.</Note>
        <section className="card ds-card">
          <h2>내 목표 · {mon}월</h2>
          <div className="ds-g2 in">
            <Kpi v={pct(v?.actual ?? 0, v?.target) == null ? "-" : `${pct(v!.actual, v!.target)}%`} l={`방문 ${v?.actual ?? 0} / ${v?.target ?? "목표 없음"}`} />
            <Kpi v={pct(r?.actual ?? 0, r?.target) == null ? "-" : `${pct(r!.actual, r!.target)}%`} l={`재등록 ${r?.actual ?? 0} / ${r?.target ?? "목표 없음"}`} />
          </div>
          <div className="ds-lbl">방문</div><Bar p={pct(v?.actual ?? 0, v?.target)} />
          <div className="ds-lbl">재등록</div><Bar p={pct(r?.actual ?? 0, r?.target)} />
          <p className="ds-sub">목표는 대표관리자·관리자가 정해요.</p>
        </section>
      </>
    );
  }

  const b = d.branch!;
  const cards = (["sales", "visit", "rereg"] as const).filter((k) => k !== "sales" || d.show_sales);
  return (
    <>
      <Note action={d.can_edit && <button className="btn sm ds-note-btn" onClick={() => setEdit(true)}>목표 정하기</button>}>
        목표는 {d.show_sales ? "매출, " : ""}방문, 재등록 순으로 봐요. 직원별 달성률은 대표관리자·관리자만 봐요. 목표가 없으면 달성률 대신 &apos;-&apos;로 보여요.
      </Note>
      <div className="ds-g4">
        {cards.map((k) => {
          const g = b[k]; const p = pct(g?.actual ?? 0, g?.target);
          return <Kpi key={k} v={p == null ? "-" : `${p}%`}
            l={`${MET[k]} ${k === "sales" ? man(g?.actual ?? 0) : (g?.actual ?? 0)} / ${g?.target == null ? "목표 없음" : k === "sales" ? man(g.target) : g.target}`} />;
        })}
        <Kpi v={`${d.days_left}일`} l="남은 영업일" />
      </div>
      <div className={cards.length === 3 ? "ds-g3" : "ds-g2"}>
        {cards.map((k) => {
          const g = b[k]; const p = pct(g?.actual ?? 0, g?.target);
          const unit = k === "sales" ? man : (n: number) => `${n}명`;
          return (
            <section key={k} className="card ds-card">
              <h2>{MET[k]}</h2>
              <p className="ds-sub">목표 {g?.target == null ? "없음" : unit(g.target)} · 실적 {unit(g?.actual ?? 0)}</p>
              <Bar p={p} />
              <b className="ds-pct num">{p == null ? "목표를 정하면 달성률이 보여요" : `${p}%`}</b>
            </section>
          );
        })}
      </div>
      <section className="card ds-card">
        <h2>직원별 달성률 <Info>이 표는 대표관리자·관리자만 봐요. 100%를 넘으면 초록이에요. 직원 목표는 &apos;목표 정하기&apos;에서 넣어요.</Info></h2>
        {(d.staff ?? []).length === 0 ? <Empty>등록된 직원이 없어요.</Empty> : (
          <div className={`ds-sg ${d.show_sales ? "s3" : "s2"}`}>
            <div className="h"><span>직원</span>{cards.map((k) => <span key={k}>{MET[k]}</span>)}</div>
            {d.staff!.map((s) => (
              <div key={s.id} className="r">
                <span className="nm">{s.name}</span>
                {cards.map((k) => {
                  const g = s[k]; const p = pct(g?.actual ?? 0, g?.target);
                  return <span key={k} className="c" data-label={MET[k]}><Bar p={p} /><em className="num">{p == null ? "-" : `${p}%`}</em></span>;
                })}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card ds-card">
        <h2>변경 이력</h2>
        {(d.logs ?? []).length === 0 ? <Empty>아직 목표를 바꾼 기록이 없어요.</Empty> : (
          <div className="ds-logs">
            {d.logs!.map((l, i) => (
              <div key={i}>
                {l.by_name} {TIER_LABEL[l.by_tier]} · {md(l.at.slice(0, 10))} {new Date(l.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" })}
                {" · "}{l.staff ? `${l.staff} ` : "월 "}{MET[l.metric]} 목표 {fmtG(l.metric, l.before)} → {fmtG(l.metric, l.after)}
              </div>
            ))}
          </div>
        )}
      </section>
      {edit && <GoalEditor d={d} branch={branch} month={month} onClose={(ch) => { setEdit(false); if (ch) reload(); }} />}
    </>
  );
}

function GoalEditor({ d, branch, month, onClose }: { d: GoalData; branch: string; month: string; onClose: (changed: boolean) => void }) {
  const mets = (["sales", "visit", "rereg"] as const).filter((k) => k !== "sales" || d.show_sales);
  const init = useMemo(() => {
    const o: Record<string, string> = {};
    for (const k of mets) {
      const t = d.branch?.[k]?.target;
      o[`|${k}`] = t == null ? "" : String(k === "sales" ? Math.round(t / 10000) : t);
      for (const s of d.staff ?? []) {
        const st = s[k]?.target;
        o[`${s.id}|${k}`] = st == null ? "" : String(k === "sales" ? Math.round(st / 10000) : st);
      }
    }
    return o;
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const rows = [{ id: "", name: `${branch} 전체` }, ...(d.staff ?? []).map((s) => ({ id: s.id, name: s.name }))];

  async function save() {
    setBusy(true); setMsg("");
    try {
      for (const [key, val] of Object.entries(v)) {
        if (val === init[key]) continue;
        const [staff, metric] = key.split("|");
        const n = val.trim() === "" ? null : Number(val.replace(/,/g, ""));
        if (n != null && (!Number.isFinite(n) || n < 0)) throw new Error("숫자를 확인해 주세요.");
        const { error } = await sb.rpc("dash_goal_set", { p_branch: branch, p_month: month, p_metric: metric, p_staff: staff, p_target: n == null ? null : metric === "sales" ? n * 10000 : n });
        if (error) throw new Error(error.message);
      }
      onClose(true);
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <div className="dim" style={{ zIndex: 50 }} onClick={() => onClose(false)} />
      <div className="drawer lg" style={{ zIndex: 51 }} role="dialog" aria-label="목표 정하기">
        <div className="hd">{Number(month.slice(5, 7))}월 목표 정하기</div>
        <div className="bd">
          <p className="ds-sub">비워 두면 목표 없음이에요. {d.show_sales && "매출은 만 원 단위로 적어요."} 바꾼 내용은 변경 이력에 남아요.</p>
          <div className={`ds-ge ${mets.length === 3 ? "s3" : "s2"}`}>
            <div className="h"><span /> {mets.map((k) => <span key={k}>{MET[k]}{k === "sales" ? " (만 원)" : " (명)"}</span>)}</div>
            {rows.map((r) => (
              <div key={r.id || "all"} className={`r ${r.id ? "" : "all"}`}>
                <span className="nm">{r.name}</span>
                {mets.map((k) => (
                  <input key={k} className="inp num" inputMode="numeric" aria-label={`${r.name} ${MET[k]}`} data-label={MET[k]}
                    value={v[`${r.id}|${k}`] ?? ""} onChange={(e) => setV({ ...v, [`${r.id}|${k}`]: e.target.value.replace(/[^\d,]/g, "") })} />
                ))}
              </div>
            ))}
          </div>
          {msg && <p className="ds-err">{msg}</p>}
        </div>
        <div className="ft">
          <button className="btn" onClick={() => onClose(false)}>취소</button>
          <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중" : "저장"}</button>
        </div>
      </div>
    </>
  );
}

/* ───────── 3. 직원 성장 ───────── */
type Rules = { sales_per: number; sales_pt: number; rereg: number; call: number; log: number; review: number; levels: number[]; names: string[] };
type GrowthData = {
  month: string; tier: Tier; rules: Rules; show_staff: boolean;
  me: { name: string; score: number; parts: Record<string, number | null>; parts_pct: boolean } | null;
  staff?: { id: string; name: string; title: string | null; tier: Tier; score: number }[];
};
const levelOf = (score: number, r: Rules) => {
  let i = 0;
  r.levels.forEach((lv, k) => { if (score >= lv) i = k; });
  const next = r.levels[i + 1];
  return { name: r.names[i], next: next == null ? null : { name: r.names[i + 1], need: next - score },
    p: next == null ? 100 : (100 * (score - r.levels[i])) / (next - r.levels[i]), maxP: (100 * score) / r.levels[r.levels.length - 1] };
};
const PART: [string, string][] = [["sales", "매출"], ["rereg", "재등록"], ["call", "해피콜"], ["log", "운동일지"], ["review", "후기"]];

function Growth({ branch }: { branch: string }) {
  const me = useMe();
  const { data: d, err } = useRpc<GrowthData>("dash_growth", { p_branch: branch, p_month: monthStart() });
  if (!d) return <Loading err={err} />;
  const r = d.rules;
  const mine = d.me;
  const lv = mine ? levelOf(mine.score, r) : null;
  const parts = mine ? PART.map(([k, l]) => `${l} ${mine.parts_pct ? `${mine.parts[k] ?? 0}%` : (mine.parts[k] ?? 0).toLocaleString()}`).join(" · ") : "";
  const top = Math.max(1, ...(d.staff ?? []).map((s) => s.score));

  const myCard = (
    <section className="card ds-card">
      <h2>내 레벨</h2>
      {!mine ? <Empty>내 점수를 불러오지 못했어요.</Empty> : (
        <>
          <div className="ds-lv">{mine.name} · {lv!.name}</div>
          <p className="ds-sub num">{mine.score.toLocaleString()}점 · {lv!.next ? `다음 레벨 ${lv!.next.name}까지 ${lv!.next.need.toLocaleString()}점` : "최고 레벨이에요"}</p>
          <Bar goal={false} p={lv!.p} />
          <p className="ds-sub ds-gap">점수 출처 · {mine.parts_pct ? "" : "이번 달 "}{parts}</p>
          {!d.show_staff && <p className="ds-sub">레벨은 {r.names.join(" · ")}예요.</p>}
        </>
      )}
    </section>
  );

  if (!d.show_staff) {
    return (<><Note>직원은 내 성장만 봐요. 매출에서 온 점수는 비율로만 보이고, 매출 숫자는 두지 않아요.</Note>{myCard}</>);
  }
  return (
    <>
      <Note>{me.tier === "owner" ? "대표관리자는 지점을 바꿔 직원 점수와 순위를 봐요." : "관리자는 자기 지점 직원의 점수와 순위를 봐요."}</Note>
      <div className="ds-g2">
        {myCard}
        <section className="card ds-card">
          <h2>레벨</h2>
          <p className="ds-sub">{r.names.join(" · ")}</p>
          <p className="ds-sub">이번 달 점수로 레벨이 올라가요. 매출 {(r.sales_per / 10000).toLocaleString()}만 원당 {r.sales_pt}점, 재등록 {r.rereg}점, 해피콜 {r.call}점, 운동일지 {r.log}점, 후기 {r.review}점이에요.</p>
          <div className="ds-lvs">
            {r.names.map((n, i) => <span key={n}><b>{n}</b><em className="num">{r.levels[i].toLocaleString()}점~</em></span>)}
          </div>
        </section>
      </div>
      <section className="card ds-card">
        <h2>{branch} 직원 · 순위</h2>
        {(d.staff ?? []).length === 0 ? <Empty>등록된 직원이 없어요.</Empty> : (
          <div className="ds-st">
            <div className="h"><span>순위</span><span>직원</span><span>직무</span><span>역할</span><span>레벨</span><span>점수</span><span>진행</span></div>
            {d.staff!.map((s, i) => (
              <div key={s.id} className={`r ${s.id === me.id ? "me" : ""} ${i < 3 ? "t3" : ""}`}>
                <span className="num rk">{i + 1}</span>
                <span className="nm">{s.name}{s.id === me.id ? " · 나" : ""}</span>
                <span data-label="직무">{s.title || "-"}</span>
                <span data-label="역할">{TIER_LABEL[s.tier]}</span>
                <span data-label="레벨">{levelOf(s.score, r).name}</span>
                <span className="num sc">{s.score.toLocaleString()}</span>
                <span className="pg"><Bar goal={false} p={(100 * s.score) / top} /></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ───────── 4. 팀전 ───────── */
type TeamRow = { id: string; branch: string; name: string; target: number; members: string[]; score: number; sales: number | null; people: { id: string; name: string; title: string | null }[] };
type TeamData = {
  month: string; tier: Tier; show_sales: boolean; can_edit: boolean; rules: Rules;
  teams: TeamRow[]; people: { id: string; name: string; team: string; score: number; parts: string }[];
  staff_pick: { id: string; name: string; branch: string; title: string | null }[] | null;
};

function Team() {
  const { data: d, err, reload } = useRpc<TeamData>("dash_team", { p_month: monthStart() });
  const [ed, setEd] = useState<TeamRow | "new" | null>(null);
  if (!d) return <Loading err={err} />;
  const y = d.month.slice(0, 4), m = Number(d.month.slice(5, 7));
  const last = new Date(Number(y), m, 0).getDate();
  const range = `${m}.01 – ${m}.${last}`;

  return (
    <>
      <Note action={d.can_edit && <button className="btn sm ds-note-btn" onClick={() => setEd("new")}>+ 팀 만들기</button>}>
        팀 순위는 팀원 점수를 더해 정해요. 1위만 테두리와 배경으로 강조하고, 100%를 넘으면 초록으로 보여요.
      </Note>
      <p className="ds-sub ds-cap">{m}월 팀전 · {range}</p>
      {d.teams.length === 0 ? (
        <section className="card ds-card"><Empty>
          이번 달 팀이 아직 없어요.{d.can_edit ? " 위 '+ 팀 만들기'로 팀을 만들어 주세요." : " 대표관리자·관리자가 팀을 만들면 보여요."}
        </Empty></section>
      ) : (
        <div className="ds-g4 ds-teams">
          {d.teams.map((t, i) => {
            const p = pct(t.score, t.target) ?? 0;
            return (
              <div key={t.id} className={`card ds-team ${i === 0 && t.score > 0 ? "first" : ""}`}>
                <div className="rk">{i + 1}위</div>
                <h3>{t.name}</h3>
                <p className="ds-sub">{t.people.length ? t.people.map((x) => `${x.name}${x.title ? ` ${x.title}` : ""}`).join(" · ") : "팀원 없음"}</p>
                <p className="ds-sub num">{t.sales != null ? `매출 ${man(t.sales)} · ` : ""}점수 {t.score.toLocaleString()} / 목표 {t.target.toLocaleString()}</p>
                <Bar p={p} />
                <div className="ft"><b className="num">{p}%</b>{d.can_edit && <button className="btn t sm" onClick={() => setEd(t)}>수정</button>}</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="ds-g2">
        <section className="card ds-card">
          <h2>개인 기여</h2>
          <List head={["직원", "팀", "점수", "구성"]} cols="ds-c4" empty="아직 점수가 없어요."
            rows={d.people.map((p) => ({ key: p.id, href: "/dashboard?tab=growth",
              cells: [p.name, p.team, <span key="s" className="num">{p.score.toLocaleString()}</span>, p.parts || "-"] }))} />
        </section>
        <section className="card ds-card">
          <h2>팀전 규칙</h2>
          <p className="ds-sub">기간 {range}</p>
          <p className="ds-sub">점수는 매출·재등록·해피콜·운동일지·후기를 더해요.</p>
          <p className="ds-sub">매출 {(d.rules.sales_per / 10000).toLocaleString()}만 원당 {d.rules.sales_pt}점 · 재등록 1건 {d.rules.rereg}점 · 해피콜 1건 {d.rules.call}점 · 운동일지 1건 {d.rules.log}점 · 후기 1건 {d.rules.review}점</p>
          <p className="ds-sub">팀 목표 점수는 팀마다 정해요. 상금 규칙은 대표관리자가 정해요.</p>
        </section>
      </div>
      {ed && d.staff_pick && <TeamEditor team={ed === "new" ? null : ed} month={d.month} pick={d.staff_pick} onClose={(ch) => { setEd(null); if (ch) reload(); }} />}
    </>
  );
}

function TeamEditor({ team, month, pick, onClose }: { team: TeamRow | null; month: string; pick: NonNullable<TeamData["staff_pick"]>; onClose: (ch: boolean) => void }) {
  const me = useMe();
  const [name, setName] = useState(team?.name ?? "");
  const [branch, setBranch] = useState(team?.branch ?? me.branch);
  const [target, setTarget] = useState(String(team?.target ?? 800));
  const [mem, setMem] = useState<string[]>(team?.members ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const list = pick.filter((p) => me.tier === "owner" || p.branch === me.branch);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setMsg("");
    const { error } = await fn();
    if (error) { setMsg(error.message); setBusy(false); } else onClose(true);
  }
  return (
    <>
      <div className="dim" style={{ zIndex: 50 }} onClick={() => onClose(false)} />
      <div className="drawer" style={{ zIndex: 51 }} role="dialog" aria-label="팀 정하기">
        <div className="hd">{team ? "팀 수정" : "팀 만들기"}</div>
        <div className="bd ds-form">
          <label>팀 이름<input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 의정부 오전" /></label>
          <label>지점
            <select className="sel" value={branch} disabled={me.tier !== "owner"} onChange={(e) => setBranch(e.target.value)}>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label>목표 점수<input className="inp num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} /></label>
          <div className="ds-lbl">팀원 (다른 지점 직원도 넣을 수 있어요)</div>
          <div className="ds-pick">
            {list.map((p) => (
              <label key={p.id} className={mem.includes(p.id) ? "on" : ""}>
                <input type="checkbox" checked={mem.includes(p.id)} onChange={(e) => setMem(e.target.checked ? [...mem, p.id] : mem.filter((x) => x !== p.id))} />
                {p.name}<small>{p.branch}{p.title ? ` · ${p.title}` : ""}</small>
              </label>
            ))}
          </div>
          {msg && <p className="ds-err">{msg}</p>}
        </div>
        <div className="ft">
          {team && <button className="btn danger" style={{ marginRight: "auto" }} disabled={busy} onClick={() => run(() => sb.rpc("dash_team_del", { p_id: team.id }))}>삭제</button>}
          <button className="btn" onClick={() => onClose(false)}>취소</button>
          <button className="btn p" disabled={busy || !name.trim()} onClick={() => run(() => sb.rpc("dash_team_save", {
            p_id: team?.id ?? null, p_month: month, p_branch: branch, p_name: name, p_members: mem, p_target: Number(target) || 800 }))}>저장</button>
        </div>
      </div>
    </>
  );
}
