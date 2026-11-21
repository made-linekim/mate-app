"use client";
import { LedgerScreen } from "../ui";

/* 매출 원장 · 관리 (시안 U-PC-SALES-4) */
export default function ServiceSales() {
  return <LedgerScreen tab="service" csvName="관리매출" kinds={[{ k: "관리", l: "관리" }, { k: "노쇼", l: "노쇼" }]} />;
}
