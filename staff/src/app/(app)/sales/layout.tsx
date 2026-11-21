"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { TABS, tabOk, canSee } from "@/lib/sales";
import { SalesCtx, useSalesState, BranchSelect, MonthSelect } from "./ui";
import "./sales.css";

/* v3 C4: 매출 하위 메뉴는 드롭다운 하나 (매출 메뉴 · 전체 ▾) */
const SHORT: Record<string, string> = {
  all: "전체", customer: "고객별", membership: "회원권", service: "관리", product: "제품", other: "기타", expense: "지출", receivable: "미수금",
};

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const { ctx, exporter } = useSalesState();
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const tabs = TABS.filter((t) => t.tab !== "accounts" && tabOk(me, t.keys));
  const cur = TABS.find((t) => (t.href === "/sales" ? path === "/sales" : path.startsWith(t.href)));
  const allowed = cur && tabOk(me, cur.keys);
  const acct = TABS.find((t) => t.tab === "accounts")!;
  const noMonth = cur?.tab === "receivable" || cur?.tab === "accounts" || /^\/sales\/product\/(stock|payable|vendors|items)/.test(path);
  // 제품 관리(판매 입력·매입·재고…)와 수입·지출 계정은 예전처럼 지점·월·엑셀 도구를 같이 써요
  const legacy = /^\/sales\/(product\/.+|accounts)/.test(path);
  const goods = path.startsWith("/sales/product/");
  const label = goods ? "제품 관리" : cur ? (SHORT[cur.tab] ?? cur.label) : "전체";

  async function download() {
    if (!exporter) return;
    setBusy(true);
    try { await exporter(); } finally { setBusy(false); }
  }

  return (
    <SalesCtx.Provider value={ctx}>
      <header className="top sl-top v3-hd">
        <h1 className="sr-only">매출</h1>
        <div className="sl-menu">
          <button className="sl-menu-b" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <span>매출 메뉴</span><b>{label}</b>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {menu && (
            <>
              <div className="sl-menu-dim" onClick={() => setMenu(false)} />
              <div className="sl-menu-pop" role="menu">
                {tabs.map((t) => (
                  <Link key={t.href} role="menuitem" href={t.href} className={t === cur && !goods ? "on" : ""} onClick={() => setMenu(false)}>{SHORT[t.tab] ?? t.label}</Link>
                ))}
                {(tabOk(me, TABS.find((t) => t.tab === "product")!.keys) || tabOk(me, acct.keys)) && <i className="sl-menu-sep" />}
                {tabOk(me, TABS.find((t) => t.tab === "product")!.keys) && <Link role="menuitem" href="/sales/product/sell" className={goods ? "on" : ""} onClick={() => setMenu(false)}>제품 관리<small>판매 입력 · 매입 · 재고</small></Link>}
                {tabOk(me, acct.keys) && <Link role="menuitem" href={acct.href} className={cur?.tab === "accounts" ? "on" : ""} onClick={() => setMenu(false)}>수입 · 지출 계정</Link>}
              </div>
            </>
          )}
        </div>
        {legacy && <div className="sl-tools">
          <BranchSelect />
          <MonthSelect disabled={noMonth} />
          {canSee(me, "export.excel") && (
            <button className="btn" disabled={!exporter || busy} onClick={download}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
              {busy ? "준비 중" : "엑셀 다운"}
            </button>
          )}
        </div>}
      </header>
      <div className={`page sl3-page ${legacy ? "legacy" : ""}`}>
        {tabs.length === 0 && !tabOk(me, acct.keys) ? (
          <p style={{ color: "var(--ink-3)" }}>매출 메뉴 권한이 없어요. 대표관리자에게 요청해 주세요.</p>
        ) : !allowed ? (
          <p style={{ color: "var(--ink-3)" }}>이 화면을 볼 권한이 없어요. 매출 메뉴에서 다른 화면을 골라 주세요.</p>
        ) : children}
      </div>
    </SalesCtx.Provider>
  );
}
