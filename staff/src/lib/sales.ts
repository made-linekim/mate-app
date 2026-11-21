"use client";
import type { Staff } from "./sb";
import { has, isReq } from "./perm";

// 매출 스위치는 모두 owner_only 라서 관리자도 대표관리자가 켜 준 경우에만 보여요. (서버 RPC 가 최종 검사)
export const canSee = (me: Staff, key: string) => has(me, key);

export type Tab = "all" | "customer" | "membership" | "service" | "product" | "other" | "expense" | "receivable" | "accounts";
export const TABS: { tab: Tab; href: string; label: string; keys: string[] }[] = [
  { tab: "all", href: "/sales", label: "전체 매출", keys: ["sales.own", "sales.others"] },
  { tab: "customer", href: "/sales/customer", label: "고객별 매출", keys: ["sales.by_customer"] },
  { tab: "membership", href: "/sales/membership", label: "회원권 매출", keys: ["sales.membership"] },
  { tab: "service", href: "/sales/service", label: "관리 매출", keys: ["sales.service"] },
  { tab: "product", href: "/sales/product", label: "제품 매출", keys: ["sales.product"] },
  { tab: "other", href: "/sales/other", label: "기타 매출", keys: ["sales.other"] },
  { tab: "expense", href: "/sales/expense", label: "경비 지출", keys: ["sales.expense"] },
  { tab: "receivable", href: "/sales/receivable", label: "미수금", keys: ["sales.receivable"] },
  { tab: "accounts", href: "/sales/accounts", label: "수입지출 계정", keys: ["sales.accounts"] },
];
// 요청 권한(직원이 요청만 보낼 수 있음)도 메뉴는 보여요. 화면이 요청 양식으로 열려요.
export const tabOk = (me: Staff, keys: string[]) => keys.some((k) => canSee(me, k) || (me.tier === "staff" && isReq(me.perms?.[k])));

export type Sale = {
  dedup_key: string; branch: string; paid_at: string | null; day: string; customer_key: string | null; customer_name: string;
  staff_name: string | null; kind: string | null; content: string | null; memo: string | null; duration_min: number | null;
  service_amount: number | null; amount: number | null; card: number | null; cash: number | null; account: number | null;
  npay: number | null; unpaid: number | null; unpaid_settled: number | null; discount: number | null; point: number | null;
  sessions: string | null; is_refund: boolean | null;
  total: number; sum_amount: number; sum_card: number; sum_cash: number; sum_account: number; sum_npay: number;
  sum_unpaid: number; sum_settled: number; sum_discount: number; sum_point: number; sum_minutes: number;
};

export const won = (n: number | null | undefined) => (n ? n.toLocaleString() : "0");
export const dur = (m: number | null | undefined) => {
  if (!m) return "-";
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h}시간` : "", r ? `${r}분` : ""].filter(Boolean).join(" ");
};
export const when = (s: Sale) => {
  if (!s.paid_at) return s.day;
  const d = new Date(s.paid_at);
  const p = (x: number) => String(x).padStart(2, "0");
  // 한국 시간으로 표시
  const k = new Date(d.getTime() + 9 * 3600e3);
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
};

// 오늘(한국 시간) YYYY-MM-DD
export const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 엑셀(CSV) 내려받기. 한글 깨짐 방지용 BOM 포함.
export function downloadCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 매출 엑셀 18열 (메라 매출내역 형식과 같은 순서)
export const SALES_CSV_HEAD = ["날짜", "고객명", "담당자", "구분", "내용", "메모", "시간", "관리금액", "결제금액", "카드", "현금", "계좌", "NPay", "미수발생", "미수정산", "할인", "포인트", "회차회원권"];
export const salesCsvRow = (s: Sale) => [
  when(s), s.customer_name, s.staff_name, s.kind, s.content, s.memo, dur(s.duration_min), s.service_amount ?? 0,
  s.amount ?? 0, s.card ?? 0, s.cash ?? 0, s.account ?? 0, s.npay ?? 0, s.unpaid ?? 0, s.unpaid_settled ?? 0,
  s.discount ?? 0, s.point ?? 0, s.sessions ?? "",
];
