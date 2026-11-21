"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { StatsCtx, BranchSelect } from "./ui";
import "./stats.css";

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const [branch, setBranch] = useState<string | null>(me.tier === "owner" ? null : me.branch);
  const ctx = useMemo(() => ({ branch, setBranch }), [branch]);
  const sum = path.startsWith("/stats/sum");
  const ok = canSee(me, "stats.view") || me.tier === "manager";

  return (
    <StatsCtx.Provider value={ctx}>
      <header className="top st-top">
        <h1>통계</h1>
        <div className="st-tools"><BranchSelect /></div>
      </header>
      <nav className="st-tabs st-noprint">
        <Link href="/stats" className={!sum ? "on" : ""}>리포트</Link>
        <Link href="/stats/sum" className={sum ? "on" : ""}>집계</Link>
      </nav>
      <div className="page st-page">
        {ok ? children : <p className="st-muted">통계를 볼 권한이 없어요. 대표관리자에게 &apos;집계·통계&apos; 권한을 요청해 주세요.</p>}
      </div>
    </StatsCtx.Provider>
  );
}
