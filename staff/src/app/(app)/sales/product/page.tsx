"use client";
import { LedgerScreen } from "../ui";

/* 매출 원장 · 제품 (시안 U-PC-SALES-5). 제품 판매 입력·매입·재고는 매출 메뉴 > 제품 관리 */
export default function ProductLedger() {
  return <LedgerScreen tab="product" csvName="제품매출" />;
}
