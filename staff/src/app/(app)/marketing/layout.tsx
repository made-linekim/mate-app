"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { MkCtx, useMkState } from "./ui";
import { Lock } from "@/lib/v3";
import "./mkt.css";

/* 시안 v3b 마케팅: 이달의 추천(첫 화면) · 광고 · 채널 · 제안 · 문자 · 제휴 */
const TABS = [
  { href: "/marketing", l: "이달의 추천" }, { href: "/marketing/ads", l: "광고" }, { href: "/marketing/channels", l: "채널" }, { href: "/marketing/tips", l: "제안" },
  { href: "/marketing/sms", l: "문자" }, { href: "/marketing/partners", l: "제휴" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const { ctx, msg } = useMkState();
  const ok = me.tier !== "staff" || !!me.perms?.["marketing.view"] || !!me.perms?.["marketing.edit"];
  return (
    <MkCtx.Provider value={ctx}>
      <header className="top v3-hd">
        <h1>마케팅</h1>
      <nav className="mk-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={(t.href === "/marketing" ? path === t.href : path.startsWith(t.href)) ? "on" : ""}>{t.l}</Link>
        ))}
      </nav>
        <div className="v3-right mk-hr">
          <Lock>광고 문자는 수신 동의 고객만</Lock>
        </div>
      </header>
      <div className="page">
        {ok ? children : <p style={{ color: "var(--ink-3)" }}>마케팅을 볼 권한이 없어요. 대표관리자에게 요청해 주세요.</p>}
      </div>
      {msg && <div className="mk-toast" role="status">{msg}</div>}
    </MkCtx.Provider>
  );
}
