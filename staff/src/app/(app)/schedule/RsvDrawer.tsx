"use client";
import { useEffect, useMemo, useState } from "react";
import { sb, type Staff } from "@/lib/sb";
import Link from "next/link";
import { type Program, type Rsv, SLOTS, toMin, usedAt, fmtDay, todayKST, DOW, dow } from "@/lib/schedule";

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
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function RsvDrawer({ branch, draft, programs, rows, canWrite, onClose, onSaved, docked }: {
  docked?: boolean; branch: string; draft: Draft; programs: Program[]; rows: Rsv[]; canWrite: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const editing = !!draft.id;
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

  const save = async () => {
    setErr("");
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
    if (left !== null && left <= 0) return setErr(`이 시간 ${prog.name} 정원(${prog.capacity}명)이 다 찼어요.`);
    setBusy(true);
    const body = { branch, day, start_time: time, program_id: prog.id, customer_key: work ? null : c!.key, title: work ? title : "", staff_id: staffId, memo };
    const { error } = editing
      ? await sb.rpc("rsv_update", { p_id: draft.id, p: body })
      : await sb.rpc("rsv_create", { p: body });
    setBusy(false);
    if (error) return setErr(error.message);
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
          {(!docked || editing) && <button className="rd-x" onClick={onClose} aria-label="닫기" title={docked ? "새 예약으로" : "닫기"}>×</button>}
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
                <button className="btn sm" disabled title="문자 보내기는 준비 중이에요">문자</button>
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

          <div className="rd-grid">
            <span className="rd-k">관리 메모</span>
            <input className="inp" value={memo} disabled={ro} onChange={(e) => setMemo(e.target.value)} placeholder="예: 왼쪽 어깨 위주 · 압 약하게" />
          </div>

          {editing && (
            <div className="rd-help">
              최초 등록 {draft.created_at ? new Date(draft.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : ""} · 접수 {draft.receiver_name ?? "-"}
              {draft.cancel_reason ? ` · 사유: ${draft.cancel_reason}` : ""}
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
            {!locked && <button className={editing ? "btn" : "btn p"} disabled={busy} onClick={save}>{editing ? "저장" : "예약 등록"}</button>}
            {editing && !work && <button className="btn p" disabled title="결제 화면은 준비 중이에요">결제</button>}
          </div>
        )}
      </aside>
    </>
  );
}
