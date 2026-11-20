"use client";
import { createContext, useContext } from "react";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

/* 설정 왼쪽 메뉴 (시안 11-01~11-18, 8차에서 '관리 항목' → '프로그램 설정', '문자 · 알림톡' 추가).
   href 가 없는 칸은 아직 백엔드가 없어 '준비 중'으로만 보여요. */
export type SetItem = { label: string; href?: string };
export const SET_NAV: { group: string; items: SetItem[] }[] = [
  { group: "예약", items: [
    { label: "기본" }, { label: "예약표" },
    { label: "업무시간", href: "/settings/hours" }, { label: "휴무", href: "/settings/holidays" },
    { label: "관리실" }, { label: "네이버 예약 연동" }, { label: "문자 · 알림톡" },
  ] },
  { group: "상품", items: [
    { label: "프로그램 설정", href: "/settings/programs" }, { label: "회원권 상품", href: "/settings/products" },
    { label: "포인트" }, { label: "고객 등급" },
  ] },
  { group: "사람", items: [
    { label: "직원", href: "/settings/staff" }, { label: "권한", href: "/settings/perms" }, { label: "계정" },
  ] },
  { group: "운영", items: [
    { label: "목표" }, { label: "결제 · 수수료" }, { label: "마감 기준" }, { label: "카드 단말기" }, { label: "연결" },
  ] },
];
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
