"use client";
import { useEffect, useMemo, useState } from "react";
import { sb, type Staff } from "@/lib/sb";
import Link from "next/link";
import { useMe } from "@/lib/me";
import PayModal from "./PayModal";
import AlimtalkModal from "@/components/AlimtalkModal";
import { type Program, type Rsv, SLOTS, toMin, usedAt, DAY_START, DAY_END, fmtDay, todayKST, DOW, dow } from "@/lib/schedule";

// 새 예약은 day/start_time/program_id 만, 기존 예약은 Rsv 전체
export type Draft = Partial<Rsv> & { day: string; start_time: string; program_id?: string | null };
type Cust = { key: string; branch: string; name: string; phone: string | null; membership: string | null; min_remaining: number | null; ends_on: string | null };

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

export default function RsvDrawer({ branch, draft, programs, rows, canWrite, onClose, onSaved, docked }: {
  docked?: boolean; branch: string; draft: Draft; programs: Program[]; rows: Rsv[]; canWrite: boolean;
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
  // 새 예약 팝업: 일반 예약 / 일정 등록, 고객은 기존 검색 / 신규 입력
  const [mode, setMode] = useState<"rsv" | "work">(isWork(programs.find((p) => p.id === draft.program_id)) ? "work" : "rsv");
  const [custMode, setCustMode] = useState<"old" | "new">("old");
  const [nName, setNName] = useState("");
  const [nPhone, setNPhone] = useState("");
  const [reason, setReason] = useState("");
  // 겹침 안내 (시안 1120 U-MO-RSV-1 시간겹침 · 같은고객): 강제 저장 없이 비어 있는 다른 시간을 골라 저장
  const [clash, setClash] = useState<{ cust: boolean; other: Rsv; alts: number[] } | null>(null);
  const [alt, setAlt] = useState<number | null>(null);
  // 반복 예약: 첫 예약과 같은 시간·관리로 주기마다 N회
  const [rep, setRep] = useState(false);
  const [repEvery, setRepEvery] = useState(7);
  const [repN, setRepN] = useState(4);
  const [repMsg, setRepMsg] = useState("");
  const [repDone, setRepDone] = useState(false);
  const repDays = useMemo(() => Array.from({ length: rep ? repN : 1 }, (_, i) => addD(day, i * repEvery)), [rep, repN, repEvery, day]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setFound((data ?? []) as Cust[]);
  };

  // 같은 담당 또는 같은 고객이 같은 시간에 이미 예약(취소·노쇼 제외)이 있는지
  const findClash = (at: number, ck: string | null, mins: number, onDay = day) => rows.find((r) =>
    r.day === onDay && r.id !== draft.id && (r.status === "예약" || r.status === "완료")
    && toMin(r.start_time) < at + mins && at < toMin(r.start_time) + (r.minutes || 30)
    && ((!!ck && r.customer_key === ck) || (!!staffId && r.staff_id === staffId)));
  const save = async (atOverride?: number) => {
    setErr("");
    const at = atOverride ?? toMin(time);
    if (!prog) return setErr("프로그램을 골라 주세요.");
    let c = cust;
    if (!work && !c && custMode === "new") {
      if (!nName.trim() || nPhone.replace(/\D/g, "").length < 10) return setErr("신규 고객 이름과 연락처를 넣어 주세요.");
      setBusy(true);
      const { data, error } = await sb.rpc("customer_create", { p_branch: branch, p_name: nName.trim(), p_phone: nPhone.replace(/\D/g, "") });
      setBusy(false);
      if (error) return setErr(/customer_create|function/i.test(error.message) ? "신규 고객 등록은 서버 준비 중이에요. 지금은 고객 메뉴에 있는 고객만 예약할 수 있어요." : error.message);
      c = { key: data as string, name: nName.trim() };
      setCust(c);
    }
    if (!work && !c) return setErr("고객을 골라 주세요.");
    if (atOverride == null && left !== null && left <= 0) return setErr(`이 시간 ${prog.name} 정원(${prog.capacity}명)이 다 찼어요.`);
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
    const { error } = editing
      ? await sb.rpc("rsv_update", { p_id: draft.id, p: body })
      : await sb.rpc("rsv_create", { p: body });
    setBusy(false);
    if (error) return setErr(error.message);
    if (!editing && rep && repDays.length > 1) {
      setBusy(true);
      const fail: string[] = [];
      for (const d of repDays.slice(1)) {
        if (findClash(at, ck, prog.minutes, d)) { fail.push(`${md(d)} 겹침`); continue; }
        const r = await sb.rpc("rsv_create", { p: { ...body, day: d } });
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

  const ro = !canWrite || locked;
  const today = todayKST();
  const endTime = prog ? hm(toMin(time) + prog.minutes) : "";
  const last = (st: string) => sum?.visits.find((v) => v.status === st)?.day;
  const lastVisit = sum?.customer.last_visit_on ?? sum?.visits.find((v) => v.status === "완료" || v.status === "방문")?.day;
  const active = (sum?.memberships ?? []).filter((m) => m.status === "사용중");
  const staffName = staff.find((s) => s.id === staffId)?.name;

  return (
    <>
      {!docked && <div className="dim" style={{ zIndex: 20 }} onClick={onClose} />}
      <aside className={docked ? "rd rd-docked" : editing ? "drawer rd" : "drawer rd rd-modal"} style={docked ? undefined : { zIndex: 21 }} role="dialog" aria-label={editing ? "예약 수정" : "새 예약"}>
        <div className="hd">
          {editing ? "예약 수정" : "새 예약"}
          <span className="rd-sub num">{md(day)} ({DOW[dow(day)]}) {time}</span>
          {editing && draft.status !== "예약" && (
            <span className={`badge ${draft.status === "완료" ? "ok" : draft.status === "노쇼" ? "warn" : "em"}`} style={{ marginLeft: 8 }}>
              {draft.status === "완료" ? "결제 완료" : draft.status}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="rd-x" onClick={onClose} aria-label="닫기" title="닫기">×</button>
        </div>
        {!editing && (
          <div className="rd-tabs">
            <button className={mode === "rsv" ? "on" : ""} onClick={() => { setMode("rsv"); setProgramId(""); }}>일반 예약</button>
            <button className={mode === "work" ? "on" : ""} onClick={() => { setMode("work"); setProgramId(""); }}>일정 등록</button>
          </div>
        )}
        <div className="bd">
          {/* 고객 */}
          {!work && (cust ? (
            <>
              <div className="rd-box rd-cust">
                <b>{cust.name}</b>
                <span className="num">{sum?.customer.phone ?? ""}</span>
                <div style={{ flex: 1 }} />
                <Link className="btn sm" href={`/customers/chart?b=${encodeURIComponent(branch)}&k=${encodeURIComponent(cust.key)}`}>고객 차트</Link>
                <button className="btn sm" onClick={() => setAtOpen(true)}>알림톡</button>
                {!ro && !editing && <button className="btn sm t" onClick={() => { setCust(null); setFound(null); }}>변경</button>}
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
                <div className="rd-box rd-row"><span className="rd-k">비고</span><span className="rd-ell">{sum.memos[0].body}</span></div>
              )}
            </>
          ) : (
            <div className="rd-custpick">
              <div className="rd-sec" style={{ margin: 0 }}>
                <b>고객</b>
                <div className="seg sm" style={{ marginLeft: "auto" }}>
                  <button className={custMode === "old" ? "on" : ""} onClick={() => setCustMode("old")}>기존 고객</button>
                  <button className={custMode === "new" ? "on" : ""} onClick={() => setCustMode("new")}>신규 고객</button>
                </div>
              </div>
              {custMode === "new" ? (
                <div className="rd-line" style={{ marginTop: 8 }}>
                  <input className="inp" style={{ flex: 1 }} placeholder="이름" value={nName} onChange={(e) => setNName(e.target.value)} autoFocus />
                  <input className="inp num" style={{ flex: 1.3 }} placeholder="연락처 010-0000-0000" inputMode="tel" value={nPhone} onChange={(e) => setNPhone(e.target.value)} />
                </div>
              ) : (
              <form style={{ display: "flex", gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
                <input className="inp" placeholder="고객 이름 · 전화번호 뒤 4자리로 찾기" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                <button className="btn">검색</button>
              </form>
              )}
              {custMode === "old" && found && (
                <div className="card" style={{ padding: 0, marginTop: 8, maxHeight: 240, overflow: "auto" }}>
                  {found.length === 0 && <div style={{ padding: 12, color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>찾는 고객이 없어요</div>}
                  {found.map((c) => (
                    <button key={c.key} onClick={() => { setCust({ key: c.key, name: c.name }); setFound(null); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: 0, borderBottom: "1px solid var(--line)", background: "var(--bg)" }}>
                      <div style={{ fontWeight: 600 }}>{c.name} <span className="num" style={{ color: "var(--ink-3)", fontWeight: 400 }}>{c.phone ?? ""}</span></div>
                      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>
                        {c.membership ? `${c.membership}${c.min_remaining != null ? ` · 잔여 ${c.min_remaining}회` : ""}${c.ends_on ? ` · ~${c.ends_on}` : ""}` : "회원권 없음"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {work && (
            <div className="rd-grid">
              <span className="rd-k">내용</span>
              <input className="inp" value={title} disabled={ro} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 회의" />
            </div>
          )}

          {/* 예약 정보 */}
          <div className="rd-sec">
            <b>예약 정보</b>
            {prog && left !== null && !ro && (left > 0
              ? <span className="rd-ok">✓ {staffName ? `${staffName} · ` : ""}이 시간 {left}자리 비어 있음</span>
              : <span className="rd-no">이 시간 정원이 다 찼어요</span>)}
          </div>
          <div className="rd-grid">
            <span className="rd-k">날짜 · 시간</span>
            <div className="rd-line">
              <input type="date" className="inp" style={{ width: 160 }} value={day} disabled={ro} onChange={(e) => e.target.value && setDay(e.target.value)} />
              <select className="sel" style={{ width: 112 }} value={time} disabled={ro} onChange={(e) => setTime(e.target.value)}>
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
          <div className="rd-grid">
            <span className="rd-k">담당</span>
            <select className="sel" style={{ maxWidth: 220 }} value={staffId} disabled={ro} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">담당 미정</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
            </select>
          </div>
          {prog && (
            <div className="rd-grid">
              <span className="rd-k">같은 시간</span>
              <span className="num">{prog.short || prog.name} {prog.capacity - Math.max(left ?? 0, 0)}/{prog.capacity} <span className="rd-dim">정원은 설정 › 관리 항목</span></span>
            </div>
          )}

          {/* 관리 선택 */}
          <div className="rd-box rd-pick">
            <div className="rd-sec" style={{ margin: 0 }}><b>관리 선택</b><span className="rd-dim">{prog ? `${prog.minutes}분` : ""}</span></div>
            <div className="rd-item">
              {prog && <span className="rd-chip" style={{ background: `color-mix(in srgb, ${prog.color ?? "#8A8A8A"} 16%, #fff)` }}>{prog.short || prog.name}</span>}
              <select className="sel" value={programId} disabled={ro} onChange={(e) => setProgramId(e.target.value)}>
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
            <textarea className="inp" rows={5} value={memo} disabled={ro} onChange={(e) => setMemo(e.target.value)} placeholder="예: 왼쪽 어깨 위주 · 압 약하게" />
          </div>

          {!editing && !ro && (
            <div className="rd-rep">
              <label className="rd-rep-on"><input type="checkbox" checked={rep} onChange={(e) => setRep(e.target.checked)} /> 반복 예약</label>
              {rep && (
                <>
                  <div className="rd-rep-row">
                    <select className="sel" value={repEvery} onChange={(e) => setRepEvery(Number(e.target.value))}>
                      <option value={7}>매주 같은 요일</option>
                      <option value={14}>2주마다</option>
                      <option value={1}>매일</option>
                    </select>
                    <select className="sel" value={repN} onChange={(e) => setRepN(Number(e.target.value))}>
                      {Array.from({ length: 19 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>총 {n}회</option>)}
                    </select>
                  </div>
                  <div className="rd-rep-days num">{repDays.map((d) => <span key={d}>{md(d)}({DOW[dow(d)]})</span>)}</div>
                </>
              )}
            </div>
          )}
          {repMsg && <div className="rd-rep-msg">{repMsg}</div>}

          {editing && (
            <div className="rd-help">
              최초 등록 {draft.created_at ? new Date(draft.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : ""} · 접수 {draft.receiver_name ?? "-"}
              {draft.cancel_reason ? ` · 사유: ${draft.cancel_reason}` : ""}
            </div>
          )}

          {editing && draft.status === "완료" && (
            <div className="rd-paid">
              {paid ? (
                <>
                  <div className="t"><span>결제 내용</span><b className="num">{(paid.gross - paid.discount).toLocaleString()}원</b></div>
                  {paid.detail?.sessions && <div className="r"><span>회원권 차감</span><span>{paid.detail.sessions}</span></div>}
                  {paid.new_membership && <div className="r"><span>회원권 판매</span><span>{paid.new_membership}</span></div>}
                  <div className="r num"><span>받은 금액</span><span>{[["card", "카드"], ["cash", "현금"], ["account", "계좌"], ["local", "지역화폐"]].filter(([k]) => (paid.pay?.[k] ?? 0) > 0).map(([k, l]) => `${l} ${paid.pay[k].toLocaleString()}`).join(" · ") || "0"}</span></div>
                  {paid.discount > 0 && <div className="r num"><span>할인</span><span>-{paid.discount.toLocaleString()}</span></div>}
                  {paid.unpaid > 0 && <div className="r num"><span>미수금</span><span style={{ color: "var(--red)" }}>{paid.unpaid.toLocaleString()}</span></div>}
                  <div className="r"><span>결제</span><span>{paid.created_by} · {new Date(paid.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}</span></div>
                  {canPayCancel && !cxAsk && <div className="cx"><div style={{ flex: 1 }} /><button className="btn sm" onClick={() => setCxAsk(true)}>결제 취소</button></div>}
                  {cxAsk && (
                    <div className="cx">
                      <input className="inp" placeholder="취소 사유 (선택)" value={cxReason} onChange={(e) => setCxReason(e.target.value)} />
                      <button className="btn sm t" onClick={() => setCxAsk(false)}>돌아가기</button>
                      <button className="btn sm danger" disabled={busy} onClick={payCancel}>결제 취소</button>
                    </div>
                  )}
                  {cxAsk && <span className="rd-dim">차감한 회차를 되돌리고 매출을 지워요. 예약은 다시 &apos;예약&apos; 상태가 돼요.</span>}
                </>
              ) : <span className="rd-dim">결제 기록이 없어요 (이전 프로그램에서 완료된 예약)</span>}
            </div>
          )}

          {askReason && (
            <div className="card" style={{ marginTop: 16, background: "var(--bg-soft)" }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{askReason === "취소" ? "예약을 취소할까요?" : "노쇼로 처리할까요?"}</div>
              <input className="inp" placeholder="사유 (선택)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button className="btn sm t" onClick={() => setAskReason(null)}>돌아가기</button>
                <button className="btn sm danger" disabled={busy} onClick={() => setStatus(askReason)}>{askReason === "취소" ? "예약 취소" : "노쇼 처리"}</button>
              </div>
            </div>
          )}
          {err && <p style={{ color: "var(--red)", marginTop: 12 }}>{err}</p>}
        </div>
        {canWrite && (
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
            <div style={{ flex: 1 }} />
            {repDone ? <button className="btn p" onClick={onSaved}>닫기</button>
              : !locked && <button className={editing ? "btn" : "btn p"} disabled={busy} onClick={() => save()}>{editing ? "저장" : rep ? `반복 예약 ${repN}건 등록` : "예약 등록"}</button>}
            {editing && !work && draft.status === "예약" && cust && (
              <button className="btn p" disabled={!canPay} title={canPay ? undefined : "결제 권한이 없어요"} onClick={() => setPayOpen(true)}>결제</button>
            )}
          </div>
        )}
        {clash && prog && (
          <>
            <div className="rd-clash-dim" onClick={() => setClash(null)} />
            <div className="rd-clash" role="dialog">
              <i className="grab" />
              <b className="t">{clash.cust ? "이 고객은 이미 이 시간에 예약이 있어요" : "이 시간에 이미 예약이 있어요"}</b>
              <p className="why">겹침은 같은 담당 또는 같은 고객이 같은 시간일 때예요. 겹친 채로는 저장하지 않아요.</p>
              <div className="who">{clash.other.customer_name || clash.other.title || "일정"} · {fmtDay(clash.other.day)} {clash.other.start_time.slice(0, 5)} – {hm(toMin(clash.other.start_time) + (clash.other.minutes || 30))}{clash.other.staff_name ? ` · 담당 ${clash.other.staff_name}` : ""}</div>
              <div className="lb">다른 시간</div>
              {clash.alts.length === 0 && <p className="why">이날 남은 빈 시간이 없어요. 날짜를 바꿔 주세요.</p>}
              {clash.alts.map((m) => (
                <button key={m} className={`alt ${alt === m ? "on" : ""}`} onClick={() => setAlt(m)}>
                  <b className="num">{hm(m)} – {hm(m + prog.minutes)}</b>
                  <span>{prog.name}{staffId ? ` · 담당 ${staff.find((x) => x.id === staffId)?.name ?? ""}` : ""} · 비어 있음</span>
                </button>
              ))}
              {alt == null && clash.alts.length > 0 && <p className="why">저장하려면 비어 있는 시간을 골라 주세요.</p>}
              <div className="bt">
                <button className="btn" onClick={() => setClash(null)}>닫기</button>
                <button className="btn p" disabled={alt == null || busy} onClick={() => { if (alt != null) { setTime(hm(alt)); save(alt); } }}>이 시간으로 저장</button>
              </div>
            </div>
          </>
        )}
      </aside>
      {atOpen && cust && (
        <AlimtalkModal customerKey={cust.key} suggest={editing ? "RESERVE_REMIND" : undefined} onClose={() => setAtOpen(false)}
          prefill={{ name: cust.name, reservation_date: day ? `${+day.slice(5, 7)}월 ${+day.slice(8, 10)}일` : "", reservation_time: time ?? "", program_name: prog?.name ?? "" }} />
      )}
      {payOpen && draft.id && cust && (
        <PayModal branch={branch} programs={programs} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); onSaved(); }}
          rsv={{ id: draft.id, day: draft.day, start_time: draft.start_time, customer_key: cust.key, customer_name: cust.name, program_id: draft.program_id ?? null, staff_name: draft.staff_name ?? staffName ?? null }} />
      )}
    </>
  );
}
