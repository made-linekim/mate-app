"use client";
import "./settings.css";
import "./s3.css";
import "./s3x.css";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { SetCtx } from "./ui";
import { navFor, V3i } from "./kit";

/* 설정 (시안 SET_v3): 왼쪽 흰 카드 목록 20개 + 오른쪽 화면. 직원은 기본·예약표·업무시간·휴무·운영 기준만 보여요. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const [branch, setBranch] = useState(me.branch || BRANCHES[0]);
  const groups = navFor(me.tier);
  const cur = path === "/settings" ? "/settings/basic" : path;

  return (
    <SetCtx.Provider value={{ branch, setBranch }}>
      <div className="s3">
        <div className="st7">
          <nav className="lnav" aria-label="설정 메뉴">
            {groups.map((g) => (
              <div key={g.g} style={{ display: "contents" }}>
                <div className="gl">{g.g}</div>
                {g.items.map((i) => (
                  <Link key={i.href} href={i.href} className={cur.startsWith(i.href) ? "on" : ""} aria-current={cur.startsWith(i.href) ? "page" : undefined}>
                    <V3i n={i.icon} />{i.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          {children}
        </div>
      </div>
    </SetCtx.Provider>
  );
}
