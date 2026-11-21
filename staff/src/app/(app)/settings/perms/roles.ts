import type { Perm, Staff } from "@/lib/sb";
import { isOn, isReq, type PermMap, type PermVal } from "@/lib/perm";

/* 권한 (메라 시안 U-PC-SET-12). 3단계: 대표관리자 / 관리자 / 직원.
   시안의 지점장 → 관리자, 매니저·직원 → 직원 으로 읽어요.
   직원별 권한 6칸 = 결제 취소 · 환불 · 회원권 조정 · 매출 보기 · 권한 관리 · 광고비 */

/** 직무별 처음 권한(staff_title_perms). '@manager' = 관리자 기본값. 직원 등록 때 처음 값으로만 써요. */
export type Preset = { name: string; perms: PermMap; sort: number };
export const MANAGER = "@manager";
export const titleOf = (s: Staff) => (s.tier === "manager" ? MANAGER : s.tier === "staff" ? s.title || "직원" : null);

export type Col = { k: string; l: string; s: string; req?: boolean; view?: boolean; fixed?: boolean };
export const COLS: Col[] = [
  { k: "schedule.pay_cancel", l: "결제 취소", s: "결제 취소", req: true },
  { k: "sales.refund", l: "환불", s: "환불", req: true },
  { k: "membership.adjust", l: "회원권 조정", s: "회원권", req: true },
  { k: "sales.others", l: "매출 보기", s: "매출" },
  { k: "@perm", l: "직원 권한 관리", s: "권한", fixed: true },
  { k: "ads.budget", l: "광고비 변경·끄기", s: "광고비", view: true },
];

/** 칸 상태: on 바로 할 수 있음 · req 요청 · off 없음(광고비는 보기) */
export type St = "on" | "req" | "off";
export const stOf = (v: PermVal | undefined | null): St => (isReq(v) ? "req" : isOn(v) ? "on" : "off");
export const valOf = (c: Col, st: St): PermVal => (st === "on" ? true : st === "req" ? { mode: "request" } : false);

/** '대표관리자만' 권한인지 (모르면 그렇다고 봐요) */
export const ownerOnly = (catalog: Perm[], k: string) => catalog.find((x) => x.key === k)?.owner_only ?? true;

/** 역할 기본값 */
export function roleSt(tier: "manager" | "staff", c: Col, catalog: Perm[], mgr: PermMap): St {
  if (c.fixed) return "off";
  if (tier === "manager") {
    if (!ownerOnly(catalog, c.k)) return "on";
    const s = stOf(mgr[c.k]);
    return s === "off" && c.req ? "req" : s;
  }
  return c.req ? "req" : "off";
}

/** 지금 칸 상태 (관리자는 '대표관리자만'이 아닌 권한은 늘 켜짐) */
export function curSt(s: Pick<Staff, "tier" | "perms">, c: Col, catalog: Perm[]): St {
  if (c.fixed) return "off";
  if (s.tier === "manager" && !ownerOnly(catalog, c.k)) return "on";
  const v = stOf(s.perms?.[c.k]);
  return v === "off" && c.req ? "req" : v;
}
/** 토글을 직접 바꿀 수 있는 칸인지 */
export const canToggle = (tier: string, c: Col, catalog: Perm[]) => !c.fixed && !(tier === "manager" && !ownerOnly(catalog, c.k));
