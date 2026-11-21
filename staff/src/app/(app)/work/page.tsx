"use client";
import { Suspense, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sb, TIER_LABEL, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { useTopBranch } from "@/lib/branch";
import ApprovalBoard from "@/lib/ApprovalBoard";
import "./work.css";
import "./work3.css";
import { HcRow, LogDrawer, kst } from "./log-drawer";
import HcV3 from "./HcV3";
import WorkReq from "./WorkReq";

// 오늘 할 일 (v3 확정 시안 U-PC-TODO-1~4 · U-MO-TODO-1~4): 해피콜 · 지난 마감 · 승인 대기 · 남은 업무
// 데이터: work_today + happycall_list. 기록: work_item_done/assign/reopen/add(053) · task_check_set · rsv_work_memo_*(인수인계)

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
type Toast = { text: string; undo?: () => Promise<void> | void };

const md = (s: string) => `${Number(s.slice(5, 7))}.${s.slice(8, 10)}`;
const kdt = (iso: string) => { const k = new Date(new Date(iso).getTime() + 9 * 36e5).toISOString(); return `${md(k.slice(0, 10))} ${k.slice(11, 16)}`; };
const hhmmK = (iso: string) => new Date(new Date(iso).getTime() + 9 * 36e5).toISOString().slice(11, 16);
const errText = (m: string) =>
  /Could not find the function|does not exist|PGRST202/.test(m) ? "이 기능은 서버 준비 중이에요. 053 SQL을 실행하면 열려요."
  : /FORBIDDEN_BRANCH/.test(m) ? "이 지점 업무는 볼 수 없어요."
  : /USE_HAPPYCALL_SCREEN/.test(m) ? "해피콜은 해피콜 탭에서 결과를 남겨 주세요."
  : /TOO_LATE/.test(m) ? "5분이 지나서 되돌릴 수 없어요."
  : /FORBIDDEN|NO_PERMISSION/.test(m) ? "권한이 없어요."
  : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";
const hcLate = (r: HcRow, day: string) => r.status === "기한지남" || (!!r.due_day && r.due_day < day);
// 업무 추가의 구분(오전·오후·마감) = 마감 시각
const CYCLE_DUE: Record<string, string> = { 오전: "12:00", 오후: "18:00", 마감: "22:00" };
const cycleOf = (it: Item) => { if (!it.due_at) return "마감"; const h = hhmmK(it.due_at); return h <= "12:00" ? "오전" : h <= "18:00" ? "오후" : "마감"; };
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Info = () => <svg className="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" {...P} /><path d="M12 11v5M12 8h.01" {...P} /></svg>;

export default function WorkPage() {
  return <Suspense fallback={null}><Work /></Suspense>;
}

function Work() {
  const me = useMe();
  const router = useRouter();
  const sp = useSearchParams();
  const tab: Tab = (TAB_LIST.find((t) => t.k === sp.get("tab"))?.k) ?? "happycall";
  const go = (t: Tab) => router.replace(`/work?tab=${t}`, { scroll: false });
  const lead = me.tier === "owner" || me.tier === "manager";

  const [branch, setBranch] = useTopBranch(me);
  const [data, setData] = useState<Today | null>(null);
  const [hc, setHc] = useState<HcRow[] | null>(null);
  const [staff, setStaff] = useState<string[]>([]);
  const [apN, setApN] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ row: HcRow; preset: string } | null>(null);
  const [prog, setProg] = useState<{ left: number; done: number; total: number } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((t: Toast) => { setToast(t); if (tt.current) clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 6000); }, []);
  const onCount = useCallback((left: number, done: number, total: number) => setProg({ left, done, total }), []);
  useEffect(() => setProg(null), [branch]);

  const load = useCallback(async () => {
    const [w, h, s, a] = await Promise.all([
      sb.rpc("work_today", { p_branch: branch }),
      sb.rpc("happycall_list", { p_branch: branch }),
      sb.from("staff_accounts").select("name").eq("branch", branch).eq("status", "active").order("name"),
      sb.rpc("approval_list", { p_branch: branch, p_status: null }),
    ]);
    if (w.error) { setErr(errText(w.error.message)); setData(null); } else { setErr(""); setData(w.data as Today); }
    setHc(h.error || !Array.isArray(h.data) ? [] : (h.data as HcRow[]));
    setStaff(((s.data ?? []) as { name: string }[]).map((x) => x.name));
    setApN(a.error || !Array.isArray(a.data) ? null : (a.data as { status: string }[]).filter((x) => x.status === "대기").length);
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const day = data?.day ?? kst();
  const hcOver = (hc ?? []).filter((r) => hcLate(r, day));
  const mineOnly = <T extends { assignee: string | null }>(xs: T[]) => (lead ? xs : xs.filter((x) => x.assignee === me.name || x.assignee === me.login_id));
  const overdue = mineOnly(data?.overdue ?? []);
  const hcOverMine = lead ? hcOver : hcOver.filter((r) => (r.assignee || r.manager) === me.name);
  const remaining = mineOnly(data?.remaining ?? []);
  const checks = data?.checklist ?? [];
  const counts: Record<Tab, number | null> = {
    happycall: prog ? prog.left : hc ? hc.length : null,
    overdue: data ? overdue.length + hcOverMine.length : null,
    approval: apN,
    remaining: data ? remaining.length + checks.filter((c) => !c.checked).length : null,
  };

  return (
    <div className="wv3">
      <header className="wv3-sub">
        <div className="wv3-mrow">
          <h1>오늘 할 일</h1>
          {(tab === "overdue" || tab === "happycall") && <BranchSel tier={me.tier} branch={branch} set={setBranch} />}
          {tab === "remaining" && lead && <AddWork branch={branch} staff={staff} onDone={(t) => { load(); say({ text: t }); }} />}
        </div>
        <div className="sg">
          {TAB_LIST.map((t) => (
            <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => go(t.k)}>
              {t.l}{counts[t.k] != null && <span className="c num">{counts[t.k]}</span>}
            </button>
          ))}
        </div>
      </header>
      <div className="wv3-page">
        {err && <p className="wv3-err">{err}</p>}
        {tab === "happycall" && <HcV3 branch={branch} today={day} onCount={onCount} />}
        {tab === "overdue" && (
          <Overdue branchSel={<BranchSel tier={me.tier} branch={branch} set={setBranch} />} items={overdue} hc={hcOverMine} loaded={!!data} lead={lead} staff={staff} day={day}
            onHc={(row) => setOpen({ row, preset: "" })} reload={load} say={say} />
        )}
        {tab === "approval" && <ApprovalBoard branch={branch} />}
        {tab === "remaining" && (
          <Remaining staff={staff} add={lead ? <AddWork branch={branch} staff={staff} onDone={(t) => { load(); say({ text: t }); }} /> : null} items={remaining} checks={checks} loaded={!!data} lead={lead} branch={branch} day={day} reload={load} say={say}
            setChecks={(f) => setData((d) => d && { ...d, checklist: f(d.checklist) })} />
        )}
      </div>
      {open && <LogDrawer row={open.row} preset={open.preset} onClose={() => setOpen(null)}
        onDone={() => { const n = open.row.name ?? "고객"; setOpen(null); load(); say({ text: `${n} 해피콜을 처리한 것으로 남겼어요.` }); }} />}
      {toast && (
        <div className="wv3-toast" role="status">
          {toast.text}
          {toast.undo && <button onClick={async () => { const u = toast.undo!; setToast(null); await u(); }}>되돌리기</button>}
        </div>
      )}
    </div>
  );
}

/* ───────── 지난 마감 (U-PC-TODO-2 · 담당변경 · 처리완료 · 빈화면) ───────── */
type ORow = { key: string; id: string | null; hc: HcRow | null; who: string; what: string; group: "해피콜" | "확인"; owner: string; due: string; days: number; mine: boolean };
function Overdue({ branchSel, items, hc, loaded, lead, staff, day, onHc, reload, say }: {
  branchSel: ReactNode; items: Item[]; hc: HcRow[]; loaded: boolean; lead: boolean; staff: string[]; day: string;
  onHc: (r: HcRow) => void; reload: () => void; say: (t: Toast) => void;
}) {
  const me = useMe();
  const [f, setF] = useState<"all" | "해피콜" | "확인" | "mine">(lead ? "all" : "mine");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [log, setLog] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const today0 = Date.parse(`${day}T00:00:00+09:00`);
  const ago = (ms: number) => Math.max(1, Math.ceil((today0 - ms) / 864e5));
  const rows: ORow[] = [
    ...hc.map((r) => ({
      key: `h:${r.item_id ?? r.customer_key}`, id: r.item_id, hc: r, who: r.name ?? "-", what: "해피콜", group: "해피콜" as const,
      owner: r.assignee || r.manager || "미배정", due: r.due_day ? `${md(r.due_day)} 18:00` : "-",
      days: r.due_day ? ago(Date.parse(`${r.due_day}T18:00:00+09:00`)) : 1, mine: (r.assignee || r.manager) === me.name,
    })),
    ...items.map((it) => ({
      key: it.id, id: it.id, hc: null, who: it.note || "-", what: it.title || it.kind, group: "확인" as const,
      owner: it.assignee ?? "미배정", due: it.due_at ? kdt(it.due_at) : "-", days: it.due_at ? ago(Date.parse(it.due_at)) : 1, mine: it.mine,
    })),
  ].sort((a, b) => b.days - a.days);
  const nH = rows.filter((r) => r.group === "해피콜").length, nW = rows.length - nH;
  const oldest = rows.reduce((a, r) => Math.max(a, r.days), 0);
  const list = rows.filter((r) => f === "all" || (f === "mine" ? r.mine : r.group === f));

  const finish = async (r: ORow) => {
    if (r.hc) return onHc(r.hc);
    const { error } = await sb.rpc("work_item_done", { p_id: r.id });
    if (error) return say({ text: errText(error.message) });
    setDone((s) => new Set(s).add(r.key));
    say({
      text: `${r.what}을(를) 처리한 것으로 남겼어요.`,
      undo: async () => {
        const u = await sb.rpc("work_item_reopen", { p_id: r.id });
        if (u.error) return say({ text: errText(u.error.message) });
        setDone((s) => { const n = new Set(s); n.delete(r.key); return n; });
      },
    });
  };
  const assign = async (r: ORow, to: string) => {
    setPick(null);
    if (!r.id || to === r.owner) return;
    const { error } = await sb.rpc("work_item_assign", { p_id: r.id, p_assignee: to });
    if (error) return say({ text: errText(error.message) });
    const at = new Date(Date.now() + 9 * 36e5).toISOString().slice(11, 16);
    setLog(`${me.name} ${me.title || TIER_LABEL[me.tier]} · 오늘 ${at} · ${r.owner} → ${to}`);
    reload();
    say({ text: `${r.who} ${r.what} 담당을 ${to}(으)로 바꿨어요.`, undo: async () => { await sb.rpc("work_item_assign", { p_id: r.id, p_assignee: r.owner === "미배정" ? "" : r.owner }); setLog(""); reload(); } });
  };

  return (
    <>
      <div className="wv3-capr"><span className="wv3-cap">어제까지 못 끝낸 일을 모아 두었어요.</span>{branchSel}</div>
      <div className="wv3-kpis num">
        <div className="card"><b>{loaded ? rows.length : "-"}</b><span>지난 일</span></div>
        <div className="card"><b>{loaded ? nH : "-"}</b><span>해피콜</span></div>
        <div className="card"><b>{loaded ? nW : "-"}</b><span>확인</span></div>
        <div className="card"><b className={oldest ? "red" : ""}>{loaded ? (oldest ? `${oldest}일` : "—") : "-"}</b><span>가장 오래됨</span></div>
      </div>
      <div className="wv3-chips">
        {!lead && <button className={f === "mine" ? "on" : ""} onClick={() => setF("mine")}>내 담당 <span className="num">{rows.filter((r) => r.mine).length}</span></button>}
        {lead && <button className={f === "all" ? "on" : ""} onClick={() => setF("all")}>전체 <span className="num">{rows.length}</span></button>}
        <button className={f === "해피콜" ? "on" : ""} onClick={() => setF("해피콜")}>해피콜 <span className="num">{nH}</span></button>
        <button className={f === "확인" ? "on" : ""} onClick={() => setF("확인")}>확인 <span className="num">{nW}</span></button>
      </div>
      {log && <div className="card wv3-info"><Info /><span className="bdg">기록</span>{log}</div>}
      <section className="card wv3-tbl">
        {list.length === 0 ? <p className="wv3-empty">{loaded ? "지난 마감에 남은 일이 없어요." : "불러오는 중이에요."}</p> : (
          <table>
            <thead><tr><th>대상</th><th>할 일</th><th>담당</th><th>마감</th><th>지난 기간</th><th /></tr></thead>
            <tbody>
              {list.map((r) => {
                const isDone = done.has(r.key);
                return (
                  <tr key={r.key} className={isDone ? "done" : ""}>
                    <td data-label="대상"><b>{r.who}</b></td>
                    <td data-label="할 일">{r.what}</td>
                    <td data-label="담당" className="wv3-own">
                      <button className="btn3 sm" disabled={!lead || !r.id || isDone} onClick={() => setPick(pick === r.key ? null : r.key)}>{r.owner}</button>
                      {pick === r.key && (
                        <div className="wv3-pop">
                          {staff.map((s) => <button key={s} className={s === r.owner ? "on" : ""} onClick={() => assign(r, s)}>{s}</button>)}
                        </div>
                      )}
                    </td>
                    <td data-label="마감" className="num">{r.due}</td>
                    <td data-label="지난 기간" className="num">{r.days}일</td>
                    <td className="wv3-act">{isDone ? <span className="cap">처리됨</span> : <button className="btn3 sm" onClick={() => finish(r)}>처리</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <div className="wv3-mcards">
        {list.length === 0 && <section className="card"><p className="wv3-empty">{loaded ? "지난 마감에 남은 일이 없어요." : "불러오는 중이에요."}</p></section>}
        {list.map((r) => {
          const isDone = done.has(r.key);
          return (
            <section key={r.key} className={`card wv3-mc${isDone ? " done" : ""}`}>
              <div className="h"><b>{r.who}</b><span className="late num">{r.days}일</span></div>
              <div className="w">{r.what}</div>
              <div className="m">담당 {r.owner} · 마감 <span className="num">{r.due}</span></div>
              <div className="a">
                {isDone ? <span className="cap">처리됨</span> : <button className="btn3" onClick={() => finish(r)}>처리</button>}
                <button className="btn3" disabled={!lead || !r.id || isDone} onClick={() => setPick(pick === `m:${r.key}` ? null : `m:${r.key}`)}>담당 바꾸기</button>
              </div>
              {pick === `m:${r.key}` && (
                <div className="wv3-pop m">
                  {staff.map((s) => <button key={s} className={s === r.owner ? "on" : ""} onClick={() => assign(r, s)}>{s}</button>)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

// 지점 선택: 대표관리자만 바꿀 수 있어요 (상단바와 같은 값)
function BranchSel({ tier, branch, set }: { tier: string; branch: string; set: (b: string) => void }) {
  if (tier !== "owner") return <span className="wv3-bsel lock">{branch}</span>;
  return (
    <select className="wv3-bsel" value={branch} onChange={(e) => set(e.target.value)} aria-label="지점">
      {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
}

/* ───────── 남은 업무 (U-PC-TODO-4 · 완료 · 직원 · 빈화면) + 인수인계 ───────── */
function Remaining({ staff, add, items, checks, loaded, lead, branch, day, reload, say, setChecks }: {
  staff: string[]; add: ReactNode; items: Item[]; checks: Check[]; loaded: boolean; lead: boolean; branch: string; day: string;
  reload: () => void; say: (t: Toast) => void; setChecks: (f: (c: Check[]) => Check[]) => void;
}) {
  const me = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const [doneItems, setDoneItems] = useState<Set<string>>(new Set());
  type Row = { key: string; title: string; who: string; done: boolean; toggle: () => void };
  const toggleCheck = async (c: Check) => {
    setBusy(c.id);
    const next = !c.checked;
    setChecks((cs) => cs.map((x) => (x.id === c.id ? { ...x, checked: next, checked_by: next ? me.name : null } : x)));
    const { error } = await sb.rpc("task_check_set", { p_template: c.id, p_done: next, p_branch: branch });
    setBusy(null);
    if (error) { say({ text: errText(error.message) }); return reload(); }
    if (next) say({ text: `${c.title}을(를) 완료로 남겼어요.`, undo: async () => { setChecks((cs) => cs.map((x) => (x.id === c.id ? { ...x, checked: false, checked_by: null } : x))); await sb.rpc("task_check_set", { p_template: c.id, p_done: false, p_branch: branch }); } });
  };
  const doneItem = async (it: Item) => {
    setBusy(it.id);
    const { error } = await sb.rpc("work_item_done", { p_id: it.id });
    setBusy(null);
    if (error) return say({ text: errText(error.message) });
    setDoneItems((s) => new Set(s).add(it.id));
    say({ text: `${it.title ?? "업무"}을(를) 완료로 남겼어요.`, undo: async () => {
      const u = await sb.rpc("work_item_reopen", { p_id: it.id });
      if (u.error) return say({ text: errText(u.error.message) });
      setDoneItems((s) => { const n = new Set(s); n.delete(it.id); return n; });
    } });
  };
  const groups = useMemo(() => {
    const order = ["오전", "오후", "주간", "월간", "마감"];
    const g = new Map<string, Row[]>();
    const push = (k: string, r: Row) => { if (!g.has(k)) g.set(k, []); g.get(k)!.push(r); };
    checks.forEach((c) => push(c.cycle, { key: c.id, title: c.title, who: c.checked_by ?? "", done: c.checked, toggle: () => toggleCheck(c) }));
    items.forEach((it) => push(cycleOf(it), { key: it.id, title: it.title ?? it.kind, who: it.assignee ?? "", done: doneItems.has(it.id), toggle: () => !doneItems.has(it.id) && doneItem(it) }));
    return [...g.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [checks, items, doneItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = groups.reduce((a, [, rs]) => a + rs.length, 0);
  return (
    <>
    <div className="wv3-capr rem"><span className="wv3-cap">{lead ? "오늘 근무에 남은 일을 확인하고 체크해요." : "내가 담당했거나 요청한 일과 내 인수인계 메모만 보여요."}</span></div>
    <div className="wv3-rem">
      <div className="wv3-left">
        <WorkReq branch={branch} staff={staff} lead={lead} say={say} />
        {total === 0 && <section className="card"><p className="wv3-empty">{loaded ? "오늘 남은 업무가 없어요." : "불러오는 중이에요."}</p></section>}
        {groups.map(([k, rs]) => (
          <div key={k}>
            <div className="wv3-sech"><h2>{k}</h2><span className="num">{rs.length}건</span></div>
            <section className="card wv3-clist">
              {rs.map((r) => (
                <label key={r.key} className={`wv3-crow${r.done ? " done" : ""}`}>
                  <input type="checkbox" checked={r.done} disabled={busy === r.key} onChange={r.toggle} />
                  <span className="t">{r.title}</span>
                  <span className="m">{r.who}</span>
                </label>
              ))}
            </section>
          </div>
        ))}
      </div>
      <Handover add={add} branch={branch} day={day} say={say} />
    </div>
    </>
  );
}

// 인수인계: 어제 메모(읽기) + 오늘 메모(쓰기) — 예약 화면 '업무 메모'와 같은 기록(rsv_work_memo)
type Memo = { id: string; day: string; body: string; author: string; created_at: string };
function Handover({ add, branch, day, say }: { add: ReactNode; branch: string; day: string; say: (t: Toast) => void }) {
  const y = new Date(Date.parse(`${day}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const [prev, setPrev] = useState<Memo | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    sb.rpc("rsv_work_memo_list", { p_branch: branch, p_from: y, p_to: day }).then(({ data, error }) => {
      const ms = (error ? [] : (data ?? [])) as Memo[];
      const last = (d: string) => ms.filter((m) => m.day === d).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
      setPrev(last(y));
      const t = last(day);
      if (t) setText((s) => s || t.body);
    });
  }, [branch, y, day]);
  useEffect(load, [load]);
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const { data, error } = await sb.rpc("rsv_work_memo_add", { p_branch: branch, p_day: day, p_body: text.trim() });
    setBusy(false);
    if (error) return say({ text: errText(error.message) });
    const id = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
    say({ text: "인수인계 메모를 남겼어요.", undo: id ? async () => { await sb.rpc("rsv_work_memo_del", { p_id: id }); } : undefined });
  };
  return (
    <aside className="wv3-panel">
      <div className="ph"><h2>인수인계</h2>{add}</div>
      <div className="pb">
        <div className="fld"><label>어제 메모</label><div className="prev">{prev ? `어제 ${prev.author || "직원"} · ${prev.body}` : prev === null ? "어제 남긴 메모가 없어요." : "불러오는 중…"}</div></div>
        <div className="fld"><label htmlFor="wv3-memo">오늘 메모</label><textarea id="wv3-memo" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div className="help">저장하면 기록에 남아요. 이 메모는 되돌릴 수 있어요.</div>
      </div>
      <div className="pf"><button className="btn3" disabled={busy || !text.trim()} onClick={save}>메모 저장</button></div>
    </aside>
  );
}

// + 업무 추가 (U-MO-TODO-4_업무추가): 할 일 · 구간(오전·오후·마감) · 담당
function AddWork({ branch, staff, onDone }: { branch: string; staff: string[]; onDone: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [cyc, setCyc] = useState("오후");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const add = async () => {
    setBusy(true); setErr("");
    const d = kst();
    const { error } = await sb.rpc("work_item_add", { p_branch: branch, p_title: title.trim(), p_assignee: who || null, p_due_at: `${d}T${CYCLE_DUE[cyc]}:00+09:00`, p_note: null });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    setOpen(false); setTitle(""); onDone(`${title.trim()}을(를) ${cyc} 업무로 추가했어요.`);
  };
  return (
    <>
      <button className="btn3 sm wv3-add" onClick={() => setOpen(true)}>+ 업무 추가</button>
      {open && (
        <>
          <div className="wv3-dim" onClick={() => setOpen(false)} />
          <div className="wv3-sheet" role="dialog" aria-label="업무 추가">
            <i className="grab" /><div className="ph"><h2>업무 추가</h2><button className="btn3 sm g" onClick={() => setOpen(false)}>닫기</button></div>
            <div className="pb">
              <div className="fld"><label htmlFor="wv3-t">할 일</label><input id="wv3-t" className="inp3" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="예: 오후 재고 확인" /></div>
              <div className="fld"><label>구간</label><div className="pills">{["오전", "오후", "마감"].map((c) => <button key={c} className={cyc === c ? "on" : ""} onClick={() => setCyc(c)}>{c}</button>)}</div></div>
              <div className="fld"><label>담당</label><div className="pills">{staff.map((s) => <button key={s} className={who === s ? "on" : ""} onClick={() => setWho(who === s ? "" : s)}>{s}</button>)}</div></div>
              {err && <p className="wv3-err">{err}</p>}
            </div>
            <div className="pf two"><button className="btn3" onClick={() => setOpen(false)}>닫기</button><button className="btn3 p" disabled={busy || !title.trim()} onClick={add}>추가</button></div>
          </div>
        </>
      )}
    </>
  );
}
