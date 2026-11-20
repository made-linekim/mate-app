"use client";
import { useEffect, useMemo, useState } from "react";
import { sb, type Staff } from "@/lib/sb";
import { type Program, type Rsv, SLOTS, toMin, slotLabel, usedAt, fmtDay } from "@/lib/schedule";

// 새 예약은 day/start_time/program_id 만, 기존 예약은 Rsv 전체
export type Draft = Partial<Rsv> & { day: string; start_time: string; program_id?: string | null };
type Cust = { key: string; branch: string; name: string; phone: string | null; membership: string | null; min_remaining: number | null; ends_on: string | null };

const isWork = (p?: Program) => !!p && (p.grp === "업무" || p.grp === "행사");

export default function RsvDrawer({ branch, draft, programs, rows, canWrite, onClose, onSaved }: {
  branch: string; draft: Draft; programs: Program[]; rows: Rsv[]; canWrite: boolean;
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
  const [reason, setReason] = useState("");

  useEffect(() => {
    sb.from("staff_accounts").select("*").eq("branch", branch).eq("status", "active").order("name")
      .then(({ data }) => setStaff((data ?? []) as Staff[]));
  }, [branch]);

  const prog = programs.find((p) => p.id === programId);
  const work = isWork(prog);
  const left = prog ? prog.capacity - usedAt(rows, day, prog.id, toMin(time), prog.minutes, draft.id) : null;

  // 프로그램 선택 목록: 그룹별 (하위 프로그램은 부모 밑에)
  const groups = useMemo(() => {
    const m = new Map<string, Program[]>();
    programs.forEach((p) => { const g = p.grp === "행사" ? "업무" : p.grp; m.set(g, [...(m.get(g) ?? []), p]); });
    return [...m.entries()];
  }, [programs]);

  const search = async () => {
    if (!q.trim()) return;
    const { data, error } = await sb.rpc("customer_list", { p_q: q.trim(), p_branch: branch, p_filter: "all", p_limit: 20, p_offset: 0 });
    if (error) { setErr(error.message); return; }
    setFound((data ?? []) as Cust[]);
  };

  const save = async () => {
    setErr("");
    if (!prog) return setErr("프로그램을 골라 주세요.");
    if (!work && !cust) return setErr("고객을 골라 주세요.");
    if (left !== null && left <= 0) return setErr(`이 시간 ${prog.name} 정원(${prog.capacity}명)이 다 찼어요.`);
    setBusy(true);
    const body = { branch, day, start_time: time, program_id: prog.id, customer_key: work ? null : cust!.key, title: work ? title : "", staff_id: staffId, memo };
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

  return (
    <>
      <div className="dim" style={{ zIndex: 20 }} onClick={onClose} />
      <aside className="drawer" style={{ zIndex: 21 }} role="dialog" aria-label={editing ? "예약 상세" : "예약 등록"}>
        <div className="hd">
          {editing ? "예약 상세" : "예약 등록"}
          {editing && draft.status !== "예약" && (
            <span className={`badge ${draft.status === "완료" ? "ok" : draft.status === "노쇼" ? "warn" : "em"}`} style={{ marginLeft: 8 }}>
              {draft.status === "완료" ? "결제완료" : draft.status}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn t sm" onClick={onClose} aria-label="닫기">닫기</button>
        </div>
        <div className="bd">
          {/* 고객 */}
          {!work && (
            <div className="field">
              <label>고객</label>
              {cust ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{cust.name}</span>
                  {!ro && !editing && <button className="btn sm t" onClick={() => { setCust(null); setFound(null); }}>다른 고객</button>}
                </div>
              ) : (
                <>
                  <form style={{ display: "flex", gap: 8 }} onSubmit={(e) => { e.preventDefault(); search(); }}>
                    <input className="inp" placeholder="이름 또는 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                    <button className="btn">검색</button>
                  </form>
                  {found && (
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
                </>
              )}
            </div>
          )}

          {/* 프로그램 */}
          <div className="field">
            <label>프로그램</label>
            <select className="sel" value={programId} disabled={ro} onChange={(e) => setProgramId(e.target.value)}>
              <option value="">선택해 주세요</option>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={g === "업무" ? "업무·행사" : g}>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.parent_id ? "└ " : ""}{p.name}</option>)}
                </optgroup>
              ))}
            </select>
            {prog && (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 4 }} className="num">
                {prog.minutes}분 · 정원 {prog.capacity}명
                {left !== null && !ro && (
                  <span style={{ marginLeft: 6, color: left <= 0 ? "var(--red)" : "var(--grn)", fontWeight: 600 }}>
                    {left <= 0 ? "이 시간 정원 마감" : `이 시간 ${left}자리 남음`}
                  </span>
                )}
              </div>
            )}
          </div>

          {work && (
            <div className="field">
              <label>내용</label>
              <input className="inp" value={title} disabled={ro} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 회의" />
            </div>
          )}

          {/* 날짜·시간 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: "var(--sp-4)" }}>
            <div className="field">
              <label>날짜</label>
              <input type="date" className="inp" value={day} disabled={ro} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </div>
            <div className="field" style={{ marginTop: 0 }}>
              <label>시간</label>
              <select className="sel" value={time} disabled={ro} onChange={(e) => setTime(e.target.value)}>
                {SLOTS.map((m) => {
                  const v = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                  const full = prog ? usedAt(rows, day, prog.id, m, prog.minutes, draft.id) >= prog.capacity : false;
                  return <option key={m} value={v} disabled={full && v !== draft.start_time}>{slotLabel(m)}{full ? " (마감)" : ""}</option>;
                })}
              </select>
            </div>
          </div>
          {day !== draft.day && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 4 }}>{fmtDay(day)} 정원은 저장할 때 다시 확인해요.</div>}

          {/* 담당 */}
          <div className="field" style={{ marginTop: "var(--sp-4)" }}>
            <label>담당 직원</label>
            <select className="sel" value={staffId} disabled={ro} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">미지정</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
            </select>
          </div>

          <div className="field">
            <label>관리 메모</label>
            <textarea className="inp" style={{ height: 88, padding: 12, resize: "vertical" }} value={memo} disabled={ro} onChange={(e) => setMemo(e.target.value)} />
          </div>

          {editing && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 16 }}>
              접수 {draft.receiver_name ?? "-"} · {draft.created_at ? new Date(draft.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : ""}
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
          <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 16 }}>
            소요 시간은 프로그램 기본값으로 잡혀요. 예약 문자·알림톡은 설정에서 켜고 끌 수 있어요.
          </p>
        </div>
        {canWrite && (
          <div className="ft">
            {editing && draft.status === "예약" && !askReason && (
              <>
                <button className="btn sm danger" onClick={() => setAskReason("취소")}>예약 취소</button>
                <button className="btn sm" onClick={() => setAskReason("노쇼")}>노쇼</button>
                <div style={{ flex: 1 }} />
              </>
            )}
            {editing && (draft.status === "취소" || draft.status === "노쇼") && (
              <button className="btn" disabled={busy} onClick={() => setStatus("예약")}>예약으로 되돌리기</button>
            )}
            {!locked && <button className="btn p" disabled={busy} onClick={save}>{editing ? "저장" : "예약 등록"}</button>}
          </div>
        )}
      </aside>
    </>
  );
}
