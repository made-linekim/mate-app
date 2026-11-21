"use client";
import { useFollowTop } from "@/lib/branch";
import { useState } from "react";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import ApprovalBoard from "@/lib/ApprovalBoard";

/* 요청 · 승인 (오늘 할 일 '승인 대기'에도 같은 판이 들어가요) */
export default function ApprovalsPage() {
  const me = useMe();
  const [branch, setBranch] = useState<string | null>(me.branch);
  useFollowTop(me, setBranch);
  return (
    <>
      <header className="top v3-hd">
        <h1>요청 · 승인</h1>
        <span className="sub">{me.tier === "staff" ? "내가 보낸 요청" : "지점 요청을 승인하거나 거절해요"}</span>
        <div className="v3-right">
        </div>
      </header>
      <div className="page"><ApprovalBoard branch={branch} /></div>
    </>
  );
}
