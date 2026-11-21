"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { TABS, tabOk, canSee } from "@/lib/sales";
import { SalesCtx, useSalesState, BranchSelect, MonthSelect } from "./ui";
import "./sales.css";

/* 시안 탭 이름 (수입지출 계정은 헤더 버튼으로) */
const SHORT: Record<string, string> = {
  all: "전체", customer: "고객별", membership: "회원권", service: "관리", product: "제품", other: "기타", expense: "지출", receivable: "미수금",
};

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const { ctx, exporter } = useSalesState();
  const [busy, setBusy] = useState(false);
  const tabs = TABS.filter((t) => t.tab !== "accounts" && tabOk(me, t.keys));
  const cur = TABS.find((t) => (t.href === "/sales" ? path === "/sales" : path.startsWith(t.href)));
  const allowed = cur && tabOk(me, cur.keys);
  const acct = TABS.find((t) => t.tab === "accounts")!;
  const noMonth = cur?.tab === "receivable" || cur?.tab === "accounts" || /^\/sales\/product\/(stock|payable|vendors|items)/.test(path);

  async function download() {
    if (!exporter) return;
    setBusy(true);
    try { await exporter(); } finally { setBusy(false); }
  }

  return (
    <SalesCtx.Provider value={ctx}>
      <header className="top sl-top">
        <h1>매출</h1>
        <div className="sl-tools">
          <BranchSelect />
          <MonthSelect disabled={noMonth} />
          {tabOk(me, acct.keys) && (
            <Link href={acct.href} className={`btn ${cur?.tab === "accounts" ? "p" : ""}`}>수입 · 지출 계정</Link>
          )}
          {canSee(me, "export.excel") && (
            <button className="btn" disabled={!exporter || busy} onClick={download}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              {busy ? "준비 중" : "엑셀 다운"}
            </button>
          )}
        </div>
      </header>
      <nav className="sl-tabs">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={t === cur ? "on" : ""}>{SHORT[t.tab] ?? t.label}</Link>
        ))}
      </nav>
      <div className="page">
        {tabs.length === 0 && !tabOk(me, acct.keys) ? (
          <p style={{ color: "var(--ink-3)" }}>매출 메뉴 권한이 없어요. 대표관리자에게 요청해 주세요.</p>
        ) : !allowed ? (
          <p style={{ color: "var(--ink-3)" }}>이 화면을 볼 권한이 없어요. 위 탭에서 다른 화면을 골라 주세요.</p>
        ) : children}
      </div>
    </SalesCtx.Provider>
  );
}
