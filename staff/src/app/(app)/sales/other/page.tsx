"use client";
import { LedgerScreen } from "../ui";

export default function OtherSales() {
  return (
    <LedgerScreen tab="other" csvName="기타매출"
      cols={["when", "customer", "staff", "content", "memo", "amount", "card", "cash", "account", "npay"]} />
  );
}
