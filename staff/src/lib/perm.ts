import type { Staff } from "./sb";

/* 권한 값: true (켬) · {mode, scope, period, show …} (켬 + 하위 선택) · 없음/false (끔)
   mode:"request" 는 '요청 보내기' 라서 직접 실행은 못 해요 (서버 can() 도 같음, 041 SQL). */
export type PermOpts = { mode?: "ok" | "request"; scope?: string[]; period?: string; show?: string };
export type PermVal = boolean | PermOpts;
export type PermMap = Record<string, PermVal>;

export const isOn = (v: PermVal | undefined | null) => v != null && v !== false;
export const isReq = (v: PermVal | undefined | null) => typeof v === "object" && v !== null && v.mode === "request";

/** 지금 바로 할 수 있는지 (요청 보내기는 아니오). 관리자는 '대표관리자만' 권한이 아니면 늘 켜짐 — ownerOnly 를 넘겨 주세요. */
export function has(me: Staff, key: string, ownerOnly = true) {
  if (me.tier === "owner") return true;
  if (me.tier === "manager" && !ownerOnly) return true;
  const v = me.perms?.[key];
  return isOn(v) && !isReq(v);
}

/** 같은 값인지 (끔 = 없음 = false, 하위 선택은 키 순서 상관없이) */
export function sameVal(a: PermVal | undefined, b: PermVal | undefined) {
  return norm(a) === norm(b);
}
function norm(v: PermVal | undefined) {
  if (!isOn(v)) return "";
  if (v === true) return "1";
  const o = v as PermOpts;
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, Array.isArray(o[k as keyof PermOpts]) ? [...(o[k as keyof PermOpts] as string[])].sort() : o[k as keyof PermOpts]]));
}
