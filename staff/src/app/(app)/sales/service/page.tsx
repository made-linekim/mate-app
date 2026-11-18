"use client";
import { LedgerScreen } from "../ui";

export default function ServiceSales() {
  return (
    <LedgerScreen tab="service" csvName="관리매출"
      cols={["when", "customer", "staff", "kind", "content", "memo", "time", "amount", "card", "cash", "account", "npay", "sessions"]}
      kinds={[{ k: "관리", l: "관리" }, { k: "노쇼", l: "노쇼" }]} />
  );
}
