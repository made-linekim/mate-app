"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "업무시간 · 휴무" },
  { href: "/settings/programs", label: "관리 항목" },
  { href: "/settings/products", label: "회원권 상품" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const cur = TABS.find((t) => (t.href === "/settings" ? path === "/settings" : path.startsWith(t.href)));
  return (
    <>
      <header className="top"><h1>설정</h1><span className="sub">{cur?.label}</span></header>
      <nav style={{ display: "flex", gap: 4, padding: "0 var(--page-x)", borderBottom: "1px solid var(--line)", overflowX: "auto" }}>
        {TABS.map((t) => {
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
      <div className="page">{children}</div>
    </>
  );
}
