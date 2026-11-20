"use client";
import { LedgerScreen } from "../ui";

export default function ProductSales() {
  return (
    <LedgerScreen tab="product" csvName="제품매출"
      cols={[["when", "일시"], "customer", "staff", ["content", "제품"], "memo", ["amount", "금액"], "card", "cash", "account", "npay", "unpaid", "discount", "point"]}
      opt={["account", "npay", "unpaid", "discount", "point"]} />
  );
}
