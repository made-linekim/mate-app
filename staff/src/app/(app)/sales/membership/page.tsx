"use client";
import { LedgerScreen } from "../ui";

export default function MembershipSales() {
  return (
    <LedgerScreen tab="membership" csvName="회원권매출"
      cols={["when", "customer", "staff", "kind", "content", "memo", "amount", "card", "cash", "account", "npay", "unpaid", "discount", "point"]}
      kinds={[{ k: "회차회원권", l: "회차회원권" }, { k: "기간회원권", l: "기간회원권" }]} />
  );
}
