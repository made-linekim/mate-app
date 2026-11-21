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
      {/* 시안 v3: 흰 띠에 리포트 | 집계 (대표관리자는 오른쪽에 지점) */}
      <div className="st3-band st-noprint">
        <nav className="st3-seg" aria-label="통계 종류">
          <Link href="/stats" className={!sum ? "on" : ""}>리포트</Link>
          <Link href="/stats/sum" className={sum ? "on" : ""}>집계</Link>
        </nav>
        {me.tier === "owner" && <div className="st-tools"><BranchSelect /></div>}
      </div>
      <div className="page st-page st3-page">
        {ok ? children : <p className="st-muted">통계를 볼 권한이 없어요. 대표관리자에게 &apos;집계·통계&apos; 권한을 요청해 주세요.</p>}
      </div>
    </StatsCtx.Provider>
  );
}
