"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/me";
import { MkCtx, useMkState } from "./ui";
import { Lock } from "@/lib/v3";
import { Reserved } from "./reserved";
import "./mkt.css";
import "./mx.css";

/* 시안 v3b 마케팅: 이달의 추천(첫 화면) · 광고 · 채널 · 제안 · 문자 · 제휴
   이달의 추천 시안(U-PC-MKT-0)은 머리줄에 '마케팅' 제목 + 세그먼트,
   나머지 시안(U-PC-MKT-1~5)은 세그먼트 줄(별 아이콘 · 선택 밑줄) 아래 화면 제목 줄이라 시안대로 따로 그려요. */
const TABS = [
  { href: "/marketing", l: "이달의 추천" }, { href: "/marketing/ads", l: "광고" }, { href: "/marketing/channels", l: "채널" }, { href: "/marketing/tips", l: "제안" },
  { href: "/marketing/sms", l: "문자" }, { href: "/marketing/partners", l: "제휴" },
];
const isOn = (path: string, href: string) => (href === "/marketing" ? path === href : path.startsWith(href));
const Star = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" /></svg>;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const { ctx, msg } = useMkState();
  const [box, setBox] = useState(false);
  const ok = me.tier !== "staff" || !!me.perms?.["marketing.view"] || !!me.perms?.["marketing.edit"];
  const picks = path === "/marketing";
  const deny = <p style={{ color: "var(--ink-3)", padding: "24px var(--page-x)" }}>마케팅을 볼 권한이 없어요. 대표관리자에게 요청해 주세요.</p>;
  return (
    <MkCtx.Provider value={ctx}>
      <div className="mx">
        {picks ? (
          <>
            <header className="top v3-hd">
              <h1>마케팅</h1>
              <nav className="mk-tabs">
                {TABS.map((t) => <Link key={t.href} href={t.href} className={isOn(path, t.href) ? "on" : ""}>{t.l}</Link>)}
              </nav>
              <div className="v3-right mk-hr">
                <Lock>광고 문자는 수신 동의 고객만</Lock>
                <button className="btn" onClick={() => setBox(true)}>예약 문자함</button>
              </div>
            </header>
            <div className="page">{ok ? children : deny}</div>
          </>
        ) : (
          <>
            <div className="mx-ctabs">
              <nav className="mx-seg">
                {TABS.map((t) => <Link key={t.href} href={t.href} className={isOn(path, t.href) ? "on" : ""}>{t.href === "/marketing" && <Star />}{t.l}</Link>)}
              </nav>
            </div>
            {ok ? children : deny}
          </>
        )}
      </div>
      {box && <Reserved onClose={() => setBox(false)} />}
      {msg && <div className="mk-toast" role="status">{msg}</div>}
    </MkCtx.Provider>
  );
}
