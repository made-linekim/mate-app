"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { MbCtx, SearchIcon, useBranchPick } from "./ui";
import "./membership.css";

const TABS = [
  { href: "/membership", label: "보유 회원권" },
  { href: "/membership/products", label: "상품" },
];

export default function MembershipLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const cur = TABS.find((t) => (t.href === "/membership" ? path === "/membership" : path.startsWith(t.href)));
  const [branch, setBranch] = useState(useBranchPick());
  const [q, setQ] = useState("");
  const ctx = useMemo(() => ({ branch, setBranch, q, setQ }), [branch, q]);
  const holdings = cur?.href === "/membership";

  return (
    <MbCtx.Provider value={ctx}>
      <header className="top mb-top">
        <h1>회원권</h1>
        <div className="mb-tools">
          <select className="sel" aria-label="지점" disabled={me.tier !== "owner"} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {(me.tier === "owner" ? BRANCHES : [branch]).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {holdings && (
            <label className="mb-search">
              <SearchIcon />
              <input className="inp" placeholder="고객 이름 · 회원권명" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          )}
          {!holdings && canSee(me, "settings.edit") && (
            <Link href="/settings/products" className="btn p">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
              상품 추가
            </Link>
          )}
        </div>
      </header>
      <nav className="mb-tabs">
        {TABS.map((t) => <Link key={t.href} href={t.href} className={t === cur ? "on" : ""}>{t.label}</Link>)}
      </nav>
      <div className="page">{children}</div>
    </MbCtx.Provider>
  );
}
