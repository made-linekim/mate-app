"use client";
import { LedgerScreen } from "../ui";

export default function ServiceSales() {
  return (
    <LedgerScreen tab="service" csvName="관리매출"
      cols={[["when", "일시"], "customer", "staff", "prog", "use", ["amount", "금액"], "discount", "sessions"]}
      kinds={[{ k: "관리", l: "관리" }, { k: "노쇼", l: "노쇼" }]} />
  );
}
