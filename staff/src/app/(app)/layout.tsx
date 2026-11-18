"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sb, TIER_LABEL, type Staff } from "@/lib/sb";
import { MeCtx } from "@/lib/me";

const NAV = [
  { href: "/customers", label: "고객" },
  { href: "/happycall", label: "해피콜" },
  { href: "/staff", label: "직원 관리" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Staff | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return router.replace("/login");
      const { data } = await sb.rpc("me");
      if (!data?.id) { await sb.auth.signOut(); return router.replace("/login"); }
      setMe(data as Staff);
    })();
    const { data: sub } = sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") router.replace("/login"); });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!me) return null;
  return (
    <MeCtx.Provider value={me}>
      <div className="app">
        <aside className="side">
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--red)", padding: "0 12px" }}>MERA</div>
          <div className="navlabel">메뉴</div>
          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "on" : ""}>{n.label}</Link>
            ))}
          </nav>
          <div style={{ marginTop: "auto", padding: "0 12px", fontSize: 13, color: "var(--ink-3)" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{me.name}</div>
            <div>{TIER_LABEL[me.tier]} · {me.branch}</div>
            <button className="btn t sm" style={{ padding: 0, marginTop: 8 }} onClick={() => sb.auth.signOut()}>로그아웃</button>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </MeCtx.Provider>
  );
}
