"use client";
import { useState } from "react";
import { sb } from "@/lib/sb";

// 해피콜 대상 한 줄 (RPC happycall_list 반환 모양)
export type HcRow = {
  kind: "todo" | "expiring" | "lapsed" | "new"; item_id: string | null; customer_key: string; branch: string; name: string | null; phone: string | null;
  manager: string | null; reason: string; status: string; due_day: string | null; follow_day: string | null; assignee: string | null;
  membership: string | null; min_remaining: number | null; ends_on: string | null; last_visit_on: string | null; registered_on: string | null;
  last_result: string | null; last_note: string | null; last_called_at: string | null; last_handler: string | null;
};

export const kst = (d = new Date()) => new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);

const RESULTS = [
  { k: "예약완료", help: "통화하고 예약까지 잡았어요" },
  { k: "통화완료", help: "통화했지만 예약은 아직이에요" },
  { k: "부재", help: "안 받았어요. 다음 연락일에 다시 떠요" },
  { k: "거절", help: "연락을 원하지 않아요" },
  { k: "해당없음", help: "이미 예약했거나 대상이 아니에요" },
];
const KIND_LABEL = { todo: "예약표 할 일", expiring: "만료 임박", lapsed: "미방문", new: "첫 방문 후" } as const;

export function LogDrawer({ row, preset, onClose, onDone }: { row: HcRow; preset: string; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState(preset);
  const [note, setNote] = useState("");
  const tomorrow = kst(new Date(Date.now() + 864e5));
  const [follow, setFollow] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const needFollow = result === "부재" || result === "통화완료";

  async function save() {
    if (!result) return setMsg("통화 결과를 골라 주세요.");
    setBusy(true); setMsg("");
    const { error } = await sb.rpc("happycall_log", {
      p_item: row.item_id, p_customer_key: row.customer_key, p_branch: row.branch, p_kind: row.kind,
      p_result: result, p_note: note.trim(), p_follow_day: needFollow ? follow || null : null,
    });
    setBusy(false);
    if (error) return setMsg(error.message.includes("NO_PERMISSION") ? "해피콜 기록 권한이 없어요." : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
    onDone();
  }

  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="drawer" style={{ zIndex: 41 }} role="dialog" aria-label="해피콜 결과 기록">
        <div className="hd">해피콜 결과</div>
        <div className="bd">
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>{row.name ?? "-"} <span style={{ fontSize: "var(--fs-sm)", fontWeight: 400, color: "var(--ink-3)" }}>{row.branch}</span></div>
            <div className="num" style={{ marginTop: 4 }}>{row.phone || "연락처 없음"}</div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 8 }}>
              {KIND_LABEL[row.kind]} · {row.reason}<br />
              회원권 {row.membership || "-"}{row.min_remaining != null ? ` (잔여 ${row.min_remaining})` : ""} · 최근 방문 {row.last_visit_on ?? "-"}
            </div>
            {row.last_called_at && (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 8 }}>
                지난 통화 {kst(new Date(row.last_called_at))} {row.last_result} · {row.last_handler}{row.last_note ? ` · ${row.last_note}` : ""}
              </div>
            )}
          </div>
          <div className="field">
            <label>통화 결과 *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RESULTS.map((r) => (
                <button key={r.k} type="button" className={`chip ${result === r.k ? "on" : ""}`} title={r.help} onClick={() => setResult(r.k)}>{r.k}</button>
              ))}
            </div>
            {result && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 6 }}>{RESULTS.find((r) => r.k === result)?.help}</div>}
          </div>
          {needFollow && (
            <div className="field">
              <label>다음 연락일</label>
              <input className="inp" type="date" value={follow} min={tomorrow} onChange={(e) => setFollow(e.target.value)} style={{ maxWidth: 200 }} />
            </div>
          )}
          <div className="field">
            <label>메모</label>
            <textarea className="inp" style={{ height: 96, padding: 12, resize: "vertical" }} placeholder="고객이 한 말, 다음에 챙길 것" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {msg && <p style={{ color: "var(--red)", fontSize: "var(--fs-sm)" }}>{msg}</p>}
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn p" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </>
  );
}
