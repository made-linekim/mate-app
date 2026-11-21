"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, BRANCHES, TIER_LABEL, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { useTopBranch } from "@/lib/branch";
import type { PermMap } from "@/lib/perm";
import { HelpD, Msg, PageH, Toast } from "../kit";
import { COLS, MANAGER, canToggle, curSt, roleSt, valOf, type Col, type Preset, type St } from "./roles";

/* 권한 (메라 시안 U-PC-SET-12)
   대표관리자: 12_권한대표 — 역할별 기본 권한 · 받은 변경 요청 · 직원별 권한(역할 고르기 + 토글 6칸) · [변경 기록] [저장]
               12_권한_요청처리 — 요청 [보기] → 오른쪽 '변경 요청 보기' (거절 / 승인)
   관리자:     12_권한_지점장 — 보기만 (잠긴 체크) · [변경 요청] → 오른쪽 '변경 요청' → 12_권한_변경요청완료 알림
   요청은 070 approval_request(kind perm_change). 승인은 기록만 남고, 권한은 대표관리자가 직원별 권한에서 바꿔 저장해요. */

type Req = {
  id: string; branch: string; kind: string; target_id: string; payload: { staff_name?: string } | null; reason: string;
  status: string; requested_by: string; requested_name: string; requested_at: string; decided_name: string | null;
};
type LogRow = { at: string; actor_name: string; target_type: string; target_name: string; summary: string };
type Draft = Record<string, { tier: "manager" | "staff"; perms: PermMap }>;

const P = {
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  undo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  chr: '<path d="m9 18 6-6-6-6"/>',
  chd: '<path d="m6 9 6 6 6-6"/>',
  store: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M10 21v-5h4v5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
};
const I = ({ n }: { n: keyof typeof P }) => <svg className="i" viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: P[n] }} />;

const roleLabel = (t: string) => (t === "owner" ? "대표관리자" : t === "manager" ? "관리자" : "직원");
function when(iso: string) {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600e3).toISOString();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const hm = k.slice(11, 16);
  return k.slice(0, 10) === today ? `오늘 ${hm}` : `${k.slice(5, 7)}.${k.slice(8, 10)} ${hm}`;
}
const stLabel = (s: string) => (s === "반려" ? "거절" : s);
const stCls = (s: string) => (s === "대기" ? "amb" : s === "승인" || s === "바로 처리" ? "grn" : "");

export default function PermsPage() {
  const me = useMe();
  const owner = me.tier === "owner";
  const [top] = useTopBranch(me);
  const [list, setList] = useState<Staff[]>([]);
  const [catalog, setCatalog] = useState<Perm[]>([]);
  const [mgr, setMgr] = useState<PermMap>({});
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: p }, tp] = await Promise.all([
      sb.from("staff_accounts").select("*").order("tier").order("name"),
      sb.from("perm_catalog").select("*").order("sort"),
      sb.from("staff_title_perms").select("name,perms,sort").eq("name", MANAGER),
    ]);
    if (error) setErr(error.message);
    setList((s ?? []) as Staff[]); setCatalog((p ?? []) as Perm[]);
    setMgr(((tp.data ?? []) as Preset[])[0]?.perms ?? {});
    const r = await sb.rpc("approval_list", { p_branch: owner ? null : me.branch, p_status: null });
    setReqs(r.error ? null : ((r.data ?? []) as Req[]).filter((x) => x.kind === "perm_change"));
  }, [owner, me.branch]);
  useEffect(() => { load(); }, [load]);

  if (me.tier === "staff") return (<div className="ct"><PageH title="권한" sub="보기만" /><div className="body"><HelpD>대표관리자 · 관리자만 볼 수 있어요.</HelpD></div></div>);
  const people = list.filter((s) => s.tier !== "owner" && s.status !== "resigned");
  const props = { me, list: people, catalog, mgr, reqs, err, reload: load, toast: setToast };
  return (
    <>
      {owner ? <OwnerView {...props} top={top} /> : <ManagerView {...props} />}
      <Toast text={toast} onDone={() => setToast("")} />
    </>
  );
}

type VP = { me: Staff; list: Staff[]; catalog: Perm[]; mgr: PermMap; reqs: Req[] | null; err: string; reload: () => Promise<void>; toast: (t: string) => void };

/* 역할별 기본 권한 칸 (대표 화면: 배지 · 관리자 화면: 잠긴 체크) */
function RoleCell({ st, c, owner, v3 }: { st: St | "all"; c: Col; owner: boolean; v3: boolean }) {
  if (v3) {
    if (st === "all") return <span className="lk"><I n="lock" />전 지점</span>;
    if (c.fixed && owner) return <span className="bdg">보기</span>;
    if (st === "on") return <span className="ok"><I n="check" />자기 지점</span>;
    if (st === "req") return <span className="bdg amb">요청</span>;
    return c.view ? <span className="bdg">보기</span> : <span className="no">없음</span>;
  }
  if (st === "all") return <span className="ck on lock" title="할 수 있음"><I n="check" /></span>;
  if (c.fixed && owner) return <span className="celltxt">보기만</span>;
  if (st === "on") return <><span className="ck on lock" title="할 수 있음"><I n="check" /></span> <span className="celltxt">자기 지점</span></>;
  if (st === "req") return <span className="celltxt">요청</span>;
  return c.view ? <span className="celltxt">보기</span> : c.fixed ? <span className="ck lock" title="못 함" /> : <span className="celltxt">없음</span>;
}

/* ───────── 대표관리자 (12_권한대표 · 12_권한_요청처리) ───────── */
function OwnerView({ list, catalog, mgr, reqs, err, reload, toast, me, top }: VP & { top: string }) {
  const [br, setBr] = useState<string>("all");
  const [draft, setDraft] = useState<Draft>({});
  const [open, setOpen] = useState<Req | null>(null);
  const [allReq, setAllReq] = useState(false);
  const [logs, setLogs] = useState<LogRow[] | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setBr("all"); }, [top]);

  const rowOf = (s: Staff) => draft[s.id] ?? { tier: s.tier as "manager" | "staff", perms: s.perms ?? {} };
  const shown = list.filter((s) => br === "all" || s.branch === br);
  const dirty = Object.keys(draft).length > 0;
  const exN = (s: Staff) => { const r = rowOf(s); return COLS.filter((c) => (curSt(r, c, catalog) === "on") !== (roleSt(r.tier, c, catalog, mgr) === "on")).length; };
  const pending = (reqs ?? []).filter((r) => r.status === "대기");
  const reqRows = allReq ? (reqs ?? []) : (reqs ?? []).slice(0, 3);

  function setRow(s: Staff, next: { tier: "manager" | "staff"; perms: PermMap }) {
    const same = next.tier === s.tier && COLS.every((c) => JSON.stringify(next.perms?.[c.k] ?? null) === JSON.stringify(s.perms?.[c.k] ?? null));
    const d = { ...draft }; if (same) delete d[s.id]; else d[s.id] = next; setDraft(d);
  }
  const defaults = (tier: "manager" | "staff", perms: PermMap) => {
    const p = { ...perms };
    for (const c of COLS) if (!c.fixed && canToggle(tier, c, catalog)) p[c.k] = valOf(c, roleSt(tier, c, catalog, mgr));
    return p;
  };
  const flip = (s: Staff, c: Col) => {
    const r = rowOf(s);
    if (!canToggle(r.tier, c, catalog)) return;
    const on = curSt(r, c, catalog) === "on";
    setRow(s, { tier: r.tier, perms: { ...r.perms, [c.k]: valOf(c, on ? (c.req ? "req" : "off") : "on") } });
  };

  async function save() {
    setBusy(true); setMsg("");
    for (const [id, r] of Object.entries(draft)) {
      const s = list.find((x) => x.id === id)!;
      const { error } = await sb.from("staff_accounts").update({ ...(r.tier !== s.tier ? { tier: r.tier } : {}), perms: r.perms }).eq("id", id);
      if (error) { setBusy(false); return setMsg(`${s.name}: ${error.message}`); }
    }
    setDraft({}); setBusy(false); await reload(); toast("저장했어요. 바뀐 내용은 기록에 남아요.");
  }
  async function openLogs() {
    const r = await sb.rpc("perm_log_list", { p_limit: 50 });
    setLogs(r.error ? "none" : (r.data ?? []) as LogRow[]);
  }
  async function decide(ok: boolean) {
    if (!open) return;
    const { error } = await sb.rpc("approval_decide", { p_id: open.id, p_ok: ok, p_note: "" });
    if (error) return setMsg(error.message);
    setOpen(null); await reload(); toast(ok ? "승인했어요. 직원별 권한에서 바꾸고 저장해 주세요." : "거절했어요.");
  }
  const target = (r: Req) => list.find((s) => s.id === r.target_id);

  return (
    <>
      <div className="ct pmv">
        <div className="ph">
          <h1>권한</h1>
          <span className="bdg red"><I n="lock" />대표관리자만 변경</span>
          <span className="bdg">전 지점</span>
          <div className="phr"><Msg text={msg || err} />
            <button className="btn" onClick={openLogs}><I n="down" />변경 기록</button>
            <button className="btn p" disabled={!dirty || busy} onClick={save}>저장</button>
          </div>
        </div>
        <div className="note"><I n="info" />돈이 나가거나 기록이 바뀌는 일은 요청 → 승인 · 모든 변경은 기록됩니다.</div>
        <div className="grid" style={{ marginBottom: 16 }}>
          <div className="card c6">
            <div className="hd"><h2>역할별 기본 권한</h2></div>
            <table className="ptb"><thead><tr><th>할 일</th><th className="c">대표관리자</th><th className="c">관리자</th><th className="c">직원</th></tr></thead>
              <tbody>{COLS.map((c) => (
                <tr key={c.k}><td style={{ fontWeight: 600 }}>{c.l}</td>
                  <td className="c" data-l="대표관리자"><RoleCell v3 st="all" c={c} owner /></td>
                  <td className="c" data-l="관리자"><RoleCell v3 st={roleSt("manager", c, catalog, mgr)} c={c} owner /></td>
                  <td className="c" data-l="직원"><RoleCell v3 st={roleSt("staff", c, catalog, mgr)} c={{ ...c, fixed: false }} owner={false} /></td></tr>
              ))}</tbody></table>
          </div>
          <div className="card c6">
            <div className="hd"><h2>받은 변경 요청</h2>{pending.length > 0 && <span className="cnt red">{pending.length}</span>}
              {(reqs?.length ?? 0) > 3 && <div className="r"><button className="link" onClick={() => setAllReq(!allReq)}>{allReq ? "접기" : "전체"}<I n={allReq ? "chd" : "chr"} /></button></div>}</div>
            <table className="ptb"><thead><tr><th>대상 · 요청</th><th>내용</th><th className="c">상태</th><th className="num">확인</th></tr></thead>
              <tbody>
                {reqs === null && <tr><td colSpan={4} className="cap">070 SQL을 실행하면 요청이 보여요</td></tr>}
                {reqs?.length === 0 && <tr><td colSpan={4} className="cap">받은 요청이 없어요</td></tr>}
                {reqRows.map((r) => { const t = target(r); return (
                  <tr key={r.id}>
                    <td><div style={{ fontWeight: 600 }}>{t?.name ?? r.payload?.staff_name ?? "—"} {t && exN(t) > 0 && <span className="bdg red">예외</span>}</div>
                      <div className="cap">{when(r.requested_at)} · {r.requested_name} 관리자 요청</div></td>
                    <td className="ell">{r.reason}</td>
                    <td className="c"><span className={`bdg ${stCls(r.status)}`}>{stLabel(r.status)}</span></td>
                    <td className="num">{r.status === "대기" ? <button className="btn sm" onClick={() => setOpen(r)}>보기</button> : <span className="cap">{r.decided_name ? `${r.decided_name} 대표관리자` : ""}</span>}</td>
                  </tr>); })}
              </tbody></table>
          </div>
        </div>
        <div className="card">
          <div className="hd"><h2>직원별 권한</h2><span className="cnt">{shown.length}</span><span className="cap" style={{ marginLeft: 4 }}>토글을 바꾸면 예외로 표시</span>
            <div className="r"><span className="selw"><I n="store" /><select className="sel" value={br} onChange={(e) => setBr(e.target.value)} aria-label="지점">
              <option value="all">전체 지점</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select><I n="chd" /></span></div></div>
          <table className="ptb stf"><thead><tr><th>직원</th><th>지점</th><th>역할</th>{COLS.map((c) => <th key={c.k} className="c">{c.s}</th>)}<th className="num" /></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={10} className="cap">직원이 없어요</td></tr>}
              {shown.map((s) => { const r = rowOf(s); const n = exN(s); return (
                <tr key={s.id} className={n ? "exr" : ""}>
                  <td><div className="nm"><div className="av">{s.name.slice(0, 1)}</div><div><div className="t">{s.name} {n > 0 && <span className="bdg red">예외 {n}</span>}</div><div className="s">{s.title ?? roleLabel(r.tier)}</div></div></div></td>
                  <td><span className="bdg ol">{s.branch}</span></td>
                  <td><span className="selw role"><select className="sel" value={r.tier} disabled={s.id === me.id} aria-label={`${s.name} 역할`}
                    onChange={(e) => { const t = e.target.value as "manager" | "staff"; setRow(s, { tier: t, perms: defaults(t, r.perms) }); }}>
                    <option value="manager">관리자</option><option value="staff">직원</option></select><I n="chd" /></span></td>
                  {COLS.map((c) => { const on = curSt(r, c, catalog) === "on"; const ex = on !== (roleSt(r.tier, c, catalog, mgr) === "on"); const can = canToggle(r.tier, c, catalog); return (
                    <td key={c.k} className="c" data-l={c.s}><button type="button" role="switch" aria-checked={on} aria-label={`${s.name} ${c.l}`}
                      className={`tg ${on ? "on" : ""} ${ex ? `ex ${on ? "" : "off"}` : ""} ${can ? "" : "lock"}`} disabled={!can}
                      title={c.fixed ? "직원 권한 관리는 대표관리자만 해요" : can ? "" : "관리자는 늘 할 수 있어요"} onClick={() => flip(s, c)} /></td>); })}
                  <td className="num">{n > 0 ? <button className="btn sm" onClick={() => setRow(s, { tier: r.tier, perms: defaults(r.tier, r.perms) })}><I n="undo" />기본값으로</button> : <span className="cap">기본값</span>}</td>
                </tr>); })}
            </tbody></table>
        </div>
      </div>

      {open && <ReqPanel r={open} t={target(open)} self={open.requested_by === me.id} onClose={() => setOpen(null)} onDecide={decide} />}
      {logs && (
        <div className="panel pmp" role="dialog" aria-label="변경 기록">
          <div className="phd"><h2>변경 기록</h2><span className="sp" /><button className="btn sm g" onClick={() => setLogs(null)}>닫기</button></div>
          <div className="pbd">
            {logs === "none" ? <div className="note"><I n="info" />058 SQL을 실행하면 변경 기록이 보여요.</div>
              : logs.length === 0 ? <div className="cap">아직 기록이 없어요.</div>
              : logs.map((l, i) => <div key={i} className="audit"><b>{l.target_name}</b><div className="cap">{when(l.at)} · {l.actor_name} · {l.summary === "UPDATE" ? "바꿈" : l.summary === "INSERT" ? "만듦" : l.summary === "DELETE" ? "지움" : l.summary}</div></div>)}
          </div>
        </div>
      )}
    </>
  );
}

/* 12_권한_요청처리 · 12_권한_요청처리_본인요청 */
function ReqPanel({ r, t, self, onClose, onDecide }: { r: Req; t?: Staff; self: boolean; onClose: () => void; onDecide: (ok: boolean) => void }) {
  return (
    <div className="panel pmp" role="dialog" aria-label="변경 요청 보기">
      <div className="phd"><h2>변경 요청 보기</h2><span className={`badge ${r.status === "대기" ? "caution" : ""}`}>{stLabel(r.status)}</span><span className="sp" /><button className="btn sm g" onClick={onClose}>닫기</button></div>
      <div className="pbd">
        <div className="audit">
          <div className="field"><label className="il"><span className="v3num">1</span>요청한 사람</label><div>{r.requested_name} 관리자 · {r.branch}{self ? " (나)" : ""}</div></div>
          <div className="field"><label className="il"><span className="v3num">2</span>승인한 사람</label><div>{r.decided_name ?? "아직 없음"}</div></div>
          <div className="field"><label className="il"><span className="v3num">3</span>시각</label><div>{when(r.requested_at)} 요청</div></div>
        </div>
        <div className="field"><label className="il"><span className="v3num">4</span>대상 직원</label><div>{t ? `${t.name} · ${roleLabel(t.tier)}${t.title ? ` · ${t.title}` : ""} · ${t.branch}` : r.payload?.staff_name ?? "—"}</div></div>
        <div className="field"><label className="il"><span className="v3num">5</span>요청 내용</label><div style={{ whiteSpace: "pre-wrap" }}>{r.reason}</div></div>
        <div className="note"><I n="info" />{self ? "내가 보낸 요청은 다른 사람이 승인해요." : "승인하면 기록이 남아요. 권한은 직원별 권한에서 바꾸고 저장해 주세요. 거절하면 그대로예요."}</div>
      </div>
      <div className="pf"><button className="btn" disabled={self} onClick={() => onDecide(false)}>거절</button><span className="sp" /><button className="btn" disabled={self} onClick={() => onDecide(true)}>승인</button></div>
    </div>
  );
}

/* ───────── 관리자 (12_권한_지점장 · 12_권한_변경요청 · 12_권한_변경요청완료) ───────── */
function ManagerView({ me, list, catalog, mgr, err, toast }: VP) {
  const mine = list.filter((s) => s.branch === me.branch);
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const pickable = useMemo(() => mine.filter((s) => s.id !== me.id), [mine, me.id]);

  async function send() {
    const t = pickable.find((s) => s.id === who);
    if (!t) return setMsg("대상 직원을 골라 주세요");
    if (!text.trim()) return setMsg("요청 내용을 적어 주세요");
    setBusy(true); setMsg("");
    const { error } = await sb.rpc("approval_request", { p_branch: me.branch, p_kind: "perm_change", p_target_type: "staff", p_target_id: t.id,
      p_payload: { staff_name: t.name }, p_amount: null, p_reason: text.trim() });
    setBusy(false);
    if (error) return setMsg(/approval_request|Could not find|does not exist/i.test(error.message) ? "070 SQL을 실행하면 요청을 보낼 수 있어요" : error.message);
    setOpen(false); setText(""); setWho(""); toast("대표관리자에게 요청을 보냈어요.");
  }

  return (
    <>
      <div className="ct p32 pmm">
        <PageH title="권한" sub={`${me.branch} · 보기만 · 변경은 대표관리자에게 요청`}>
          <Msg text={err} />
          {!open && <button className="btn p" onClick={() => { setOpen(true); setWho(pickable[0]?.id ?? ""); }}>변경 요청</button>}
        </PageH>
        <div className="ltool"><div className="note"><I n="info" /> 권한 변경은 대표관리자만 할 수 있어요. 관리자는 자기 지점 직원 권한을 보기만 하고, 바꾸려면 대표관리자에게 요청해요.</div></div>
        <div className="body">
          <div className="sec">
            <div className="sech"><h2>역할별 기본 권한</h2><span className="sub">자기 지점 권한을 보기만 해요. 바꾸려면 [변경 요청]으로 대표관리자에게 요청해요. 대표관리자 열은 잠겨 있어 바꿀 수 없어요. 범위는 대표관리자는 전 지점, 그 밖은 자기 지점이에요.</span></div>
            <div className="note"><I n="info" /> 돈이 나가거나 기록이 바뀌는 일은 요청과 승인 · 보기는 자기 지점만 · 모든 변경은 기록</div>
            <div className="wrap"><table className="tbl">
              <thead><tr><th>할 일</th><th className="c">대표관리자</th><th className="c">관리자</th><th className="c">직원</th></tr></thead>
              <tbody>{COLS.map((c) => (
                <tr key={c.k}><td>{c.l}</td>
                  <td className="c" data-l="대표관리자"><RoleCell v3={false} st="all" c={c} owner /></td>
                  <td className="c" data-l="관리자"><RoleCell v3={false} st={roleSt("manager", c, catalog, mgr)} c={c} owner /></td>
                  <td className="c" data-l="직원"><RoleCell v3={false} st={roleSt("staff", c, catalog, mgr)} c={c} owner={false} /></td></tr>
              ))}</tbody>
            </table></div>
          </div>
          <div className="sec">
            <div className="sech"><h2>직원별 권한</h2><span className="sub">역할과 권한은 잠겨 있어요. 순서: 결제 취소 · 환불 · 회원권 조정 · 매출 보기 · 권한 관리 · 광고비</span><span className="sp" /><span className="sel sm lock">{me.branch}</span></div>
            <div className="wrap"><table className="tbl">
              <thead><tr><th>이름</th><th>지점</th><th>역할 · 직무</th><th>역할</th><th>권한</th><th /></tr></thead>
              <tbody>
                {mine.length === 0 && <tr><td colSpan={6}>직원이 없어요</td></tr>}
                {mine.map((s) => { const ex = COLS.some((c) => (curSt(s, c, catalog) === "on") !== (roleSt(s.tier as "manager" | "staff", c, catalog, mgr) === "on")); return (
                  <tr key={s.id} className={ex ? "ex" : ""}>
                    <td>{s.name}{ex && <> <span className="badge caution">예외</span></>}</td><td>{s.branch}</td>
                    <td>{TIER_LABEL[s.tier]}{s.title ? ` · ${s.title}` : ""}</td>
                    <td><span className="sel sm lock">{TIER_LABEL[s.tier]}</span></td>
                    <td className="cks">{COLS.map((c) => curSt(s, c, catalog) === "on"
                      ? <span key={c.k} className="ck on lock" title={`${c.l} 할 수 있음`}><I n="check" /></span>
                      : <span key={c.k} className="ck lock" title={`${c.l} 못 함`} />)}</td>
                    <td><span className="btn sm off">기본값으로</span></td>
                  </tr>); })}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
      {open && (
        <div className="panel pmp" role="dialog" aria-label="변경 요청">
          <div className="phd"><h2>변경 요청</h2><span className="badge staff">{me.branch}</span><span className="sp" /><button className="btn sm g" onClick={() => setOpen(false)}>닫기</button></div>
          <div className="pbd">
            <div className="field"><label className="il"><span className="v3num">1</span>대상 직원</label>
              <select className="sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="대상 직원">
                {pickable.length === 0 && <option value="">직원이 없어요</option>}
                {pickable.map((s) => <option key={s.id} value={s.id}>{s.name} · {TIER_LABEL[s.tier]}{s.title ? ` · ${s.title}` : ""}</option>)}
              </select></div>
            <div className="field"><label className="il"><span className="v3num">2</span>요청 내용</label>
              <textarea className="ta" rows={4} maxLength={300} value={text} placeholder="예: 환불 권한을 켜 주세요. 이번 주 환불 문의가 있어요." onChange={(e) => setText(e.target.value)} aria-label="요청 내용" /></div>
            <div className="note"><I n="info" /> 요청은 대표관리자에게 가요. 승인되면 대표관리자가 권한을 바꾸고, 결과는 기록에 남아요.</div>
            {msg && <span className="msg">{msg}</span>}
          </div>
          <div className="pf"><button className="btn" onClick={() => setOpen(false)}>취소</button><span className="sp" /><button className="btn p" disabled={busy} onClick={send}>요청 보내기</button></div>
        </div>
      )}
    </>
  );
}
