"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { TABS, tabOk } from "@/lib/sales";

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const tabs = TABS.filter((t) => tabOk(me, t.keys));
  const cur = TABS.find((t) => (t.href === "/sales" ? path === "/sales" : path.startsWith(t.href)));
  const allowed = cur && tabOk(me, cur.keys);

  return (
    <>
      <header className="top">
        <h1>매출</h1>
        <span className="sub">{cur?.label}</span>
      </header>
      <nav style={{ display: "flex", gap: 4, padding: "0 var(--page-x)", borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {tabs.map((t) => {
          const on = t === cur;
          return (
            <Link key={t.href} href={t.href} style={{
              height: "var(--tab-h)", display: "flex", alignItems: "center", padding: "0 12px", whiteSpace: "nowrap",
              fontSize: "var(--fs-md)", fontWeight: on ? 700 : 500, color: on ? "var(--red)" : "var(--ink-3)",
              borderBottom: on ? "2px solid var(--red)" : "2px solid transparent",
            }}>{t.label}</Link>
          );
        })}
      </nav>
      <div className="page">
        {tabs.length === 0 ? (
          <p style={{ color: "var(--ink-3)" }}>매출 메뉴 권한이 없어요. 대표관리자에게 요청해 주세요.</p>
        ) : !allowed ? (
          <p style={{ color: "var(--ink-3)" }}>이 화면을 볼 권한이 없어요. 위 탭에서 다른 화면을 골라 주세요.</p>
        ) : children}
      </div>
    </>
  );
}
