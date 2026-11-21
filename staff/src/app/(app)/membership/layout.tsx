"use client";
import { useFollowTop } from "@/lib/branch";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { MbCtx, SearchIcon, useBranchPick } from "./ui";
import SellModal from "./SellModal";
import "./membership.css";

// 회원권은 고객 메뉴 안에 있어요 (고객 목록 · 연락할 고객 · 회원권). 상품 만들기는 설정 > 회원권 상품.
const TABS = [
  { href: "/customers", label: "고객 목록" },
  { href: "/happycall", label: "연락할 고객" },
  { href: "/membership", label: "회원권" },
];

export default function MembershipLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const cur = TABS.find((t) => path === t.href) ?? TABS[2];
  const [branch, setBranch] = useState(useBranchPick());
  useFollowTop(me, setBranch);
  const [q, setQ] = useState("");
  const [rev, setRev] = useState(0);
  const ctx = useMemo(() => ({ branch, setBranch, q, setQ, rev }), [branch, q, rev]);
  // 회원권 판매 창: 결제 권한(schedule.pay)이 있는 사람만. 고객 차트의 '회원권 판매'는 ?sell=1&b=지점&k=고객 으로 열려요
  const canSell = me.tier !== "staff" || canSee(me, "schedule.pay");
  const [sell, setSell] = useState<null | { key: string } | "new">(null);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("sell") !== "1") return;
    const b = sp.get("b"), k = sp.get("k");
    if (b && (me.tier === "owner" || b === me.branch)) setBranch(b);
    setSell(k ? { key: k } : "new");
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const holdings = cur?.href === "/membership";

  return (
    <MbCtx.Provider value={ctx}>
      <header className="top mb-top v3-hd">
        <h1>회원권</h1>
        <nav className="mb-tabs">
          {TABS.map((t) => <Link key={t.href} href={t.href} className={t === cur ? "on" : ""}>{t.label}</Link>)}
        </nav>
        <div className="mb-tools">
          {holdings && (
            <label className="mb-search">
              <SearchIcon />
              <input className="inp" placeholder="고객 이름 · 회원권명" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          {canSell && (
            <button className="btn p" onClick={() => setSell("new")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              회원권 판매
            </button>
          )}
          {!holdings && canSee(me, "settings.edit") && (
            <Link href="/settings/products" className="btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              상품 추가
            </Link>
          )}
        </div>
      </header>
      <div className="page">{children}</div>
      {sell && (
        <SellModal branch={branch} init={sell === "new" ? null : sell}
          onClose={() => setSell(null)} onDone={() => setRev((r) => r + 1)} />
      )}
    </MbCtx.Provider>
  );
}
