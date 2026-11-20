"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sb, TIER_LABEL, type Staff } from "@/lib/sb";
import { MeCtx } from "@/lib/me";

// 메라 시안(P01) 메뉴 묶음: 업무 · 성과 · 관리. href 가 없는 항목은 아직 준비 중.
type Item = { href?: string; label: string; icon: keyof typeof ICONS };
const NAV: { group: string; items: Item[] }[] = [
  { group: "업무", items: [
    { href: "/schedule", label: "예약", icon: "cal" },
    { href: "/work", label: "오늘 할 일", icon: "check" },
    { href: "/customers", label: "고객", icon: "user" },
    { href: "/membership", label: "회원권", icon: "card" },
    { label: "운동일지", icon: "note" },
  ] },
  { group: "성과", items: [
    { label: "대시보드", icon: "grid" },
    { href: "/sales", label: "매출", icon: "won" },
    { label: "통계", icon: "bar" },
    { label: "마케팅", icon: "mega" },
  ] },
  { group: "관리", items: [
    { href: "/settings", label: "설정", icon: "gear" },
  ] },
];

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS = {
  cal: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" {...P} /><path d="M3.5 10h17M8 3v4M16 3v4" {...P} /></>,
  check: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" {...P} /><path d="M8 12.5l2.8 2.8L16.5 9" {...P} /></>,
  user: <><circle cx="12" cy="8.5" r="3.8" {...P} /><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" {...P} /></>,
  phone: <path d="M6.6 3.8l2.6.3 1.3 3.6-1.8 1.4a11 11 0 005.7 5.7l1.4-1.8 3.6 1.3.3 2.6c-.2 1.4-1.4 2.4-2.8 2.3C10.5 18.7 5.3 13.5 4.8 6.6c-.1-1.4.9-2.6 1.8-2.8z" {...P} />,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" {...P} /><path d="M3 10h18M7 15h4" {...P} /></>,
  note: <><path d="M6 3.5h9l3.5 3.5v13.5H6z" {...P} /><path d="M9 11h6M9 15h6" {...P} /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" {...P} /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" {...P} /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" {...P} /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" {...P} /></>,
  won: <path d="M4.5 6l3 12 4.5-10 4.5 10 3-12M3.5 11h17M3.5 14h17" {...P} />,
  bar: <path d="M4 20h16M7 16.5V11M12 16.5V6M17 16.5v-8" {...P} />,
  mega: <><path d="M4 10v4l11 4.5V5.5L4 10z" {...P} /><path d="M8 15l1 4.5M18.5 9.5v5" {...P} /></>,
  team: <><circle cx="9" cy="9" r="3.3" {...P} /><path d="M3 19.5c.9-3.2 3.2-4.7 6-4.7s5.1 1.5 6 4.7M15.5 5.9a3.3 3.3 0 010 6.3M17.5 14.9c1.7.6 3 2 3.5 4.6" {...P} /></>,
  gear: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" {...P} /></>,
};

// 해피콜은 '오늘 할 일' 안, 직원·권한은 '설정' 안에 있어요 (메라 시안)
const isOn = (path: string, href: string) => path.startsWith(href)
  || (href === "/work" && path.startsWith("/happycall")) || (href === "/settings" && path.startsWith("/staff"));
// 모바일 하단 탭 (시안 02-05m): 예약 · 오늘 할 일 · 고객 · 운동일지 · 더보기
const TABS: Item[] = [
  { href: "/schedule", label: "예약", icon: "cal" }, { href: "/work", label: "오늘 할 일", icon: "check" },
  { href: "/customers", label: "고객", icon: "user" }, { label: "운동일지", icon: "note" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Staff | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [path]);

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
      <div className={`app ${path.startsWith("/customers/chart") ? "nomtab" : ""}`}>
        <aside className="side">
          <div className="logo"><span>M</span>MERA</div>
          <nav className="nav">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="navlabel">{g.group}</div>
                {g.items.map((n) => {
                  const icon = <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>{ICONS[n.icon]}</svg>;
                  return n.href ? (
                    <Link key={n.label} href={n.href} className={isOn(path, n.href) ? "on" : ""}>{icon}{n.label}</Link>
                  ) : (
                    <span key={n.label} className="off" title="준비 중이에요">{icon}{n.label}<em>준비 중</em></span>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="mecard">
            <div className="av">{me.name.slice(0, 1)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="nm">{me.name}</div>
              <div className="sb">{me.title || TIER_LABEL[me.tier]} · {me.branch}</div>
            </div>
            <button className="btn t sm" style={{ padding: 0, width: 28, color: "var(--ink-4)" }} onClick={() => sb.auth.signOut()} title="로그아웃" aria-label="로그아웃">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M14 4h4.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H14M10 8l-4 4 4 4M6 12h10" {...P} /></svg>
            </button>
          </div>
        </aside>
        <div className="main">{children}</div>
        <nav className="mtab">
          {TABS.map((t) => {
            const icon = <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>{ICONS[t.icon]}</svg>;
            return t.href
              ? <Link key={t.label} href={t.href} className={isOn(path, t.href) ? "on" : ""}>{icon}<span>{t.label}</span></Link>
              : <span key={t.label} className="off">{icon}<span>{t.label}</span></span>;
          })}
          <button className={more || !TABS.some((t) => t.href && isOn(path, t.href)) ? "on" : ""} onClick={() => setMore(!more)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><circle cx="6" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="18" cy="12" r="1.6" fill="currentColor" /></svg>
            <span>더보기</span>
          </button>
        </nav>
        {more && (
          <>
            <div className="dim mmore-dim" onClick={() => setMore(false)} />
            <div className="mmore">
              {NAV.flatMap((g) => g.items).filter((n) => !TABS.some((t) => t.label === n.label)).map((n) => (
                n.href
                  ? <Link key={n.label} href={n.href}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS[n.icon]}</svg>{n.label}</Link>
                  : <span key={n.label} className="off"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS[n.icon]}</svg>{n.label}<em>준비 중</em></span>
              ))}
              <button onClick={() => sb.auth.signOut()}>{me.name} · {me.branch} · 로그아웃</button>
            </div>
          </>
        )}
      </div>
    </MeCtx.Provider>
  );
}
