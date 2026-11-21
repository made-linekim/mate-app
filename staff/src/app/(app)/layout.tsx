"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sb, TIER_LABEL, BRANCHES, type Staff } from "@/lib/sb";
import { readTopBranch, setTopBranch } from "@/lib/branch";
import { MeCtx } from "@/lib/me";
import { SET_NAV, SetIcon } from "./settings/ui";

// 메뉴: 실제로 쓰는 것만 보여요.
type Item = { href?: string; label: string; icon: keyof typeof ICONS };
const NAV: { group: string; items: Item[] }[] = [
  { group: "업무", items: [
    { href: "/schedule", label: "예약", icon: "cal" },
    { href: "/work", label: "오늘 할 일", icon: "check" },
    { href: "/customers", label: "고객", icon: "team" },
  ] },
  { group: "성과", items: [
    { href: "/dashboard", label: "대시보드", icon: "grid" },
    { href: "/sales", label: "매출", icon: "card" },
    { href: "/stats", label: "통계", icon: "bar" },
    { href: "/marketing", label: "마케팅", icon: "mega" },
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
  lines: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" {...P} />,
  gear: <><circle cx="12" cy="12" r="3" {...P} /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" {...P} /></>,
};

// 해피콜은 '오늘 할 일' 안, 직원·권한은 '설정' 안에 있어요 (메라 시안)
const isOn = (path: string, href: string) => path.startsWith(href)
  || (href === "/customers" && path.startsWith("/membership")) || (href === "/work" && path.startsWith("/happycall")) || (href === "/settings" && path.startsWith("/staff"));
// 모바일 하단 탭 (시안 1120 staff_tabbar_icons): 예약 · 오늘 할 일 · 고객 · 매출 · 더보기
const TABS: Item[] = [
  { href: "/schedule", label: "예약", icon: "cal" }, { href: "/work", label: "오늘 할 일", icon: "check" },
  { href: "/customers", label: "고객", icon: "user" }, { href: "/sales", label: "매출", icon: "bar" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Staff | null | undefined>(undefined);
  const [more, setMore] = useState(false);
  const [bye, setBye] = useState(false);
  const [meMenu, setMeMenu] = useState(false);
  const [q, setQ] = useState("");
  const [topBr, setTopBrS] = useState("");
  const setTopBr = (b: string) => { setTopBrS(b); setTopBranch(b); };
  useEffect(() => { setMore(false); setBye(false); setMeMenu(false); }, [path]);
  useEffect(() => { if (me) setTopBrS(readTopBranch(me)); }, [me]);

  // 모바일에서 표를 카드로 보여 줄 때 칸 이름(data-label)을 머리줄에서 붙여 줘요 (가로 스크롤 없이)
  useEffect(() => {
    let raf = 0;
    const label = () => {
      raf = 0;
      document.querySelectorAll(".sl-scroll table, .mb-scroll table, .mk-card table").forEach((t) => {
        const hs = [...t.querySelectorAll("thead th")].map((th) => th.textContent?.trim() ?? "");
        t.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
          let i = 0;
          tr.querySelectorAll(":scope > td").forEach((td) => {
            const span = Number(td.getAttribute("colspan") || 1);
            if (span === 1 && hs[i] && td.getAttribute("data-label") !== hs[i]) td.setAttribute("data-label", hs[i]);
            i += span;
          });
        });
      });
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(label); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    label();
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);

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
          <div className="topr">
            <label className={`topbr ${me.tier === "owner" ? "" : "fixed"}`} title={me.tier === "owner" ? "지점 바꾸기" : undefined}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M4 20V9.5L12 4l8 5.5V20M9 20v-6h6v6M3 20h18" {...P} /></svg>
              {me.tier === "owner" ? (
                <select aria-label="지점" value={topBr} onChange={(e) => setTopBr(e.target.value)}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : <span>{me.branch}</span>}
              {me.tier === "owner" && <svg className="cv" viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M6 9l6 6 6-6" {...P} /></svg>}
            </label>
            <form className="topq" role="search" onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (!v) return; const u = `/customers?q=${encodeURIComponent(v)}`; if (path === "/customers") window.location.assign(u); else router.push(u); }}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="11" cy="11" r="6.5" {...P} /><path d="M16 16l4 4" {...P} /></svg>
              <input placeholder="고객 이름 · 뒤 4자리" aria-label="고객 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
            <Link href="/schedule?new=1" className="btn p topnew" onClick={() => window.dispatchEvent(new Event("rsv:new"))}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path d="M12 5v14M5 12h14" {...P} strokeWidth={2.2} /></svg>새 예약
            </Link>
            <button className="mecard" onClick={() => setMeMenu((v) => !v)} aria-haspopup="menu" aria-expanded={meMenu}>
              <div className="av">{me.name.slice(0, 1)}</div>
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <div className="nm">{me.name}</div>
                <div className="sb">{me.title || TIER_LABEL[me.tier]}</div>
              </div>
            </button>
            {meMenu && (
              <>
                <div className="me-dim" onClick={() => setMeMenu(false)} />
                <div className="me-menu" role="menu">
                  <div className="me-who"><b>{me.name}</b><span>{me.title || TIER_LABEL[me.tier]} · {me.branch}</span></div>
                  <button role="menuitem" onClick={() => { setMeMenu(false); setBye(true); }}>로그아웃</button>
                </div>
              </>
            )}
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
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>{ICONS.lines}</svg>
            <span>더보기</span>
          </button>
        </nav>
        {more && (
          <>
            <div className="dim mmore-dim" onClick={() => setMore(false)} />
            <div className="mmore">
              <div className="mm-me">
                <div className="av">{me.name.slice(0, 1)}</div>
                <div><b>{me.name}</b><span>{me.title || TIER_LABEL[me.tier]} · {me.branch}</span></div>
              </div>
              <Link href="/dashboard" className="mm-row"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS.grid}</svg><span>대시보드<small>오늘 현황 · 목표 · 직원 성장 · 팀전</small></span></Link>
              <Link href="/membership" className="mm-row"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS.card}</svg><span>회원권<small>고객이 가진 회원권 · 잔여</small></span></Link>
              <Link href="/stats" className="mm-row"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS.bar}</svg><span>통계<small>리포트 · 날짜별·담당자별 집계 · 인센티브</small></span></Link>
              <Link href="/marketing" className="mm-row"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>{ICONS.mega}</svg><span>마케팅<small>광고 · 채널 · 제안 · 문자 · 제휴</small></span></Link>
              <div className="mm-g">설정{me.tier === "staff" ? " (보기만)" : ""}</div>
              {SET_NAV.flatMap((g) => g.items).map((i) => (
                <Link key={i.href} href={i.href} className="mm-row"><SetIcon n={i.icon} s={22} /><span>{i.label}<small>{i.help}</small></span></Link>
              ))}
              <button className="mm-out" onClick={() => setBye(true)}>로그아웃</button>
            </div>
          </>
        )}
        {bye && (
          <>
            <div className="dim" style={{ zIndex: 60 }} onClick={() => setBye(false)} />
            <div className="bye" role="dialog" aria-label="로그아웃 확인">
              <b>로그아웃할까요?</b>
              <p>{me.name} · {me.branch} 계정에서 나가요. 다시 들어오려면 아이디와 비밀번호가 필요해요.</p>
              <div><button className="btn" onClick={() => setBye(false)}>취소</button><button className="btn p" onClick={() => sb.auth.signOut()}>로그아웃</button></div>
            </div>
          </>
        )}
      </div>
    </MeCtx.Provider>
  );
}
