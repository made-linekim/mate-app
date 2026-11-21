// 고객 검색조건 (뷰티사랑넷 흐름: 조건 하나 → 기간/회차 → 관리 선택 → 선택완료). 서버 customer_search 와 같은 모양.
export type CondT =
  | "usage" | "rsv" | "birthday" | "first_visit" | "last_visit" | "dormant"
  | "period_end" | "period_sold" | "period_hold" | "count_left" | "count_sold" | "count_used" | "member" | "new" | "initial" | "manager" | "deleted" | "report_unsent" | "lounge_idle";
export type Cond = { t: CondT; from?: string; to?: string; days?: number; min?: number; max?: number; programs?: string[]; v?: string };
export const INITIALS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export type Kind = "date" | "days" | "range" | "none";
export const TYPES: { t: CondT; l: string; kind: Kind; progs?: boolean; off?: string }[] = [
  { t: "usage", l: "이용관리", kind: "date", progs: true },
  { t: "rsv", l: "예약일", kind: "date", progs: true },
  { t: "birthday", l: "생일", kind: "none", off: "생일 정보가 아직 없어요" },
  { t: "first_visit", l: "처음방문일", kind: "date" },
  { t: "last_visit", l: "최종방문일", kind: "date" },
  { t: "dormant", l: "미방문일", kind: "days" },
  { t: "period_end", l: "기간회원권 만료일", kind: "date" },
  { t: "period_sold", l: "기간회원권 판매일", kind: "date" },
  { t: "period_hold", l: "기간회원권 보유고객", kind: "none" },
  { t: "count_left", l: "회차회원권 잔여수", kind: "range", progs: true },
  { t: "count_sold", l: "회차회원권 판매일", kind: "date", progs: true },
  { t: "count_used", l: "회차회원권 사용일", kind: "date", progs: true },
];
export const typeOf = (t: CondT) => TYPES.find((x) => x.t === t);

// 날짜 (한국 시간)
export const today = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const D = (s: string) => new Date(s + "T00:00:00Z");
const S = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
export const weekStart = (s: string) => addDays(s, -D(s).getUTCDay()); // 일요일 시작
export const monthStart = (s: string, n = 0) => { const d = D(s); return S(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))); };
export const monthEnd = (s: string, n = 0) => { const d = D(s); return S(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n + 1, 0))); };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
export const withDay = (s?: string) => (s ? `${s} (${WD[D(s).getUTCDay()]})` : "");

export type Mode = "day" | "week" | "month" | "pick";
// 일/주/월 기준: 오늘을 0으로 한 칸 수 (음수 = 전, 양수 = 후)
export function rangeOf(mode: Mode, a: number, b: number, pf: string, pt: string): [string, string] {
  const t = today();
  if (mode === "day") return [addDays(t, Math.min(a, b)), addDays(t, Math.max(a, b))];
  if (mode === "week") { const w = weekStart(t); return [addDays(w, 7 * Math.min(a, b)), addDays(w, 7 * Math.max(a, b) + 6)]; }
  if (mode === "month") return [monthStart(t, Math.min(a, b)), monthEnd(t, Math.max(a, b))];
  return pf <= pt ? [pf, pt] : [pt, pf];
}
export const offLabel = (mode: Mode, n: number) => {
  const u = mode === "day" ? "일" : mode === "week" ? "주" : "개월";
  if (n === 0) return mode === "day" ? "금일" : mode === "week" ? "이번 주" : "이번 달";
  return `${Math.abs(n)}${u} ${n < 0 ? "전" : "후"}`;
};
export const OFFS: Record<Exclude<Mode, "pick">, number[]> = {
  day: [-365, -180, -90, -60, -30, -14, -7, -3, -2, -1, 0, 1, 2, 3, 7, 14, 30, 60, 90],
  week: [-12, -8, -4, -3, -2, -1, 0, 1, 2, 3, 4, 8],
  month: [-12, -6, -3, -2, -1, 0, 1, 2, 3, 6],
};
export const DORMANT = [7, 14, 30, 60, 90, 180, 365];

// 조건 한 줄 설명
export function condText(c: Cond, progName?: (id: string) => string) {
  const l = typeOf(c.t)?.l ?? (c.t === "member" ? "보유고객" : c.t === "new" ? "신규 등록" : c.t);
  const p = c.programs?.length ? ` · ${c.programs.slice(0, 2).map((x) => progName?.(x) ?? x).join(", ")}${c.programs.length > 2 ? ` 외 ${c.programs.length - 2}` : ""}` : "";
  if (c.t === "initial") return `초성 ${c.v}`;
  if (c.t === "dormant") return `${l} ${c.days ?? 60}일 이상`;
  if (c.t === "count_left") return `${l} ${c.min ?? 0}~${c.max ?? 99}회${p}`;
  if (c.from || c.to) return `${l} ${(c.from ?? "").slice(2).replaceAll("-", ".")}~${(c.to ?? "").slice(2).replaceAll("-", ".")}${p}`;
  return l + p;
}

// 기본 칩 (뷰티사랑넷 저장 조건 참고). 날짜는 열 때마다 오늘 기준으로 다시 계산
export type Chip = { id: string; name: string; conds: Cond[]; builtin?: boolean; app?: boolean };
// v3 확정 시안(U-PC-CUS-1) 저장된 조건 칩 순서 그대로. 리포트·라운지 칩은 고객 앱 기록이 생기면 찾을 수 있어요(app: true).
export function builtinChips(): Chip[] {
  const t = today();
  return [
    { id: "b-all", name: "전체", conds: [], builtin: true },
    { id: "b-new", name: "금월 신규", conds: [{ t: "new", from: monthStart(t), to: monthEnd(t) }], builtin: true },
    { id: "b-left2", name: "잔여 2회 이하", conds: [{ t: "count_left", min: 0, max: 2 }], builtin: true },
    { id: "b-left", name: "잔여 10회 미만", conds: [{ t: "count_left", min: 0, max: 9 }], builtin: true },
    { id: "b-end", name: "기간 종료", conds: [{ t: "period_end", from: monthStart(t), to: monthEnd(t) }], builtin: true },
    { id: "b-dormant", name: "미방문 30일 이상", conds: [{ t: "dormant", days: 30 }], builtin: true },
    { id: "b-report", name: "주간 리포트 미발송", conds: [{ t: "report_unsent" }], builtin: true, app: true },
    { id: "b-lounge", name: "라운지 3일 미참여", conds: [{ t: "lounge_idle" }], builtin: true, app: true },
  ];
}
