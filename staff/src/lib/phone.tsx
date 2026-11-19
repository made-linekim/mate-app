"use client";
import { useState } from "react";
import { sb } from "@/lib/sb";

// 목록에는 가린 번호만 와요. 전체 번호는 버튼을 누를 때 서버에서 받고, 누가 봤는지 기록돼요.
const MSG: Record<string, string> = {
  NO_PERMISSION: "이 고객 번호를 볼 권한이 없어요",
  FORBIDDEN: "이 지점 고객 번호를 볼 권한이 없어요",
  DAILY_LIMIT: "오늘 볼 수 있는 번호 수(150명)를 넘었어요",
};

export function PhoneReveal({ branch, customerKey, masked, call = true, view = true }:
  { branch: string; customerKey: string; masked: string | null; call?: boolean; view?: boolean }) {
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!masked) return <span>-</span>;

  async function get(purpose: "view" | "call") {
    if (full && purpose === "view") return full;
    setBusy(true);
    const { data, error } = await sb.rpc("customer_phone_reveal", { p_branch: branch, p_key: customerKey, p_purpose: purpose });
    setBusy(false);
    if (error) {
      const k = Object.keys(MSG).find((x) => error.message.includes(x));
      window.alert(k ? MSG[k] : error.message);
      return null;
    }
    return (data as string | null) ?? null;
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
      <span className="num">{full ?? masked}</span>
      {call && (
        <button type="button" className="btn sm" disabled={busy} onClick={async () => {
          const p = await get("call");
          if (p) { setFull(p); window.location.href = `tel:${p.replace(/[^\d]/g, "")}`; }
        }}>전화</button>
      )}
      {view && !full && (
        <button type="button" className="btn t sm" disabled={busy} onClick={async () => { const p = await get("view"); if (p) setFull(p); }}>번호 보기</button>
      )}
    </span>
  );
}
