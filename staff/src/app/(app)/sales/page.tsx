"use client";
import { LedgerScreen } from "./ui";

export default function AllSales() {
  return (
    <LedgerScreen tab="all" csvName="전체매출"
      cols={["when", "customer", "staff", "kind", "content", "memo", "amount", "card", "cash", "account", "npay", "unpaid", "settled", "discount", "point", "sessions"]}
      opt={["npay"]}
      kinds={[
        { k: "관리", l: "관리·노쇼", ks: ["관리", "노쇼"] }, { k: "회차회원권", l: "회차권" }, { k: "기간회원권", l: "기간권" },
        { k: "제품판매", l: "제품" }, { k: "기타수입", l: "기타 수입" }, { k: "미수금 정산", l: "미수 정산" },
      ]} />
  );
}
