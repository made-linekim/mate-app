"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SUB = [
  { href: "/stats/sum", label: "날짜별" },
  { href: "/stats/sum/staff", label: "담당자별" },
  { href: "/stats/sum/incentive", label: "인센티브" },
  { href: "/stats/sum/remain", label: "잔여 회원권" },
];

export default function SumLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <div className="st3-band st3-band2 st-noprint"><nav className="st3-seg" aria-label="집계 종류">
        {SUB.map((s) => <Link key={s.href} href={s.href} className={path === s.href ? "on" : ""}>{s.label}</Link>)}
      </nav></div>
      {children}
    </>
  );
}
