"use client";
import { createContext, useContext } from "react";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

/* 설정 메뉴: 실제로 쓰는 것만 보여요 (준비 중인 메뉴는 숨김, 같은 기능은 한 곳에만).
   회원권 '상품'은 여기에서만, 고객이 가진 회원권은 고객 > 회원권 에서 봐요. */
export type SetItem = { label: string; href: string; icon: keyof typeof SET_ICONS; help: string };
const SP = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const SET_ICONS = {
  clock: <><circle cx="12" cy="12" r="8.5" {...SP} /><path d="M12 7.5V12l3 2" {...SP} /></>,
  off: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" {...SP} /><path d="M3.5 10h17M8 3v4M16 3v4M9.5 13.5l5 4M14.5 13.5l-5 4" {...SP} /></>,
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" {...SP} />,
  ticket: <><path d="M3.5 8a2 2 0 002-2h13a2 2 0 002 2v2a2 2 0 000 4v2a2 2 0 00-2 2h-13a2 2 0 00-2-2v-2a2 2 0 000-4z" {...SP} /><path d="M14 7v10" {...SP} strokeDasharray="2 2" /></>,
  team: <><circle cx="9" cy="9" r="3.3" {...SP} /><path d="M3 19.5c.9-3.2 3.2-4.7 6-4.7s5.1 1.5 6 4.7M15.5 5.9a3.3 3.3 0 010 6.3M17.5 14.9c1.7.6 3 2 3.5 4.6" {...SP} /></>,
  key: <><circle cx="8" cy="15" r="4" {...SP} /><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" {...SP} /></>,
};
export const SET_NAV: { group: string; items: SetItem[] }[] = [
  { group: "예약", items: [
    { label: "업무시간", href: "/settings/hours", icon: "clock", help: "요일별 여는 시간" },
    { label: "휴무", href: "/settings/holidays", icon: "off", help: "쉬는 날 · 직원 휴무" },
  ] },
  { group: "상품", items: [
    { label: "프로그램", href: "/settings/programs", icon: "list", help: "관리 항목 · 시간 · 색" },
    { label: "회원권 상품", href: "/settings/products", icon: "ticket", help: "파는 회원권 종류 · 가격" },
  ] },
  { group: "직원", items: [
    { label: "직원", href: "/settings/staff", icon: "team", help: "직원 등록 · 계정" },
    { label: "직급 · 권한", href: "/settings/perms", icon: "key", help: "직급마다 쓰는 메뉴 · 기능" },
  ] },
];
export function SetIcon({ n, s = 20 }: { n: keyof typeof SET_ICONS; s?: number }) {
  return <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>{SET_ICONS[n]}</svg>;
}
/* 지점을 안 고르는 화면(직원·권한)은 '전 지점'도 고를 수 있어요 */
export const ALL_OK = ["/settings/staff", "/settings/perms"];

export const SetCtx = createContext<{ branch: string; setBranch: (b: string) => void }>({ branch: "", setBranch: () => {} });

/** 헤더에서 고른 지점. allowAll 이 아니면 '전 지점'일 때 내 지점으로 바꿔 줘요. */
export function useSetBranch(allowAll = false) {
  const me = useMe();
  const { branch } = useContext(SetCtx);
  if (branch === "all" && !allowAll) return me.branch || BRANCHES[0];
  return branch || me.branch || BRANCHES[0];
}

export function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="st-head">
      <h2>{title}</h2>
      <div className="st-act">{children}</div>
    </div>
  );
}

/** 설명글은 펼쳐 두지 않고 ⓘ 를 눌러야 보여요 */
export function Info({ children, label = "설명" }: { children: React.ReactNode; label?: string }) {
  return (
    <details className="st-info">
      <summary aria-label={label}><span>ⓘ</span>{label}</summary>
      <div>{children}</div>
    </details>
  );
}

export function Msg({ text }: { text: string }) {
  if (!text) return null;
  return <span className={`st-msg ${/했어요$/.test(text) ? "ok" : ""}`}>{text}</span>;
}

export function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`st-sw ${on ? "on" : ""}`} onClick={() => onChange(!on)}><span /></button>
  );
}

export function Check({ on, disabled, fixed, onChange, label }: { on: boolean; disabled?: boolean; fixed?: boolean; onChange?: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled || fixed}
      className={`st-ck ${on ? "on" : ""} ${fixed ? "fix" : ""}`} onClick={() => onChange?.(!on)}>
      {on && <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PATHS = {
  edit: <path d="M4 16l1-4 8.5-8.5a2.1 2.1 0 013 3L8 15l-4 1z" {...P} />,
  trash: <path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10" {...P} />,
  plus: <path d="M10 4v12M4 10h12" {...P} />,
  search: <><circle cx="9" cy="9" r="5.5" {...P} /><path d="M13 13l3.5 3.5" {...P} /></>,
  back: <path d="M12.5 4L6.5 10l6 6" {...P} strokeWidth={1.8} />,
  chev: <path d="M7.5 4.5L13 10l-5.5 5.5" {...P} />,
};
export function Ico({ n, s = 16 }: { n: keyof typeof PATHS; s?: number }) {
  return <svg viewBox="0 0 20 20" width={s} height={s} aria-hidden>{PATHS[n]}</svg>;
}
export function IconBtn({ n, label, onClick, disabled }: { n: keyof typeof PATHS; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="st-ib" title={label} aria-label={label} onClick={onClick} disabled={disabled}><Ico n={n} /></button>;
}

const WDK = ["일", "월", "화", "수", "목", "금", "토"];
/** 2026-11-24 → 11.24 (화). 올해가 아니면 연도도 붙여요. */
export function dayLabel(d: string, thisYear = new Date().getFullYear()) {
  const [y, m, dd] = d.split("-");
  const w = WDK[new Date(d + "T00:00:00").getDay()];
  return `${+y === thisYear ? "" : y + "."}${m}.${dd} (${w})`;
}
/** 유효기간 일 → 12개월 / 45일 */
export function periodLabel(days: number | null) {
  if (!days) return "-";
  if (days % 365 === 0) return `${(days / 365) * 12}개월`;
  if (days % 30 === 0) return `${days / 30}개월`;
  return `${days}일`;
}
