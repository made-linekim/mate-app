"use client";
import "./settings.css";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { ALL_OK, Ico, SET_NAV, SetCtx, SetIcon } from "./ui";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const [branch, setBranch] = useState(me.branch || BRANCHES[0]);
  const home = path === "/settings";
  // PC에서 /settings 는 업무시간을 보여 줘요 (모바일에선 메뉴 목록)
  const curHref = home ? "/settings/hours" : path;
  const cur = SET_NAV.flatMap((g) => g.items).find((i) => i.href && curHref.startsWith(i.href));
  const allOk = ALL_OK.some((h) => path.startsWith(h));
  const owner = me.tier === "owner";
  const shown = branch === "all" && !allOk ? me.branch || BRANCHES[0] : branch;

  return (
    <SetCtx.Provider value={{ branch: shown, setBranch }}>
      <header className={`top st-top ${home ? "" : "sub"}`}>
        <Link href="/settings" className="st-back" aria-label="설정 목록으로"><Ico n="back" s={20} /></Link>
        <h1>설정</h1>
        <span className="st-mt">{cur?.label}</span>
        <select className="sel st-br" aria-label="지점" value={owner ? shown : me.branch} disabled={!owner} onChange={(e) => setBranch(e.target.value)}>
          {owner && allOk && <option value="all">전 지점</option>}
          {(owner ? BRANCHES : [me.branch]).map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </header>
      <div className={`st-wrap ${home ? "home" : ""}`}>
        <nav className="st-nav" aria-label="설정 메뉴">
          {SET_NAV.map((g) => (
            <div key={g.group} style={{ display: "contents" }}>
              <div className="g">{g.group}</div>
              {g.items.map((i) => (
                <Link key={i.label} href={i.href} className={cur === i ? "on" : ""}>
                  <SetIcon n={i.icon} /><span className="st-l">{i.label}<small>{i.help}</small></span><span className="chev"><Ico n="chev" /></span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <section className="st-body">{children}</section>
      </div>
    </SetCtx.Provider>
  );
}
