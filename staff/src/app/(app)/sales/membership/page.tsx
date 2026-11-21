"use client";
import { LedgerScreen } from "../ui";

/* 매출 원장 · 회원권 (시안 U-PC-SALES-3) */
export default function MembershipSales() {
  return <LedgerScreen tab="membership" csvName="회원권매출" kinds={[{ k: "회차회원권", l: "회차권" }, { k: "기간회원권", l: "기간권" }]} />;
}
