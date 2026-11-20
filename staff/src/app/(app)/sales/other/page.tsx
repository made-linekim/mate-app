"use client";
import { LedgerScreen } from "../ui";

export default function OtherSales() {
  return (
    <LedgerScreen tab="other" csvName="기타매출"
      cols={[["when", "일시"], "acct", "content", "staff", ["amount", "금액"], "method", "memo"]} />
  );
}
