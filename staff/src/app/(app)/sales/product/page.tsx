"use client";
import { LedgerScreen } from "../ui";

export default function ProductSales() {
  return (
    <LedgerScreen tab="product" csvName="제품매출"
      cols={["when", "customer", "staff", "content", "memo", "amount", "card", "cash", "account", "npay", "unpaid", "discount", "point"]} />
  );
}
