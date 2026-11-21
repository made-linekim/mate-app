"use client";
import { useState } from "react";
import { sb } from "@/lib/sb";
import "./approval.css";
import type { Staff as Me } from "@/lib/sb";

/* 요청 → 승인 (070 SQL). 직원은 요청을 보내고, 관리자·대표관리자는 같은 함수로 '바로 처리'돼요.
   결정 권한: 관리자 = 노쇼·취소·네이버 거절·회원권 조정·미수 정산·50만 원 미만 지출 / 그 밖(환불·결제 취소·권한·설정) = 대표관리자 */
export type Kind = "rsv_noshow" | "rsv_cancel" | "rsv_naver_reject" | "pay_cancel" | "refund" | "membership_adjust" | "expense" | "receivable_settle" | "perm_change" | "setting_change";
export const KIND_LABEL: Record<Kind, string> = {
  rsv_noshow: "노쇼", rsv_cancel: "예약 취소", rsv_naver_reject: "네이버 거절", pay_cancel: "결제 취소", refund: "환불",
  membership_adjust: "회원권 조정", expense: "지출", receivable_settle: "미수금 정산", perm_change: "권한 변경", setting_change: "설정 변경",
};
const MANAGER_OK: Kind[] = ["rsv_noshow", "rsv_cancel", "rsv_naver_reject", "membership_adjust", "receivable_settle"];
export function canDecide(me: Pick<Me, "tier">, kind: Kind, amount?: number | null) {
  if (me.tier === "owner") return true;
  if (me.tier === "manager") return MANAGER_OK.includes(kind) || (kind === "expense" && (amount ?? 0) < 500000);
  return false;
}
export const decider = (kind: Kind, amount?: number | null) =>
  MANAGER_OK.includes(kind) || (kind === "expense" && (amount ?? 0) < 500000) ? "관리자" : "대표관리자";

export type ReqInput = { branch: string; kind: Kind; targetType: string; targetId: string; payload?: Record<string, unknown>; amount?: number | null; reason: string };
/** 요청 보내기. 결과: done(바로 반영됨) · sent(승인 기다림) · need_sql(서버 준비 전) */
export async function sendRequest(me: Pick<Me, "tier">, r: ReqInput): Promise<{ state: "done" | "sent" | "need_sql"; error?: string }> {
  const { error } = await sb.rpc("approval_request", {
    p_branch: r.branch, p_kind: r.kind, p_target_type: r.targetType, p_target_id: r.targetId,
    p_payload: r.payload ?? {}, p_amount: r.amount ?? null, p_reason: r.reason,
  });
  if (error) {
    if (/approval_request|Could not find the function|does not exist/i.test(error.message)) return { state: "need_sql" };
    return { state: "sent", error: friendlyErr(error.message) };
  }
  return { state: canDecide(me, r.kind, r.amount) ? "done" : "sent" };
}
export function friendlyErr(m: string) {
  if (/REASON_REQUIRED/.test(m)) return "사유를 골라 주세요.";
  if (/NOTE_REQUIRED/.test(m)) return "반려 사유를 골라 주세요.";
  if (/ALREADY_DONE/.test(m)) return "이미 처리된 요청이에요.";
  if (/SELF_APPROVAL/.test(m)) return "내가 보낸 요청은 다른 사람이 승인해요.";
  if (/NO_PERMISSION/.test(m)) return "이 요청을 처리할 권한이 없어요.";
  if (/NO_BRANCH/.test(m)) return "이 지점 요청이 아니에요.";
  return m;
}

/** 사유 칩 + 직접 쓰기 */
export function ReasonPick({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const preset = options.includes(value) ? value : value ? "기타" : "";
  const [etc, setEtc] = useState(preset === "기타" ? value : "");
  return (
    <div className="ap-reason">
      <div className="ap-chips">
        {[...options, "기타"].map((o) => (
          <button key={o} type="button" className={preset === o ? "on" : ""} onClick={() => onChange(o === "기타" ? etc || "기타" : o)}>{o}</button>
        ))}
      </div>
      {preset === "기타" && <textarea className="inp ap-ta" placeholder="자세한 내용 (비워 둬도 돼요)" value={etc === "기타" ? "" : etc} onChange={(e) => { setEtc(e.target.value); onChange(e.target.value || "기타"); }} />}
    </div>
  );
}

/** 예약 노쇼 · 취소: 직원은 요청, 관리자 이상은 바로 처리 */
export function RsvStatusAsk({ me, branch, kind, rsv, left, msName, onBack, onDone, fallback }: {
  me: Pick<Me, "tier">; branch: string; kind: "rsv_noshow" | "rsv_cancel";
  rsv: { id: string; customer: string; phone?: string | null; when: string; program: string; staff?: string | null; customerKey?: string | null };
  left?: number | null; msName?: string | null; onBack: () => void; onDone: (msg: string) => void;
  fallback: (reason: string) => Promise<string | null>;   // 070 SQL 전: 예전 방식(rsv_set_status)
}) {
  const noshow = kind === "rsv_noshow";
  const canDeduct = noshow && left != null && left > 0;
  const [deduct, setDeduct] = useState(canDeduct);
  const reasons = noshow ? ["오지 않음", "연락이 안 됨", "늦게 취소", "기타"] : ["고객 요청", "일정 변경", "센터 사정", "기타"];
  const [pick, setPick] = useState(reasons[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const direct = canDecide(me, kind);
  const reason = detail.trim() ? `${pick} · ${detail.trim()}` : pick;
  const go = async () => {
    setBusy(true); setErr("");
    const r = await sendRequest(me, {
      branch, kind, targetType: "reservation", targetId: rsv.id, reason,
      payload: { customer: rsv.customer, customer_key: rsv.customerKey ?? null, when: rsv.when, program: rsv.program, deduct: noshow ? deduct : false },
    });
    if (r.state === "need_sql") {
      const e = await fallback(reason);
      setBusy(false);
      return e ? setErr(e) : onDone(noshow ? "노쇼로 바꿨어요" : "예약을 취소했어요");
    }
    setBusy(false);
    if (r.error) return setErr(r.error);
    onDone(r.state === "done" ? (noshow ? "노쇼로 처리했어요" : "예약을 취소했어요") : `${decider(kind)}에게 요청을 보냈어요`);
  };
  const what = noshow ? (deduct ? "노쇼 · 1회 차감" : "노쇼 · 기록만 (차감 없음)") : "예약 취소";
  const after = direct
    ? (noshow && deduct ? "바로 회원권 1회가 차감돼요. 되돌릴 수 없어요." : "바로 반영되고 기록에 남아요.")
    : `이 화면에서는 요청만 보낼 수 있어요. 승인되면 ${noshow && deduct ? "회원권 1회가 차감돼요." : "반영돼요."}`;
  return (
    <div className="ap-full" role="dialog" aria-label={noshow ? "노쇼 처리" : "예약 취소"}>
      <div className="ap-fhd">
        <b>{noshow ? "노쇼 처리" : "예약 취소"}</b><span className="badge">진행 전</span>
        <div style={{ flex: 1 }} />
        <button className="btn sm" onClick={onBack}>닫기</button>
      </div>
      <div className="ap-fb">
        <dl>
          <dt>고객</dt><dd>{rsv.customer}{rsv.phone ? ` · ${rsv.phone}` : ""}</dd>
          <dt>예약</dt><dd>{rsv.when} · {rsv.program}{rsv.staff ? ` · 담당 ${rsv.staff}` : ""}</dd>
          {noshow && <><dt>회원권</dt><dd>{msName ? `${msName}${left != null ? ` · 잔여 ${left}회` : ""}` : "쓸 수 있는 회원권 없음"}</dd></>}
          <dt>처리</dt><dd>{what}</dd>
        </dl>
        {noshow && (
          <>
            <div className="ap-l">처리</div>
            <div className="ap-chips">
              <button type="button" className={deduct ? "on" : ""} disabled={!canDeduct} onClick={() => setDeduct(true)}>1회 차감</button>
              <button type="button" className={!deduct ? "on" : ""} onClick={() => setDeduct(false)}>기록만 (차감 없음)</button>
            </div>
          </>
        )}
        <div className="ap-l">사유</div>
        <div className="ap-chips">
          {reasons.map((o) => <button key={o} type="button" className={pick === o ? "on" : ""} onClick={() => setPick(o)}>{o}</button>)}
        </div>
        <textarea className="inp ap-ta" value={detail} onChange={(e) => setDetail(e.target.value)} aria-label="자세한 내용" />
        <p className="ap-h">자세한 내용은 비워 두어도 돼요.</p>
        <p className="ap-h">{after}</p>
        {err && <p className="ap-err">{err}</p>}
      </div>
      <div className="ap-fft">
        <button className="btn p" disabled={busy} onClick={go}>{direct ? (noshow ? "노쇼 처리" : "예약 취소") : "요청 보내기"}</button>
      </div>
    </div>
  );
}
