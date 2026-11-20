"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import "./work.css";
import { HcRow, LogDrawer, kst } from "./log-drawer";

// 오늘 할 일 (메라 시안 02-01~02-05m): 해피콜 · 지난 마감 · 승인 대기 · 남은 업무 를 탭 하나로.
// 데이터: work_today(업무·체크리스트) + happycall_list(해피콜 대상). 기록은 happycall_log · work_item_done · task_check_set.

type Item = {
  id: string; kind: string; title: string | null; note: string | null; status: string;
  assignee: string | null; due_at: string | null; follow_day: string | null; mine: boolean;
};
type Check = { id: string; title: string; cycle: string; checked: boolean; checked_by: string | null; checked_at: string | null };
type Today = {
  day: string; branch: string;
  happycall: { today_left: number; today_done: number; overdue: number };
  overdue: Item[];
  approvals: { can: boolean; items: Item[]; manual_certs: number };
  remaining: Item[];
  checklist: Check[];
};
type Tab = "happycall" | "overdue" | "approval" | "remaining";
const TAB_LIST: { k: Tab; l: string }[] = [
  { k: "happycall", l: "해피콜" }, { k: "overdue", l: "지난 마감" }, { k: "approval", l: "승인 대기" }, { k: "remaining", l: "남은 업무" },
];

// 해피콜 구분 (시안 칩: 만료 임박 · 첫 방문 후 · 미방문). todo = 뷰티사랑넷 예약표에서 가져온 할 일
type Kind = HcRow["kind"];
const KIND: Record<Kind, { l: string; badge: string }> = {
  expiring: { l: "만료 임박", badge: "em" }, new: { l: "첫 방문 후", badge: "" }, lapsed: { l: "미방문", badge: "" }, todo: { l: "예약표 할 일", badge: "" },
};
const KIND_ORDER: Kind[] = ["expiring", "new", "lapsed", "todo"];
const PAGE = 20;

const md = (s: string | null) => (s ? `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}` : "-");
const dt = (s: string | null) => {
  if (!s) return "-";
  const k = new Date(new Date(s).getTime() + 9 * 36e5).toISOString();
  return `${md(k.slice(0, 10))} ${k.slice(11, 16)}`;
};
const errText = (m: string) =>
  /Could not find the function|does not exist|PGRST202/.test(m) ? "업무 서버 기능을 준비하고 있어요. 곧 열려요."
  : /FORBIDDEN_BRANCH/.test(m) ? "이 지점 업무는 볼 수 없어요."
  : /USE_HAPPYCALL_SCREEN/.test(m) ? "해피콜은 해피콜 탭에서 결과를 남겨 주세요."
  : /FORBIDDEN|NO_PERMISSION/.test(m) ? "권한이 없어요."
  : "불러오지 못했어요. 잠시 뒤 다시 해 주세요.";
const hcLate = (r: HcRow, day: string) => r.status === "기한지남" || (!!r.due_day && r.due_day < day);
const hcWhat = (r: HcRow) =>
  r.kind === "expiring" ? (r.membership ? `${r.membership}${r.min_remaining != null ? ` 잔여 ${r.min_remaining}회` : ""}` : r.reason)
  : r.kind === "new" ? `${r.membership || "등록"} ${md(r.registered_on)}`
  : r.kind === "lapsed" ? `최근 방문 ${md(r.last_visit_on)}`
  : [r.membership, r.last_visit_on ? `최근 방문 ${md(r.last_visit_on)}` : ""].filter(Boolean).join(" · ") || r.reason;

export default function WorkPage() {
  return <Suspense fallback={null}><Work /></Suspense>;
}

function Work() {
  const me = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const tab: Tab = (TAB_LIST.find((t) => t.k === sp.get("tab"))?.k) ?? "happycall";
  const go = (t: Tab) => router.replace(`/work?tab=${t}`, { scroll: false });

  const [branch, setBranch] = useState<string>(me.branch);
  const [data, setData] = useState<Today | null>(null);
  const [hc, setHc] = useState<HcRow[] | null>(null);
  const [err, setErr] = useState("");
  const [hcErr, setHcErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: HcRow; preset: string } | null>(null);

  const load = useCallback(async () => {
    const [w, h] = await Promise.all([
      sb.rpc("work_today", { p_branch: branch }),
      sb.rpc("happycall_list", { p_branch: branch }),
    ]);
    if (w.error) { setErr(errText(w.error.message)); setData(null); } else { setErr(""); setData(w.data as Today); }
    if (h.error || !Array.isArray(h.data)) {
      setHcErr(h.error?.message.includes("happycall_list") ? "해피콜 기능을 준비하고 있어요." : h.error ? errText(h.error.message) : "");
      setHc([]);
    } else { setHcErr(""); setHc(h.data as HcRow[]); }
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const day = data?.day ?? kst();
  const hcRows = hc ?? [];
  const hcOver = hcRows.filter((r) => hcLate(r, day));
  const overdue = data?.overdue ?? [];
  const approvals = data?.approvals.items ?? [];
  const certN = data?.approvals.manual_certs ?? 0;
  const remaining = data?.remaining ?? [];
  const checks = data?.checklist ?? [];
  const checksLeft = checks.filter((c) => !c.checked).length;
  const counts: Record<Tab, number | null> = {
    happycall: hc ? hcRows.length : null,
    overdue: data ? overdue.length + hcOver.length : null,
    approval: data ? (data.approvals.can ? approvals.length + certN : null) : null,
    remaining: data ? remaining.length + checksLeft : null,
  };

  const done = async (it: Item) => {
    setBusy(it.id);
    const { error } = await sb.rpc("work_item_done", { p_id: it.id });
    setBusy(null);
    if (error) return setErr(errText(error.message));
    load();
  };
  const toggle = async (c: Check) => {
    setBusy(c.id);
    setData((d) => d && { ...d, checklist: d.checklist.map((x) => (x.id === c.id ? { ...x, checked: !c.checked, checked_by: !c.checked ? me.name : null } : x)) });
    const { error } = await sb.rpc("task_check_set", { p_template: c.id, p_done: !c.checked, p_branch: branch });
    setBusy(null);
    if (error) setErr(errText(error.message));
    load();
  };

  return (
    <>
      <header className="top w-top">
        <h1>오늘 할 일</h1>
        <span className="sub">해피콜 · 지난 마감 · 승인 대기 · 남은 업무</span>
        <div className="w-pick">
          <select className="sel" aria-label="지점" value={branch} onChange={(e) => setBranch(e.target.value)}>
            {(me.tier === "owner" ? BRANCHES : [me.branch]).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="sel w-date" aria-label="날짜" value="today" onChange={() => load()}>
            <option value="today">오늘 · {md(day)}</option>
          </select>
        </div>
      </header>
      <nav className="w-tabs" role="tablist">
        {TAB_LIST.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? "on" : ""} onClick={() => go(t.k)}>
            {t.l}{counts[t.k] != null && <i>{counts[t.k]}</i>}
          </button>
        ))}
      </nav>
      <div className="page w-body">
        {err && <p className="w-err">{err}</p>}
        {tab === "happycall" && (
          <HappyTab rows={hcRows} loaded={!!hc} err={hcErr} day={day} meName={me.name} doneToday={data?.happycall.today_done ?? null}
            onLog={(row, preset) => setOpen({ row, preset })} />
        )}
        {tab === "overdue" && (
          <OverdueTab items={overdue} hc={hcOver} loaded={!!data} busy={busy} onDone={done}
            onHc={(row) => setOpen({ row, preset: "" })} />
        )}
        {tab === "approval" && data && (
          <ApprovalTab can={data.approvals.can} items={approvals} certN={certN} busy={busy} onDone={done} />
        )}
        {tab === "remaining" && (
          <RemainingTab items={remaining} checks={checks} loaded={!!data} busy={busy} onDone={done} onToggle={toggle} />
        )}
      </div>
      {open && <LogDrawer row={open.row} preset={open.preset} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </>
  );
}

function Kpis({ items }: { items: { k: string; v: string | number; u: string; s?: string; em?: boolean; on?: boolean; onClick?: () => void }[] }) {
  return (
    <div className="w-kpis">
      {items.map((x) => {
        const inner = (
          <>
            <span className="k">{x.k}</span>
            <span className={`v${x.em ? " em" : ""}`}>{x.v}{x.v !== "-" && <small>{x.u}</small>}</span>
            {x.s && <span className="s">{x.s}</span>}
          </>
        );
        return x.onClick
          ? <button key={x.k} type="button" className={`card w-kpi${x.on ? " on" : ""}`} aria-pressed={x.on} onClick={x.onClick}>{inner}</button>
          : <div key={x.k} className="card w-kpi">{inner}</div>;
      })}
    </div>
  );
}

/* ───────── 해피콜 ───────── */
function HappyTab({ rows, loaded, err, day, meName, doneToday, onLog }: {
  rows: HcRow[]; loaded: boolean; err: string; day: string; meName: string; doneToday: number | null;
  onLog: (r: HcRow, preset: string) => void;
}) {
  const [kind, setKind] = useState<Kind | "all">("all");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [n, setN] = useState(PAGE);
  useEffect(() => setN(PAGE), [kind, mine, q]);

  const isMine = useCallback((r: HcRow) => r.assignee === meName || r.manager === meName, [meName]);
  const base = useMemo(() => {
    const d = q.replace(/\D/g, "");
    return rows.filter((r) => !q || (r.name ?? "").includes(q) || (d.length >= 4 && (r.phone ?? "").replace(/\D/g, "").endsWith(d)));
  }, [rows, q]);
  const scoped = mine ? base.filter(isMine) : base;
  const cnt = (k: Kind) => scoped.filter((r) => r.kind === k).length;
  const list = useMemo(() => {
    const order: Record<string, number> = { 기한지남: 0, 진행: 1, 대기: 2 };
    return scoped.filter((r) => kind === "all" || r.kind === kind).sort((a, b) =>
      (hcLate(b, day) ? 1 : 0) - (hcLate(a, day) ? 1 : 0) || (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.last_visit_on ?? "").localeCompare(b.last_visit_on ?? ""));
  }, [scoped, kind, day]);
  const shown = list.slice(0, n);

  const late = rows.filter((r) => hcLate(r, day)).length;
  const away = rows.filter((r) => r.last_result === "부재").length;
  const total = rows.length;
  const rate = doneToday != null && doneToday + total > 0 ? Math.round((doneToday / (doneToday + total)) * 100) : null;

  // 직원별: 지금 남은 연락과 기한 지남 (완료 수는 서버에서 직원별로 주지 않아 비중으로 보여 줘요)
  const byStaff = useMemo(() => {
    const m = new Map<string, { left: number; late: number }>();
    for (const r of rows) {
      const who = r.assignee || r.manager || "미배정";
      const v = m.get(who) ?? { left: 0, late: 0 };
      v.left++; if (hcLate(r, day)) v.late++;
      m.set(who, v);
    }
    return [...m.entries()].sort((a, b) => b[1].left - a[1].left).slice(0, 6);
  }, [rows, day]);

  const res = (r: HcRow) =>
    hcLate(r, day) ? <span className="badge em">지난 마감</span>
    : r.last_result === "부재" ? <span className="badge warn">부재</span>
    : r.status === "진행" ? <span className="badge warn">재통화</span>
    : <span className="badge">대기</span>;
  const phone = (r: HcRow) => r.phone && !r.phone.includes("*") ? r.phone.replace(/[^\d]/g, "") : null;

  return (
    <>
      <Kpis items={[
        { k: "오늘 연락", v: loaded ? total : "-", u: "명", s: `지난 마감 ${late}명 포함`, em: total > 0 },
        { k: "완료", v: doneToday ?? "-", u: "명", s: rate != null ? `처리율 ${rate}%` : "오늘" },
        { k: "부재", v: loaded ? away : "-", u: "명", s: "다시 연락 예정" },
        { k: "예약 연결", v: "-", u: "건", s: "집계 준비 중" },
      ]} />
      <div className="w-chips">
        <button className={`chip ${kind === "all" && !mine ? "on" : ""}`} onClick={() => { setKind("all"); setMine(false); }}>전체 <i>{base.length}</i></button>
        {KIND_ORDER.map((k) => (
          <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(kind === k ? "all" : k)}>{KIND[k].l} <i>{cnt(k)}</i></button>
        ))}
        <button className={`chip ${mine ? "on" : ""}`} onClick={() => setMine((v) => !v)}>내 담당 <i>{base.filter(isMine).length}</i></button>
        <input className="inp w-q" placeholder="이름, 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value.trim())} />
      </div>
      {err && <p className="w-err">{err}</p>}
      <div className="w-hc">
        <section className="card w-tcard">
          <div className="w-x">
            <table className="t">
              <thead><tr><th>고객</th><th>연락처</th><th>연락 이유</th><th>내용</th><th>담당</th><th>결과</th><th></th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.kind}:${r.item_id ?? r.branch + r.customer_key}`}>
                    <td><button className="btn t sm w-nm" style={{ padding: 0, height: "auto" }} onClick={() => onLog(r, "")}>{r.name ?? "-"}</button></td>
                    <td className="num">{r.phone || "-"}</td>
                    <td><span className={`badge ${KIND[r.kind].badge}`}>{r.kind === "todo" ? r.reason || KIND.todo.l : KIND[r.kind].l}</span></td>
                    <td>{hcWhat(r)}</td>
                    <td>{r.assignee || r.manager || "-"}</td>
                    <td>{res(r)}</td>
                    <td className="w-act">
                      <div className="w-acts">
                        <button className="btn sm" onClick={() => onLog(r, "통화완료")}>통화됨</button>
                        <button className="btn sm" onClick={() => onLog(r, "부재")}>부재</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loaded && list.length === 0 && <tr><td colSpan={7} className="w-empty">오늘 연락할 고객이 없어요.</td></tr>}
                {!loaded && <tr><td colSpan={7} className="w-empty">불러오는 중이에요.</td></tr>}
              </tbody>
            </table>
          </div>
          {list.length > 0 && (
            <div className="w-foot num">
              <span>{PAGE}명씩 보기 · {list.length}명 중 {shown.length}명</span>
              {shown.length < list.length && <button className="btn sm" onClick={() => setN((v) => v + PAGE)}>더보기</button>}
            </div>
          )}
        </section>

        <div className="w-mlist">
          {shown.map((r) => (
            <article key={`m:${r.kind}:${r.item_id ?? r.branch + r.customer_key}`} className="card w-mcard">
              <div className="h">
                <b onClick={() => onLog(r, "")}>{r.name ?? "-"}</b>
                <span className={`badge ${KIND[r.kind].badge}`}>{r.kind === "todo" ? r.reason || KIND.todo.l : KIND[r.kind].l}</span>
              </div>
              <div className="d">{hcWhat(r)} · {r.assignee || r.manager || "미배정"}{hcLate(r, day) ? " · 지난 마감" : r.last_result === "부재" ? " · 부재" : ""}</div>
              <div className="a">
                {phone(r)
                  ? <a className="btn sm" href={`tel:${phone(r)}`}><PhoneIcon />전화</a>
                  : <button className="btn sm" disabled title="번호가 가려져 있어요"><PhoneIcon />전화</button>}
                <button className="btn sm" onClick={() => onLog(r, "통화완료")}>통화됨</button>
                <button className="btn sm" onClick={() => onLog(r, "부재")}>부재</button>
              </div>
            </article>
          ))}
          {loaded && list.length === 0 && <p className="w-none">오늘 연락할 고객이 없어요.</p>}
          {shown.length < list.length && <div className="w-hc-more"><button className="btn" onClick={() => setN((v) => v + PAGE)}>더보기 ({list.length - shown.length})</button></div>}
        </div>

        <aside className="w-side">
          <section className="card">
            <div className="hd"><h2>직원별 남은 연락<small>오늘</small></h2></div>
            {byStaff.length === 0 ? <p className="w-none">남은 연락이 없어요.</p> : (
              <table className="w-rate">
                <thead><tr><th>직원</th><th>비중</th><th className="n">남음</th><th className="n">지남</th></tr></thead>
                <tbody>
                  {byStaff.map(([who, v]) => {
                    const p = total ? Math.round((v.left / total) * 100) : 0;
                    return (
                      <tr key={who}>
                        <td>{who}</td>
                        <td><div className="w-bar"><span><b style={{ width: `${p}%` }} /></span><em>{p}%</em></div></td>
                        <td className="n">{v.left}</td>
                        <td className="n" style={{ color: v.late ? "var(--red)" : "var(--ink-4)" }}>{v.late}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <section className="card">
            <div className="hd"><h2>연락 이유 규칙</h2></div>
            <div className="w-rules">
              <div>만료 임박<span>잔여 2회 이하 · 14일 이내</span></div>
              <div>첫 방문 후<span>등록 14일 안 · 방문 다음 날</span></div>
              <div>미방문<span>22~120일</span></div>
              <div>예약표 할 일<span>뷰티사랑넷에서 매일</span></div>
              <div>부재<span>다음 연락일에 다시</span></div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M6.6 3.8l2.6.3 1.3 3.6-1.8 1.4a11 11 0 005.7 5.7l1.4-1.8 3.6 1.3.3 2.6c-.2 1.4-1.4 2.4-2.8 2.3C10.5 18.7 5.3 13.5 4.8 6.6c-.1-1.4.9-2.6 1.8-2.8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
);

/* ───────── 지난 마감 ───────── */
function OverdueTab({ items, hc, loaded, busy, onDone, onHc }: {
  items: Item[]; hc: HcRow[]; loaded: boolean; busy: string | null; onDone: (it: Item) => void; onHc: (r: HcRow) => void;
}) {
  const now = Date.now();
  const ageDays = (iso: string | null) => (iso ? Math.max(0, (now - new Date(iso).getTime()) / 864e5) : null);
  const hcAge = (r: HcRow) => (r.due_day ? ageDays(`${r.due_day}T18:00:00+09:00`) : null);
  type Row = { key: string; who: string; what: string; owner: string; due: string; age: number | null; act: () => void; dis: boolean };
  const rows: Row[] = [
    ...hc.map((r) => ({
      key: `h:${r.item_id ?? r.customer_key}`, who: r.name ?? "-", what: `해피콜 · ${r.kind === "todo" ? r.reason : KIND[r.kind].l}`,
      owner: r.assignee || r.manager || "미배정", due: r.due_day ? md(r.due_day) : "-", age: hcAge(r), act: () => onHc(r), dis: false,
    })),
    ...items.map((it) => ({
      key: it.id, who: "-", what: `${it.kind} · ${it.title ?? "-"}${it.note ? ` (${it.note})` : ""}`,
      owner: it.assignee ?? "미배정", due: dt(it.due_at), age: ageDays(it.due_at), act: () => onDone(it), dis: busy === it.id,
    })),
  ].sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  const ages = rows.map((r) => r.age).filter((x): x is number => x != null);
  const avg = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "-";
  const ageText = (d: number | null) => (d == null ? "-" : d < 1 ? `${Math.max(1, Math.round(d * 24))}시간 지남` : `${Math.floor(d)}일 지남`);

  return (
    <>
      <Kpis items={[
        { k: "지난 마감", v: loaded ? rows.length : "-", u: "건", s: "어제까지 끝냈어야 할 일", em: rows.length > 0 },
        { k: "해피콜", v: loaded ? hc.length : "-", u: "건", s: "연락 기한 지남" },
        { k: "업무", v: loaded ? items.length : "-", u: "건", s: "업무 기한 지남" },
        { k: "평균 지연", v: avg, u: "일" },
      ]} />
      <section className="card w-tcard">
        <div className="hd"><h2>마감 지난 일</h2><span className="meta num">{rows.length}건</span></div>
        <div className="w-x">
          <table className="t">
            <thead><tr><th>대상</th><th>할 일</th><th>담당</th><th>마감</th><th>지난 기간</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="w-nm">{r.who}</td>
                  <td className="w-wrap">{r.what}</td>
                  <td>{r.owner}</td>
                  <td className="num">{r.due}</td>
                  <td className="w-late num">{ageText(r.age)}</td>
                  <td className="w-act"><button className="btn sm" disabled={r.dis} onClick={r.act}>처리</button></td>
                </tr>
              ))}
              {loaded && rows.length === 0 && <tr><td colSpan={6} className="w-empty">마감 지난 일이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────── 승인 대기 ───────── */
function ApprovalTab({ can, items, certN, busy, onDone }: { can: boolean; items: Item[]; certN: number; busy: string | null; onDone: (it: Item) => void }) {
  const [f, setF] = useState<"all" | "req" | "cert">("all");
  if (!can) return <section className="card"><p className="w-none">승인은 권한이 있는 관리자만 할 수 있어요.</p></section>;
  const showItems = f !== "cert";
  return (
    <>
      <Kpis items={[
        { k: "승인 대기", v: items.length + certN, u: "건", em: items.length + certN > 0 },
        { k: "승인 요청", v: items.length, u: "건", s: "직원이 올린 요청" },
        { k: "수동 인증", v: certN, u: "건", s: "최근 7일 확인 전" },
        { k: "오늘 승인", v: "-", u: "건", s: "집계 준비 중" },
      ]} />
      <div className="w-chips">
        <button className={`chip ${f === "all" ? "on" : ""}`} onClick={() => setF("all")}>전체 <i>{items.length + certN}</i></button>
        <button className={`chip ${f === "req" ? "on" : ""}`} onClick={() => setF("req")}>승인 요청 <i>{items.length}</i></button>
        <button className={`chip ${f === "cert" ? "on" : ""}`} onClick={() => setF("cert")}>수동 인증 <i>{certN}</i></button>
      </div>
      <section className="card w-tcard">
        <div className="w-x">
          <table className="t">
            <thead><tr><th>종류</th><th>내용</th><th>요청</th><th>기한</th><th></th></tr></thead>
            <tbody>
              {showItems && items.map((it) => (
                <tr key={it.id}>
                  <td><span className="badge">{it.kind}</span></td>
                  <td className="w-wrap"><span className="w-nm">{it.title ?? "-"}</span>{it.note && <div className="w-sub">{it.note}</div>}</td>
                  <td>{it.assignee ?? "-"}</td>
                  <td className="num">{dt(it.due_at)}</td>
                  <td className="w-act">
                    <div className="w-acts">
                      <button className="btn sm" disabled title="반려 기능은 준비 중이에요">반려</button>
                      <button className="btn sm" disabled={busy === it.id} onClick={() => onDone(it)}>승인</button>
                    </div>
                  </td>
                </tr>
              ))}
              {f !== "req" && certN > 0 && (
                <tr>
                  <td><span className="badge">수동 인증</span></td>
                  <td className="w-wrap"><span className="w-nm">식단·운동 수동 인증 {certN}건</span><div className="w-sub">확인 화면은 고객 앱 연결 뒤 열려요.</div></td>
                  <td>-</td><td className="num">최근 7일</td><td className="w-acts" />
                </tr>
              )}
              {(showItems ? items.length : 0) + (f !== "req" ? certN : 0) === 0 && <tr><td colSpan={5} className="w-empty">승인할 것이 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ───────── 남은 업무 ───────── */
function RemainingTab({ items, checks, loaded, busy, onDone, onToggle }: {
  items: Item[]; checks: Check[]; loaded: boolean; busy: string | null; onDone: (it: Item) => void; onToggle: (c: Check) => void;
}) {
  const [mine, setMine] = useState(false);
  const list = mine ? items.filter((x) => x.mine) : items;
  const left = checks.filter((c) => !c.checked).length;
  const cycles = [...new Set(checks.map((c) => c.cycle))].join(" · ");
  return (
    <>
      <Kpis items={[
        { k: "남은 업무", v: loaded ? items.length + left : "-", u: "건", s: `체크리스트 ${left} · 업무 ${items.length}`, em: items.length + left > 0 },
        { k: "완료", v: loaded ? checks.length - left : "-", u: "건", s: "오늘 체크" },
        { k: "내 업무", v: loaded ? items.filter((x) => x.mine).length : "-", u: "건", s: mine ? "내 업무만 보는 중" : "누르면 내 업무만", on: mine, onClick: () => setMine((v) => !v) },
        { k: "반복 업무", v: loaded ? checks.length : "-", u: "개", s: "오늘 체크리스트" },
      ]} />
      <div className="w-two">
        <section className="card">
          <div className="hd"><h2>오늘 업무</h2><span className="meta">{cycles || "체크리스트"}</span></div>
          {checks.length === 0 ? <p className="w-none">{loaded ? "등록된 체크리스트가 없어요." : "불러오는 중이에요."}</p> : (
            <div>
              {checks.map((c) => (
                <label key={c.id} className={`w-check${c.checked ? " done" : ""}`}>
                  <input type="checkbox" checked={c.checked} disabled={busy === c.id} onChange={() => onToggle(c)} />
                  <span className="badge">{c.cycle}</span>
                  <span className="t">{c.title}</span>
                  {c.checked && c.checked_by && <span className="who">{c.checked_by}</span>}
                </label>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="hd"><h2>요청 업무</h2><span className="meta num">{mine ? "내 업무 " : "오늘 기한 "}{list.length}건</span></div>
          {list.length === 0 ? <p className="w-none">{loaded ? "오늘 남은 업무가 없어요." : "불러오는 중이에요."}</p> : list.map((it) => (
            <div key={it.id} className="w-req">
              <div className="t">
                <b>{it.title ?? "-"}</b>
                <span className="w-sub">{it.kind} · {it.assignee ?? "미배정"}{it.due_at ? ` · ${dt(it.due_at)}` : ""}{it.note ? ` · ${it.note}` : ""}</span>
              </div>
              <button className="btn sm" disabled={busy === it.id} onClick={() => onDone(it)}>완료</button>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
