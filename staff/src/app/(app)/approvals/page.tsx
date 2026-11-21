"use client";
import { useState } from "react";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import ApprovalBoard from "@/lib/ApprovalBoard";

/* 요청 · 승인 (오늘 할 일 '승인 대기'에도 같은 판이 들어가요) */
export default function ApprovalsPage() {
  const me = useMe();
  const [branch, setBranch] = useState<string | null>(me.tier === "owner" ? null : me.branch);
  return (
    <>
      <header className="top v3-hd">
        <h1>요청 · 승인</h1>
        <span className="sub">{me.tier === "staff" ? "내가 보낸 요청" : "지점 요청을 승인하거나 거절해요"}</span>
        <div className="v3-right">
          {me.tier === "owner" && (
            <select className="sel" aria-label="지점" value={branch ?? ""} onChange={(e) => setBranch(e.target.value || null)}>
              <option value="">전 지점</option>
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          )}
        </div>
      </header>
      <div className="page"><ApprovalBoard branch={branch} /></div>
    </>
  );
}
