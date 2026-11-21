"use client";
import { useEffect, useMemo, useState } from "react";
import { sb, type Staff } from "@/lib/sb";
import Link from "next/link";
import { useMe } from "@/lib/me";
import PayModal from "./PayModal";
import "./rsv-new.css";
import AlimtalkModal from "@/components/AlimtalkModal";
import { RsvStatusAsk, sendRequest } from "@/lib/approval";
import { type Program, type Rsv, SLOTS, toMin, usedAt, DAY_START, DAY_END, fmtDay, todayKST, DOW, dow } from "@/lib/schedule";

// 새 예약은 day/start_time/program_id 만, 기존 예약은 Rsv 전체
export type Draft = Partial<Rsv> & { day: string; start_time: string; program_id?: string | null };
type Cust = { key: string; branch: string; name: string; phone: string | null; membership: string | null; min_remaining: number | null; ends_on: string | null; last_visit_on?: string | null };

const isWork = (p?: Program) => !!p && (p.grp === "업무" || p.grp === "행사");
type Summary = {
  customer: { name: string; phone: string | null; last_visit_on: string | null; tags: string | null };
  memberships: { id: string; name: string; kind: string; status: string; end_on: string | null; amount_left: number | null; items: { total: number; used: number; service: number | null }[] }[];
  visits: { day: string; status: string }[];
  counts: { done: number; noshow: number; cancel: number } | null;
  memos: { body: string }[];
};
const md = (d: string) => `${Number(d.slice(5, 7))}.${d.slice(8)}`;
const daysTo = (d: string, from: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
const addD = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function RsvDrawer({ branch, draft, programs, rows, canWrite, onClose, onSaved, docked, offDays = [] }: {
  docked?: boolean; offDays?: string[]; branch: string; draft: Draft; programs: Program[]; rows: Rsv[]; canWrite: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = !!draft.id;
  const me = useMe();
  const canPay = me.tier !== "staff" || !!me.perms?.["schedule.pay"];
  const canPayCancel = me.tier === "owner" || !!me.perms?.["schedule.pay_cancel"];
  const [payOpen, setPayOpen] = useState(false);
  const [atOpen, setAtOpen] = useState(false);
  type Paid = { gross: number; discount: number; received: number; unpaid: number; pay: Record<string, number>; detail: { sessions?: string }; created_by: string; created_at: string; canceled_at: string | null; new_membership: string | null };
  const [paid, setPaid] = useState<Paid | null>(null);
  const [cxReason, setCxReason] = useState("");
  const [cxAsk, setCxAsk] = useState(false);
  useEffect(() => {
    if (!draft.id || draft.status !== "완료") return;
    sb.rpc("pay_get", { p_id: draft.id }).then(({ data }) => setPaid((data as Paid) ?? null));
  }, [draft.id, draft.status]);
  const payCancel = async () => {
    setBusy(true); setErr("");
    const { error } = await sb.rpc("pay_cancel", { p_id: draft.id, p_reason: cxReason });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  };
  // 결제 취소 권한이 없으면 대표관리자에게 요청 (070 SQL)
  const payCancelReq = async () => {
    if (!cxReason.trim()) return setErr("취소 사유를 써 주세요.");
    setBusy(true); setErr("");
    const r = await sendRequest(me, { branch, kind: "pay_cancel", targetType: "reservation", targetId: String(draft.id), reason: cxReason.trim(),
      amount: paid ? paid.gross - paid.discount : null, payload: { customer: draft.customer_name ?? "", when: `${draft.day} ${draft.start_time.slice(0, 5)}` } });
    setBusy(false);
    if (r.state === "need_sql") return setErr("결제 취소 요청은 서버 준비(070 SQL) 후에 돼요.");
    if (r.error) return setErr(r.error);
    setCxAsk(false); setDoneMsg("대표관리자에게 결제 취소를 요청했어요");
  };
  const locked = editing && draft.status !== "예약";
  const [day, setDay] = useState(draft.day);
  const [time, setTime] = useState(draft.start_time);
  const [programId, setProgramId] = useState(draft.program_id ?? "");
  const [staffId, setStaffId] = useState(draft.staff_id ?? "");
  const [memo, setMemo] = useState(draft.memo ?? "");
  const [title, setTitle] = useState(draft.title ?? "");
  const [cust, setCust] = useState<Pick<Cust, "key" | "name"> | null>(
    draft.customer_key ? { key: draft.customer_key, name: draft.customer_name ?? "" } : null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Cust[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [askReason, setAskReason] = useState<"취소" | "노쇼" | null>(null);
  const [doneMsg, setDoneMsg] = useState("");
  // 새 예약 팝업: 일반 예약 / 일정 등록, 고객은 기존 검색 / 신규 입력
  const [mode, setMode] = useState<"rsv" | "work" | "sale">(isWork(programs.find((p) => p.id === draft.program_id)) ? "work" : "rsv");
  const [custMode, setCustMode] = useState<"old" | "new">("old");
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [reason, setReason] = useState("");
  // 겹침 안내 (시안 1120 U-MO-RSV-1 시간겹침 · 같은고객): 강제 저장 없이 비어 있는 다른 시간을 골라 저장
  const [clash, setClash] = useState<{ cust: boolean; other: Rsv; alts: number[] } | null>(null);
  const [alt, setAlt] = useState<number | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  // 반복 예약: 첫 예약과 같은 시간·관리로 주기마다 N회
  const [rep, setRep] = useState(false);
  const [repEvery, setRepEvery] = useState(7);
  const [repN, setRepN] = useState(4);
  const [repMsg, setRepMsg] = useState("");
  const [repDone, setRepDone] = useState(false);
  // 반복 (시안 P20): 매주·격주 + 요일 여러 개, 횟수만큼. 미리보기에서 겹치는 날은 빼고 저장
  const [repWd, setRepWd] = useState<number[]>([dow(draft.day)]);
  const [repOff, setRepOff] = useState<Set<string>>(new Set());
  const [repMove, setRepMove] = useState<Record<string, number>>({}); // 이동한 날짜 → 시작 분
  const [repEnd, setRepEnd] = useState<string | null>(null); // 종료일로 끝내기
  const [pick, setPick] = useState(false); // 모바일 날짜·시간 고르기 (M07)
  const repAll = useMemo(() => {
    if (!rep) return [day];
    const mon = addD(day, -((dow(day) + 6) % 7));
    const wds = [...repWd].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const out: string[] = [];
    const cap = repEnd ? 60 : repN;
    for (let w = 0; out.length < cap && w < 120; w += repEvery === 14 ? 2 : 1) {
      if (repEnd && addD(mon, w * 7) > repEnd) break;
      for (const wd of wds) { const d = addD(mon, w * 7 + ((wd + 6) % 7)); if (d >= day && out.length < cap && (!repEnd || d <= repEnd)) out.push(d); }
    }
    return out.length ? out : [day];
  }, [rep, repN, repEvery, repWd, day, repEnd]);
  const repDays = useMemo(() => repAll.filter((d, i) => i === 0 || !repOff.has(d)), [repAll, repOff]);

  // 고객 요약 (시안 8차 P03: 이력 · 보유 회원권 · 비고)
  const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => {
    setSum(null);
    if (!cust) return;
    sb.rpc("customer_chart", { p_branch: branch, p_key: cust.key }).then(({ data }) => setSum((data as Summary) ?? null));
  }, [cust, branch]);

  useEffect(() => {
    sb.from("staff_accounts").select("*").eq("branch", branch).eq("status", "active").order("name")
      .then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, [branch]);

  const prog = programs.find((p) => p.id === programId);
  const work = editing ? isWork(prog) : mode === "work";
  const left = prog ? prog.capacity - usedAt(rows, day, prog.id, toMin(time), prog.minutes, draft.id) : null;
  // 정원 초과 (시안 P38): 같은 관리의 다음 빈 시간 두 개를 자리 수와 같이 보여 줘요
  const capFull = !editing && !work && !rep && !!prog && left !== null && left <= 0;
  const capAlts = (() => {
    if (!capFull || !prog) return [] as { m: number; n: number }[];
    const out: { m: number; n: number }[] = [];
    for (let m = toMin(time) + 30; m + prog.minutes <= DAY_END && out.length < 2; m += 30) {
      const n = prog.capacity - usedAt(rows, day, prog.id, m, prog.minutes, draft.id);
      if (n > 0) out.push({ m, n });
    }
    return out;
  })();
  const focusSel = (f: "time" | "staff" | "prog") => { const el = document.querySelector<HTMLSelectElement>(`.rd select[data-f=${f}]`); el?.scrollIntoView({ block: "center" }); el?.focus(); try { el?.showPicker?.(); } catch { /* 일부 브라우저는 지원 안 해요 */ } };

  // 프로그램 선택 목록: 그룹별 (하위 프로그램은 부모 밑에)
  const groups = useMemo(() => {
    const m = new Map<string, Program[]>();
    programs.filter((p) => editing || isWork(p) === (mode === "work")).forEach((p) => { const g = p.grp === "행사" ? "업무" : p.grp; m.set(g, [...(m.get(g) ?? []), p]); });
    return [...m.entries()];
  }, [programs, editing, mode]);

  useEffect(() => {
    if (cust || custMode !== "old" || q.trim().length < 1) { setFound(null); return; }
    const t = setTimeout(() => { search(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cust, custMode]);
  const search = async () => {
    if (!q.trim()) return;
    const { data, error } = await sb.rpc("customer_list", { p_q: q.trim(), p_branch: branch, p_filter: "all", p_limit: 20, p_offset: 0 });
    if (error) { setErr(error.message); return; }
    const d = (data ?? []) as Cust[];
    setFound(d);
    if (!d.length) { const t = q.trim(); if (/^[\d-]+$/.test(t)) { setNPhone(t); setNName(""); } else { setNName(t); setNPhone(""); } }
  };

  // 검색 결과 없음 (시안 P29): 결과 카드 아래에 신규 등록 칸을 바로 보여 줘요
  const nf = !editing && !cust && custMode === "old" && !!found && found.length === 0;

  // 같은 담당 또는 같은 고객이 같은 시간에 이미 예약(취소·노쇼 제외)이 있는지
  const findClash = (at: number, ck: string | null, mins: number, onDay = day) => rows.find((r) =>
    r.day === onDay && r.id !== draft.id && (r.status === "예약" || r.status === "완료")
    && toMin(r.start_time) < at + mins && at < toMin(r.start_time) + (r.minutes || 30)
    && ((!!ck && r.customer_key === ck) || (!!staffId && r.staff_id === staffId)));
  const [newId, setNewId] = useState<string | null>(null);
  const [payAfter, setPayAfter] = useState(false);
  // 반복 미리보기 한 줄 상태 (예약표에 불러온 기간만 알 수 있어요)
  const repAt = (d: string) => repMove[d] ?? toMin(time);
  const freeAt = (d: string, at: number) => !!prog && !findClash(at, work ? null : cust?.key ?? null, prog.minutes, d) && usedAt(rows, d, prog.id, at, prog.minutes, draft.id) < prog.capacity;
  const repState = (d: string) => {
    if (offDays.includes(d)) return "휴무";
    if (!prog) return "가능";
    if (findClash(repAt(d), work ? null : cust?.key ?? null, prog.minutes, d)) return "겹침";
    if (usedAt(rows, d, prog.id, repAt(d), prog.minutes, draft.id) >= prog.capacity) return "정원 참";
    return "가능";
  };
  const clashWho = (d: string) => { const r = prog && findClash(repAt(d), work ? null : cust?.key ?? null, prog.minutes, d); return r ? (r.customer_name || r.title || "다른 예약") : ""; };
  // 이동 (시안 P20): 그날 가장 가까운 빈 시간으로 옮겨요 (앞뒤 10분 단위)
  const repMoveTo = (d: string) => {
    if (!prog) return;
    const base = toMin(time);
    for (let k = 1; k < 80; k++) for (const m of [base + k * 10, base - k * 10])
      if (m >= DAY_START && m + prog.minutes <= DAY_END && freeAt(d, m)) { setRepMove({ ...repMove, [d]: m }); return; }
    setErr(`${md(d)}은 빈 시간이 없어요. 제외해 주세요.`);
  };
  // 고른 관리와 이름이 맞는 회차 회원권 (반복 미리보기의 회차·단건 안내)
  const repMs = (() => {
    if (!prog || !sum) return null;
    const m = (sum.memberships ?? []).find((x) => x.status === "사용중" && x.kind === "회차" && x.name.includes(prog.name));
    if (!m) return null;
    const t = m.items.reduce((a, i) => a + i.total + (i.service ?? 0), 0), u = m.items.reduce((a, i) => a + i.used, 0);
    return { name: m.name, left: Math.max(t - u, 0), used: u };
  })();
  const repBad = rep ? repAll.filter((d, i) => repState(d) !== "가능" && !(i > 0 && repOff.has(d))).length : 0;
  const save = async (atOverride?: number, thenPay = payAfter) => {
    setErr("");
    const at = atOverride ?? (rep && !editing && repMove[day] != null ? repMove[day] : toMin(time));
    if (!prog) return setErr("프로그램을 골라 주세요.");
    let c = cust;
    if (!work && !c && (custMode === "new" || nf)) {
      if (!nName.trim() || nPhone.replace(/\D/g, "").length < 10) return setErr("신규 고객 이름과 연락처를 넣어 주세요.");
      setBusy(true);
      const { data, error } = await sb.rpc("customer_create", { p_branch: branch, p_name: nName.trim(), p_phone: nPhone.replace(/\D/g, "") });
      setBusy(false);
      if (error) return setErr(/customer_create|function/i.test(error.message) ? "신규 고객 등록은 서버 준비 중이에요. 지금은 고객 메뉴에 있는 고객만 예약할 수 있어요." : error.message);
      c = { key: data as string, name: nName.trim() };
      setCust(c);
    }
    if (!work && !c) return setErr("고객을 골라 주세요.");
    if (atOverride == null && left !== null && left <= 0) return; // 위 안내 띠에서 시간을 옮겨요 (P38)
    const ck = work ? null : c!.key;
    const hit = findClash(at, ck, prog.minutes);
    if (hit) {
      const alts: number[] = [];
      for (let m = Math.max(toMin(time) + 10, DAY_START); m + prog.minutes <= DAY_END && alts.length < 3; m += 10)
        if (!findClash(m, ck, prog.minutes) && usedAt(rows, day, prog.id, m, prog.minutes, draft.id) < prog.capacity) { alts.push(m); m += prog.minutes - 10; }
      setAlt(null); setClash({ cust: !!ck && hit.customer_key === ck, other: hit, alts });
      return;
    }
    setClash(null);
    setBusy(true);
    const body = { branch, day, start_time: hm(at), program_id: prog.id, customer_key: work ? null : c!.key, title: work ? title : "", staff_id: staffId, memo };
    const { data: rid, error } = editing
      ? await sb.rpc("rsv_update", { p_id: draft.id, p: body })
      : await sb.rpc("rsv_create", { p: body });
    setBusy(false);
    if (error) return setErr(error.message);
    if (!editing && thenPay && !work && typeof rid === "string") { setNewId(rid); setPayOpen(true); return; }
    if (!editing && rep && repDays.length > 1) {
      setBusy(true);
      const fail: string[] = [];
      for (const d of repDays.filter((x) => x !== day)) {
        const dAt = repMove[d] ?? at;
        if (findClash(dAt, ck, prog.minutes, d)) { fail.push(`${md(d)} 겹침`); continue; }
        const r = await sb.rpc("rsv_create", { p: { ...body, day: d, start_time: hm(dAt) } });
        if (r.error) fail.push(`${md(d)} ${/capacity|정원/i.test(r.error.message) ? "정원 참" : "실패"}`);
      }
      setBusy(false);
      if (fail.length) { setRepMsg(`${repDays.length - fail.length}건 등록했어요. 못 넣은 날: ${fail.join(", ")}`); setRepDone(true); return; }
    }
    onSaved();
  };

  const setStatus = async (s: "예약" | "취소" | "노쇼") => {
    setBusy(true); setErr("");
    const { error } = await sb.rpc("rsv_set_status", { p_id: draft.id, p_status: s, p_reason: reason });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  };

  // 신규 고객 바로 등록 (시안 P29): 검색어가 숫자면 전화, 아니면 이름으로 채워요
  const [firstV, setFirstV] = useState<"체험" | "상담" | "관리">("체험");
  const toNew = (v: string) => {
    const t = v.trim(); setCustMode("new"); setFound(null);
    if (/^[\d-]+$/.test(t)) setNPhone(t); else setNName(t);
    pickFirst(firstV);
  };
  const pickFirst = (k: "체험" | "상담" | "관리") => {
    setFirstV(k);
    if (k === "관리" || programId) return;
    const p = programs.find((x) => !isWork(x) && x.name.includes(k));
    if (p) setProgramId(p.id);
  };
  const searchAll = async () => {
    const { data, error } = await sb.rpc("customer_list", { p_q: q.trim(), p_branch: null, p_filter: "all", p_limit: 20, p_offset: 0 });
    if (error) return setErr(error.message);
    setFound((data ?? []) as Cust[]);
  };
  const newForm = (
    <div className="rn-new">
      <div className="rn-nh">신규로 바로 등록<span className="pc">&nbsp;· 이름과 전화만</span></div>
      <div className="rd-grid"><span className="rd-k">이름</span><input className="inp" placeholder="이름" value={nName} onChange={(e) => setNName(e.target.value)} autoFocus={!nf} /></div>
      <div className="rd-grid"><span className="rd-k">휴대전화</span><input className="inp num" placeholder="010-0000-0000" inputMode="tel" value={nPhone} onChange={(e) => setNPhone(e.target.value)} /></div>
      <div className="rd-grid"><span className="rd-k">첫 방문</span>
        <div className="seg sm" style={{ width: "max-content" }}>{(["체험", "상담", "관리"] as const).map((k) => <button key={k} className={firstV === k ? "on" : ""} onClick={() => pickFirst(k)}>{k === "관리" ? "바로 관리" : k}</button>)}</div></div>
      <div className="rn-rec">나머지 정보는 방문 뒤 고객 차트에서 채워요 · 동의는 고객 앱 첫 실행 때 받아요</div>
    </div>
  );
  const alertDone = (msg: string) => { setDoneMsg(msg); setTimeout(() => onSaved(), 900); };
  const ro = !canWrite || locked;
  const today = todayKST();
  const endTime = prog ? hm(toMin(time) + prog.minutes) : "";
  const last = (st: string) => sum?.visits.find((v) => v.status === st)?.day;
  const lastVisit = sum?.customer?.last_visit_on ?? sum?.visits.find((v) => v.status === "완료" || v.status === "방문")?.day;
  const active = (sum?.memberships ?? []).filter((m) => m.status === "사용중");
  const staffName = staff.find((s) => s.id === staffId)?.name;

  // 결제 완료 요약 (시안 P06): 아래 칸에 초록 띠로
  const paidPanel = editing && draft.status === "완료" ? (
    <div className="rn-paid">
      {paid ? (
        <>
          <div className="h">
            <i className="ok" aria-hidden>✓</i>
            <b className="num">결제 완료 · {(() => { const k = new Date(new Date(paid.created_at).getTime() + 9 * 3600e3).toISOString(); return `${Number(k.slice(5, 7))}.${k.slice(8, 10)} ${k.slice(11, 16)}`; })()}</b>
            <span className="sp" />
            {!cxAsk && <button className="btn sm" onClick={() => setCxAsk(true)}>{canPayCancel ? "결제 취소" : "결제 취소 요청"}</button>}
          </div>
          <div className="l num">{[["card", "카드"], ["cash", "현금"], ["account", "계좌이체"], ["local", "지역화폐"]].filter(([k]) => (paid.pay?.[k] ?? 0) > 0).map(([k, l]) => `${l} ${paid.pay[k].toLocaleString()}원`).join(" · ") || "받은 금액 0원"}{paid.discount > 0 ? ` · 할인 ${paid.discount.toLocaleString()}원` : ""}{paid.unpaid > 0 ? ` · 미수금 ${paid.unpaid.toLocaleString()}원` : ""}</div>
          {(paid.detail?.sessions || paid.new_membership) && <div className="l">{[paid.detail?.sessions, paid.new_membership ? `${paid.new_membership} 판매` : ""].filter(Boolean).join(" · ")}</div>}
          <div className="l d">결제 {paid.created_by}</div>
          {cxAsk && (
            <div className="cx">
              <input className="inp" placeholder={canPayCancel ? "취소 사유 (선택)" : "취소 사유 (꼭 써 주세요)"} value={cxReason} onChange={(e) => setCxReason(e.target.value)} />
              <button className="btn sm t" onClick={() => setCxAsk(false)}>돌아가기</button>
              <button className="btn sm danger" disabled={busy} onClick={canPayCancel ? payCancel : payCancelReq}>{canPayCancel ? "결제 취소" : "요청 보내기"}</button>
            </div>
          )}
          {cxAsk && <span className="l d">차감한 회차를 되돌리고 매출을 지워요. 예약은 다시 &apos;예약&apos; 상태가 돼요.</span>}
        </>
      ) : <span className="l d">결제 기록이 없어요 (이전 프로그램에서 완료된 예약)</span>}
    </div>
  ) : null;

  // 고객 요약 (예약 패널 · 결제 창 왼쪽 위에 같이 써요)
  const custHead = cust ? (
    <>
              <div className="rd-box rd-cust">
                <b>{cust.name}</b>
                <span className="num rn-ph">{sum?.customer.phone ?? ""}</span>
                <span className="rn-rsum">{[prog?.name, staffName].filter(Boolean).join(" · ")}</span>
                <div style={{ flex: 1 }} />
                <Link className="btn sm" href={`/customers/chart?b=${encodeURIComponent(branch)}&k=${encodeURIComponent(cust.key)}&from=rsv&ctx=${encodeURIComponent([day, time, prog?.name].filter(Boolean).join("|"))}`}>고객 차트</Link>
                <button className="btn sm" onClick={() => setAtOpen(true)}>알림톡</button>
                {!ro && !editing && <button className="btn sm" onClick={() => { setCust(null); setFound(null); setQ(""); }}>다른 고객</button>}
              </div>
              <div className="rd-box rd-row">
                <span className="rd-k">이력</span>
                <span className="num">
                  취소 <em>{sum?.counts?.cancel ?? 0}회</em>{last("취소") ? ` ${md(last("취소")!)}` : ""} · 노쇼 <em>{sum?.counts?.noshow ?? 0}회</em>{last("노쇼") ? ` ${md(last("노쇼")!)}` : ""}
                  {lastVisit ? ` · 최근 방문 ${md(lastVisit)} (${Math.max(0, -daysTo(lastVisit, today))}일 전)` : " · 방문 기록 없음"}
                </span>
              </div>
              {active.length > 0 && (
                <div className="rd-box rd-ms">
                  {active.slice(0, 4).map((m) => {
                    const left = m.items.reduce((a, i) => a + Math.max(i.total - i.used, 0) + (i.service ?? 0), 0);
                    const dd = m.end_on ? daysTo(m.end_on, today) : null;
                    return (
                      <div key={m.id} className="num">
                        <b>{m.name}</b>
                        <span>{m.kind === "금액" ? `잔액 ${Math.round((m.amount_left ?? 0) / 10000)}만` : `잔여 ${left}회`}{dd !== null ? ` · ${dd}일` : ""}</span>
                        {m.end_on && (dd !== null && dd <= 14
                          ? <span className="tag cc">D-{dd} · {md(m.end_on)} 만료</span>
                          : <span className="rd-dim">· {m.end_on.slice(2).replace(/-/g, ".")} 만료</span>)}
                      </div>
                    );
                  })}
                </div>
              )}
              {sum?.memos?.[0] && (
                <div className="rd-box rd-row"><span className="rd-k"><svg className="rn-i" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>비고</span><span className="rd-ell">{sum.memos[0].body}</span></div>
              )}
            </>
  ) : null;

  return (
    <>
      {!docked && <div className="dim" style={{ zIndex: 20 }} onClick={onClose} />}
      <aside className={docked ? "rd rd-docked" : editing ? "drawer rd" : "drawer rd rd-modal"} style={docked ? undefined : { zIndex: 21 }} role="dialog" aria-label={editing ? "예약 수정" : "새 예약"}>
        <div className="hd">
          <b className="rn-title">{editing ? (draft.status === "완료" ? "예약 상세" : "예약 수정") : "새 예약"}</b>
          {editing && <span className="rd-sub num">{md(day)} ({DOW[dow(day)]}) {time}</span>}
          {editing && draft.status !== "예약" && (
            <span className={`badge ${draft.status === "완료" ? "ok" : draft.status === "노쇼" ? "warn" : "em"}`} style={{ marginLeft: 8 }}>
              {draft.status}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="rd-x" onClick={onClose} aria-label="닫기" title="닫기">×</button>
        </div>
        {!editing && (
          <div className="rn-tabs">
            <div className="rn-seg">
              <button className={mode === "rsv" && !rep ? "on" : ""} onClick={() => { if (mode !== "rsv") setProgramId(""); setMode("rsv"); setRep(false); }}>일반예약</button>
              <button className={mode === "rsv" && rep ? "on" : ""} onClick={() => { if (mode !== "rsv") setProgramId(""); setMode("rsv"); setRep(true); }}>반복예약</button>
              <button className={mode === "work" ? "on" : ""} onClick={() => { setMode("work"); setProgramId(""); setRep(false); }}>일정등록</button>
              <button className={mode === "sale" ? "on" : ""} onClick={() => { setMode("sale"); setRep(false); }}>매출등록</button>
            </div>
          </div>
        )}
        <div className={`bd ${nf ? "rn-nfmode" : ""} ${rep && !editing ? "rn-repmode" : ""} ${!editing && !cust && custMode === "old" && found && found.length > 0 ? "rn-srch" : ""}`}>
          {clash && prog && (
            <div className="rn-ban bad" role="alert">
              <p><b>! 저장하지 못했어요</b> · {clash.cust ? "이 고객은" : `${clash.other.staff_name ?? staffName ?? "같은 담당"}`} {clash.other.start_time.slice(0, 5)}에 다른 예약({clash.other.customer_name || clash.other.title || "일정"}{programs.find((x) => x.id === clash.other.program_id)?.name ? ` ${programs.find((x) => x.id === clash.other.program_id)?.name}` : ""})이 있어요. 적어 둔 내용은 그대로예요.</p>
              <div className="bt">
                {clash.alts[0] != null && <button className="btn sm p" disabled={busy} onClick={() => { const m = clash.alts[0]; setTime(hm(m)); save(m); }}>{hm(clash.alts[0])}으로 옮겨 저장</button>}
                {!clash.cust && <button className="btn sm" onClick={() => { setClash(null); focusSel("staff"); }}>다른 담당 보기</button>}
                <button className="btn sm" onClick={() => { setClash(null); focusSel("time"); }}>빈 시간 보기</button>
              </div>
            </div>
          )}
          {!clash && capFull && prog && (
            <div className="rn-ban warn pc" role="alert">
              <p><b>{time} {prog.name} 정원이 찼어요</b> · 같은 시간 최대 {prog.capacity}건 중 {prog.capacity - (left ?? 0)}건이 이미 있어요. 적어 둔 내용은 그대로예요.</p>
              <div className="bt">
                {capAlts.map((a, i) => <button key={a.m} className={`btn sm ${i === 0 ? "p" : ""}`} onClick={() => setTime(hm(a.m))}>{hm(a.m)}{i === 0 ? "으로 옮기기" : ""} · {a.n}자리</button>)}
                <button className="btn sm" onClick={() => focusSel("prog")}>다른 관리로 바꾸기</button>
              </div>
            </div>
          )}
          {mode === "sale" && !editing ? (
            <div className="rn-sale">
              <b>예약 없이 받는 매출</b>
              <p>회원권이나 제품을 예약 없이 팔 때 여기서 바로 등록해요. 예약한 관리의 결제는 예약을 눌러 &apos;결제&apos;로 해요.</p>
              <div className="rn-sale-bt">
                <Link className="btn" href={`/membership?sell=1&b=${encodeURIComponent(branch)}${cust ? `&k=${encodeURIComponent(cust.key)}` : ""}`}>회원권 판매</Link>
                <Link className="btn" href="/sales/product">제품 판매</Link>
              </div>
            </div>
          ) : <>
          {!editing && !cust && (
            <div className="rn-pre"><span className="badge">예약표에서 선택</span><b className="num">{md(day)} ({DOW[dow(day)]}) {time}</b>
              <span className="rd-dim">· {staffName ?? "담당 미정"} · 자동 입력</span></div>
          )}
          {/* 고객 */}
          {!work && (cust ? (
            custHead
          ) : (
            <div className="rd-custpick">
              <div className="seg sm rn-cm">
                <button className={custMode === "old" ? "on" : ""} onClick={() => setCustMode("old")}>기존 고객</button>
                <button className={custMode === "new" ? "on" : ""} onClick={() => setCustMode("new")}>신규 고객</button>
              </div>
              {custMode === "new" ? newForm : (
              <form className="rn-q" onSubmit={(e) => { e.preventDefault(); search(); }}>
                <input className="inp" placeholder="이름 · 전화 뒤 4자리 · 초성(ㄱㅇ)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
              </form>
              )}
              {custMode === "old" && found && (
                <div className="rn-res">
                  {found.length === 0 && (
                    <div className="rn-nf">
                      <b>‘{q.trim()}’ 고객이 없어요</b>
                      <p className="pc">다른 지점 고객이거나 아직 등록 전일 수 있어요.<br />초성(ㅂㅇ)이나 전화 뒤 4자리만으로도 찾을 수 있어요.</p>
                      <p className="mo">초성(ㅂㅇ)이나 뒤 4자리로도 찾을 수 있어요.</p>
                      <div className="bt">
                        {me.tier === "owner" && <button className="btn sm" onClick={searchAll}>전 지점에서 찾기</button>}
                        <button className="btn sm p pc" onClick={() => toNew(q)}>신규 고객으로 등록</button>
                      </div>
                    </div>
                  )}
                  {found.map((c, i) => {
                    const lv = c.last_visit_on ? Math.max(0, -daysTo(c.last_visit_on, today)) : null;
                    const lvTxt = c.last_visit_on !== undefined ? `최근 방문 ${lv == null ? "없음" : lv === 0 ? "오늘" : `${lv}일 전`}` : "";
                    return (
                      <button key={c.key} className={`rn-rr ${i === 0 ? "on" : ""}`} onClick={() => { setCust({ key: c.key, name: c.name }); setFound(null); }}>
                        <span className="av">{c.name.slice(0, 1)}</span>
                        <span><b>{c.name}</b> <span className="pn num">{c.phone ?? ""}{lvTxt && <span className="lvp"> · {lvTxt}</span>}</span></span>
                        <span className="m num">{lvTxt && <span className="lvm">{lvTxt} · </span>}{c.membership ? `${c.membership}${c.min_remaining != null ? ` ${c.min_remaining}회` : ""}${c.ends_on ? ` · ${Math.max(0, daysTo(c.ends_on, today))}일` : ""}` : "회원권 없음"}</span>
                      </button>
                    );
                  })}
                  {found.length > 0 && <button className="rn-newc" onClick={() => toNew(q)}>+ &apos;{q.trim()}&apos; 신규 고객으로 바로 등록 <span>· 이름·전화만 넣고 예약까지</span></button>}
                </div>
              )}
              {nf && newForm}
            </div>
          ))}

          {work && (
            <div className="rd-grid">
              <span className="rd-k">내용</span>
              <input className="inp" value={title} disabled={ro} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 회의" />
            </div>
          )}

          {!editing && !ro && rep && (
            <div className="rn-rep">
              <div className="rd-sec" style={{ margin: 0 }}><b>반복 설정</b><span className="rd-dim">{[prog?.name, staffName].filter(Boolean).join(" · ")}</span></div>
              <div className="rd-grid">
                <span className="rd-k">주기 · 요일</span>
                <div className="rn-wd">
                  <div className="seg sm">
                    <button className={repEvery === 7 ? "on" : ""} onClick={() => setRepEvery(7)}>매주</button>
                    <button className={repEvery === 14 ? "on" : ""} onClick={() => setRepEvery(14)}>격주</button>
                  </div>
                  {[1, 2, 3, 4, 5, 6].map((w) => (
                    <button key={w} className={`rn-day ${repWd.includes(w) ? "on" : ""}`} onClick={() => setRepWd(repWd.includes(w) ? (repWd.length > 1 ? repWd.filter((x) => x !== w) : repWd) : [...repWd, w])}>{DOW[w]}</button>
                  ))}
                </div>
              </div>
              <div className="rd-grid">
                <span className="rd-k">시간</span>
                <div className="rd-line"><span className="inp rd-ro num">{time}</span><span className="rd-dim">~</span><span className="inp rd-ro num">{endTime || "--:--"}</span><span className="rd-dim">관리 시간으로 자동</span></div>
              </div>
              <div className="rd-grid">
                <span className="rd-k">끝</span>
                <div className="rd-line">
                  <div className="seg sm">
                    <button className={!repEnd ? "on" : ""} onClick={() => setRepEnd(null)}>횟수</button>
                    <button className={repEnd ? "on" : ""} onClick={() => setRepEnd(repAll[repAll.length - 1])}>종료일</button>
                  </div>
                  {repEnd ? <input type="date" className="inp" value={repEnd} min={day} onChange={(e) => e.target.value && setRepEnd(e.target.value)} />
                    : <select className="sel" value={repN} onChange={(e) => setRepN(Number(e.target.value))}>
                      {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}회</option>)}
                    </select>}
                  <span className="rd-dim num">{repEnd ? `= ${repAll.length}회` : `= ${repAll[repAll.length - 1].slice(2).replace(/-/g, ".")}까지`}</span>
                </div>
              </div>
              {repMs && repAll.length > repMs.left && (
                <div className="rn-chk"><b>확인</b><span>{repMs.name} 잔여 {repMs.left}회 · 반복 {repAll.length}회 → {repMs.left + 1 === repAll.length ? `${repAll.length}` : `${repMs.left + 1}–${repAll.length}`}회차는 단건 결제</span></div>
              )}
              <div className="rn-pv">
                <div className="rn-pvh">미리보기 <span className="rd-dim">{repAll.length}건 · 충돌 {repAll.filter((d, i) => (repState(d) === "겹침" || repState(d) === "정원 참") && !(i > 0 && repOff.has(d))).length} · 휴무 {repAll.filter((d) => repState(d) === "휴무").length}</span></div>
                {(() => { let k = 0; return repAll.map((d, i) => {
                  const st = repState(d);
                  const off = i > 0 && repOff.has(d);
                  const n = !off && st === "가능" ? k++ : -1; // 회차는 실제로 들어가는 줄만 세요
                  return (
                    <div key={d} className={`rn-pr ${st !== "가능" && !off ? "bad" : ""} ${off ? "off" : ""}`}>
                      <span className="i">{i + 1}</span><b className="num">{md(d)} ({DOW[dow(d)]})</b><span className="num">{hm(repAt(d))}</span>
                      <span className="t">{off ? "빼고 저장" : st === "겹침" ? `${clashWho(d)} 이미 예약 있음` : st !== "가능" ? st : repMs ? (n < repMs.left ? `${prog?.name ?? ""} ${repMs.used + n + 1}회차 · 잔여 ${repMs.left - n - 1}` : "회원권 부족 · 단건 결제") : (prog?.name ?? "")}</span>
                      {st !== "가능" && (i > 0 || st !== "휴무") ? <span className="rn-pb">{i > 0 && <button className="btn sm" onClick={() => { const n = new Set(repOff); if (off) n.delete(d); else n.add(d); setRepOff(n); }}>{off ? "되살리기" : "제외"}</button>}{!off && st !== "휴무" && <button className="btn sm rn-mv" onClick={() => repMoveTo(d)}>이동</button>}</span>
                        : <span className={`badge ${st !== "가능" ? "warn" : repMs && n >= repMs.left ? "warn" : "ok"}`}>{st !== "가능" ? st : repMs && n >= repMs.left ? "단건" : "가능"}</span>}
                    </div>
                  );
                }); })()}
              </div>
            </div>
          )}
          {/* 예약 정보 */}
          <div className={`rd-sec ${capFull ? "pc" : ""}`}>
            <b>예약 정보</b>
            {clash ? <span className="rd-no">{clash.cust ? "이 고객" : clash.other.staff_name ?? staffName ?? "담당"} {clash.other.start_time.slice(0, 5)} 겹침</span>
              : prog && left !== null && !ro && (left > 0
              ? <span className="rd-ok">✓ {staffName ? `${staffName} · ` : ""}이 시간 {left}자리 비어 있음</span>
              : !capFull && <span className="rd-no">이 시간 정원이 다 찼어요</span>)}
          </div>
          {!clash && capFull && prog && (
            <div className="rn-ban warn mo" role="alert">
              <b>{time} {prog.name} 정원이 찼어요</b>
              <p>같은 시간 최대 {prog.capacity}건이 모두 찼어요. 입력은 그대로예요.</p>
              <div className="bt">{capAlts.map((a, i) => <button key={a.m} className={`btn sm ${i === 0 ? "p" : ""}`} onClick={() => setTime(hm(a.m))}>{hm(a.m)} · {a.n}자리</button>)}</div>
            </div>
          )}
          <div className="rd-grid rn-dt">
            <span className="rd-k">날짜 · 시간</span>
            <div className="rd-line">
              <input type="date" className="inp pc" style={{ width: 160 }} value={day} disabled={ro} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <button type="button" className="inp mo rn-dbtn num" disabled={ro} onClick={() => setPick(true)}>{md(day)} ({DOW[dow(day)]})</button>
              <button type="button" className="inp mo rn-tbtn num" disabled={ro} onClick={() => setPick(true)}>{time}</button>
              <select className="sel pc" data-f="time" style={{ width: 112 }} value={time} disabled={ro} onChange={(e) => setTime(e.target.value)}>
                {SLOTS.map((m) => {
                  const v = hm(m);
                  const full = prog ? usedAt(rows, day, prog.id, m, prog.minutes, draft.id) >= prog.capacity : false;
                  return <option key={m} value={v} disabled={full && v !== draft.start_time}>{v}{full && v !== draft.start_time ? " 마감" : ""}</option>;
                })}
              </select>
              <span className="rd-dim">~</span>
              <span className="inp rd-ro num">{endTime || "--:--"}</span>
              <span className="rd-dim">자동</span>
            </div>
          </div>
          {day !== draft.day && <div className="rd-help">{fmtDay(day)} 정원은 저장할 때 다시 확인해요.</div>}
          <div className="rd-grid rn-st">
            <span className="rd-k">담당</span>
            <select className="sel" data-f="staff" style={{ maxWidth: 220 }} value={staffId} disabled={ro} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">담당 미정</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
            </select>
          </div>
          {prog && (
            <div className="rd-grid rn-same">
              <span className="rd-k">같은 시간</span>
              <span className="num"><span className="rn-mo">끝나는 시간은 관리 시간으로 자동 · 같은 시간 </span>{(left ?? 1) <= 0 ? <b className="rn-full">{prog.short || prog.name} {prog.capacity}/{prog.capacity} 마감</b> : <>{prog.short || prog.name} {prog.capacity - Math.max(left ?? 0, 0)}/{prog.capacity}</>} <span className="rd-dim">정원은 설정 › 프로그램 설정</span></span>
            </div>
          )}

          {/* 관리 선택 */}
          <div className="rd-box rd-pick">
            <div className="rd-sec" style={{ margin: 0 }}><b>관리 선택</b><span className="rd-dim">{prog ? `${prog.minutes}분` : ""}</span></div>
            <div className="rd-item">
              {prog && <span className="rd-chip" style={{ background: `color-mix(in srgb, ${prog.color ?? "#8A8A8A"} 16%, #fff)` }}>{prog.short || prog.name}</span>}
              <select className="sel" data-f="prog" value={programId} disabled={ro} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">관리를 골라 주세요</option>
                {groups.map(([g, list]) => (
                  <optgroup key={g} label={g === "업무" ? "업무·행사" : g}>
                    {list.map((p) => <option key={p.id} value={p.id}>{p.parent_id ? "└ " : ""}{p.name} · {p.minutes}분</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="rd-memo">
            <span className="rd-k">관리 메모</span>
            <textarea className="inp" rows={1} value={memo} disabled={ro} onChange={(e) => setMemo(e.target.value)} placeholder="예: 왼쪽 어깨 위주 · 압 약하게" />
          </div>

          {repMsg && <div className="rd-rep-msg">{repMsg}</div>}
          {!editing && <div className="rn-rec">저장하면 등록한 직원이 자동으로 기록돼요</div>}

          {editing && (
            <div className="rd-help">
              최초 등록 {draft.created_at ? new Date(draft.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : ""} · 접수 {draft.receiver_name ?? "-"}
              {draft.cancel_reason ? ` · 사유: ${draft.cancel_reason}` : ""}
            </div>
          )}

          {askReason && (
            <RsvStatusAsk me={me} branch={branch} kind={askReason === "노쇼" ? "rsv_noshow" : "rsv_cancel"}
              rsv={{ id: String(draft.id), customer: cust?.name ?? "고객", phone: sum?.customer?.phone ?? null, customerKey: cust?.key ?? null, when: `${fmtDay(day)} ${time.slice(0, 5)}`, program: prog?.name ?? "", staff: staffName ?? null }}
              msName={active.find((x) => x.kind === "회차")?.name ?? null}
              left={(() => { const m = active.find((x) => x.kind === "회차"); return m ? m.items.reduce((a, i) => a + i.total + (i.service ?? 0) - i.used, 0) : null; })()}
              onBack={() => setAskReason(null)}
              onDone={(msg) => { setAskReason(null); setErr(""); alertDone(msg); }}
              fallback={async (why) => { const { error } = await sb.rpc("rsv_set_status", { p_id: draft.id, p_status: askReason, p_reason: why }); return error ? error.message : null; }} />
          )}
          </>}
          {doneMsg && <p className="ap-ok">{doneMsg}</p>}
          {err && <p style={{ color: "var(--red)", marginTop: 12 }}>{err}</p>}
        </div>
        {paidPanel && <div className="ft rn-pft">{paidPanel}</div>}
        {canWrite && !paidPanel && (
          <div className="ft">
            {editing && draft.status === "예약" && !askReason && (
              <>
                <button className="btn" onClick={() => setAskReason("노쇼")}>노쇼</button>
                <button className="btn" onClick={() => setAskReason("취소")}>예약 취소</button>
              </>
            )}
            {editing && (draft.status === "취소" || draft.status === "노쇼") && (
              <button className="btn" disabled={busy} onClick={() => setStatus("예약")}>예약으로 되돌리기</button>
            )}
            {!editing && rep && !repDone && <button className="btn" onClick={onClose}><span className="pc">닫기</span><span className="mo">취소</span></button>}
            {nf && <><button className="btn mo" onClick={onClose}>취소</button><button className="btn p mo" disabled={busy} onClick={() => { setPayAfter(false); save(undefined, false); }}>등록하고 예약</button></>}
            <div style={{ flex: 1 }} />
            {repDone ? <button className="btn p" onClick={onSaved}>닫기</button>
              : !locked && mode !== "sale" && <>{rep && repBad > 0 && <span className="rd-dim">충돌 {repBad}건 처리하면 켜져요</span>}{capFull && <span className="rd-dim">시간을 옮기면 켜져요</span>}<button className={`${editing || (!work && !rep) ? "btn" : "btn p"} ${nf ? "pc" : ""}`} disabled={busy || repBad > 0 || capFull} onClick={() => { setPayAfter(false); save(undefined, false); }}>{editing ? "저장" : rep ? <><span className="pc">{repDays.length}건 저장</span><span className="mo">{repDays.length}건 예약등록</span></> : "저장"}</button></>}
            {!editing && !work && !rep && mode !== "sale" && !repDone && (
              <button className={`btn p ${nf ? "pc" : ""}`} disabled={busy || !canPay || capFull} title={canPay ? undefined : "결제 권한이 없어요"} onClick={() => { setPayAfter(true); save(undefined, true); }}>결제</button>
            )}
            {editing && !work && draft.status === "예약" && cust && (
              <button className="btn p" disabled={!canPay} title={canPay ? undefined : "결제 권한이 없어요"} onClick={() => setPayOpen(true)}>결제</button>
            )}
          </div>
        )}
        {pick && <TimePick day={day} time={time} staffId={staffId} staff={staff} rows={rows} offDays={offDays} prog={prog} draftId={draft.id} custKey={work ? null : cust?.key ?? null}
          onClose={() => setPick(false)} onRep={() => { setPick(false); setMode("rsv"); setRep(true); }}
          onPick={(d, t, sid) => { setDay(d); setTime(t); if (sid) setStaffId(sid); setPick(false); }} />}
      </aside>
      {atOpen && cust && (
        <AlimtalkModal customerKey={cust.key} suggest={editing ? "RESERVE_REMIND" : undefined} onClose={() => setAtOpen(false)}
          prefill={{ name: cust.name, reservation_date: day ? `${+day.slice(5, 7)}월 ${+day.slice(8, 10)}일` : "", reservation_time: time ?? "", program_name: prog?.name ?? "" }} />
      )}
      {payOpen && (draft.id || newId) && cust && (
        <PayModal branch={branch} programs={programs} head={custHead} onClose={() => { setPayOpen(false); if (newId) onSaved(); }} onDone={() => { setPayOpen(false); onSaved(); }}
          rsv={{ id: (draft.id ?? newId)!, day: draft.id ? draft.day : day, start_time: draft.id ? draft.start_time : time, customer_key: cust.key, customer_name: cust.name, program_id: draft.id ? draft.program_id ?? null : programId || null, staff_name: draft.staff_name ?? staffName ?? null }} />
      )}
    </>
  );
}

// 모바일 날짜·시간 고르기 시트 (시안 M07): 달력(날마다 예약 수·휴무) + 담당별 빈 시간
function TimePick({ day, time, staffId, staff, rows, offDays, prog, draftId, custKey, onClose, onRep, onPick }: {
  day: string; time: string; staffId: string; staff: { id: string; name: string }[]; rows: Rsv[]; offDays: string[]; prog?: Program; draftId?: string | null; custKey: string | null;
  onClose: () => void; onRep: () => void; onPick: (d: string, t: string, staffId: string) => void;
}) {
  const [d, setD] = useState(day);
  const [sel, setSel] = useState<{ s: string; m: number }>({ s: staffId || staff[0]?.id || "", m: toMin(time) });
  const [ym, setYm] = useState(day.slice(0, 7));
  const mins = prog?.minutes ?? 60;
  const first = `${ym}-01`;
  const lead = dow(first);
  const nDays = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: nDays }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`)];
  const live = (r: Rsv) => r.status === "예약" || r.status === "완료";
  const cnt = (x: string) => rows.filter((r) => r.day === x && live(r)).length;
  const shift = (n: number) => { const dt = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)); setYm(dt.toISOString().slice(0, 7)); };
  const busyAt = (sid: string, m: number) => rows.some((r) => r.day === d && r.id !== draftId && live(r) && toMin(r.start_time) < m + mins && m < toMin(r.start_time) + (r.minutes || 30) && (r.staff_id === sid || (!!custKey && r.customer_key === custKey)))
    || (!!prog && usedAt(rows, d, prog.id, m, mins, draftId ?? undefined) >= prog.capacity);
  const base = toMin(time);
  // 담당마다 지금 시간에서 가까운 세 칸 (찬 칸은 줄을 그어 보여 줘요)
  const slotsFor = (sid: string) => SLOTS.filter((m) => m + mins <= DAY_END && m % 30 === 0).sort((a, b) => Math.abs(a - base) - Math.abs(b - base) || a - b).slice(0, 3).sort((a, b) => a - b).map((m) => ({ m, busy: busyAt(sid, m) }));
  const list = staff.length ? staff : [{ id: "", name: "담당 미정" }];
  const who = list.find((x) => x.id === sel.s)?.name ?? "담당 미정";
  return (
    <>
      <div className="rn-pk-dim" onClick={onClose} />
      <div className="rn-pk" role="dialog" aria-label="날짜 · 시간">
        <div className="rn-pk-hd"><b>날짜 · 시간</b><button className="rd-x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="rn-pk-bd">
          <div className="rn-pk-mh"><button onClick={() => shift(-1)} aria-label="이전 달">‹</button><b className="num">{ym.slice(0, 4)}년 {Number(ym.slice(5))}월</b><button onClick={() => shift(1)} aria-label="다음 달">›</button></div>
          <div className="rn-pk-cal">
            {DOW.map((w) => <span key={w} className="w">{w}</span>)}
            {cells.map((c, i) => c == null ? <span key={`e${i}`} /> : (
              <button key={c} className={`c ${c === d ? "on" : ""} ${offDays.includes(c) ? "off" : ""}`} disabled={offDays.includes(c)} onClick={() => setD(c)}>
                <b className="num">{Number(c.slice(8))}</b><span className={`num ${cnt(c) >= 16 ? "hot" : ""}`}>{offDays.includes(c) ? "휴무" : cnt(c) || ""}</span>
              </button>
            ))}
          </div>
          <div className="rn-pk-sh"><b className="num">{md(d)} ({DOW[dow(d)]})</b><span>비어 있고 정원이 남은 시간</span></div>
          {list.map((st) => (
            <div key={st.id} className="rn-pk-row">
              <span className="n">{st.name}</span>
              <div className="ts">{slotsFor(st.id).map(({ m, busy }) => (
                <button key={m} className={`t num ${sel.s === st.id && sel.m === m ? "on" : ""}`} disabled={busy} onClick={() => setSel({ s: st.id, m })}>{hm(m)}</button>
              ))}</div>
            </div>
          ))}
        </div>
        <div className="rn-pk-ft">
          <button className="btn" onClick={onRep}>반복예약</button>
          <button className="btn p" onClick={() => onPick(d, hm(sel.m), sel.s)}>{who} {hm(sel.m)} ~ {hm(sel.m + mins)}</button>
        </div>
      </div>
    </>
  );
}
