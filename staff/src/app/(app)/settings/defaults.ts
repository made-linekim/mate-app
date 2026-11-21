/* 설정 기본값 (DB에 값이 없을 때). 056 SQL 의 settings_get 기본값과 같아요. */
export type Basic = { name: string; addr: string; tel: string; mask: boolean; unit: number; dur: number; overlap: boolean };
export const BASIC0 = (b: string): Basic => ({ name: b, addr: "", tel: "", mask: true, unit: 30, dur: 50, overlap: false });
export type Board = { view: "week" | "day" | "month"; zoom: number; holiday: boolean; warn_cnt: number; warn_days: number };
export const BOARD0: Board = { view: "week", zoom: 100, holiday: true, warn_cnt: 2, warn_days: 7 };
export type Room = { name: string; uses: string; cap: number };
export type Naver = { auto: boolean; map: Record<string, string> };
export const NAVER0: Naver = { auto: true, map: {} };
export type Points = { rate: number; ex_disc: boolean; ex_recv: boolean; unit: number; min: number; expire: number };
export const POINTS0: Points = { rate: 5, ex_disc: true, ex_recv: true, unit: 1000, min: 1000, expire: 12 };
export type Grade = { name: string; cond: string; benefit: string };
export const GRADES0: Grade[] = [
  { name: "일반", cond: "조건 없음", benefit: "기본 혜택 없음" },
  { name: "단골", cond: "최근 6개월 방문 8회 이상", benefit: "해피콜 우선" },
  { name: "우수", cond: "연 결제 200만 원 이상, 또는 남은 회차 20회 이상", benefit: "재등록 안내 우선" },
];
export type Ops = { risk_app: number; risk_rsv: number; risk_lounge: number; report_day: string; report_time: string };
export const OPS0: Ops = { risk_app: 3, risk_rsv: 7, risk_lounge: 3, report_day: "일요일", report_time: "20:00" };
export type Pay = { methods: Record<string, boolean>; fee: number | null; fee_from: string | null };
export const PAY0: Pay = { methods: { 카드: true, 현금: true, 계좌이체: true, 미수: false }, fee: null, fee_from: null };
export type Close = { day: string; cash: boolean; month: string; happy: string };
export const CLOSE0: Close = { day: "22:00", cash: true, month: "다음 달 1일", happy: "21:00" };
export type Terminal = { place: string; no: string; on: boolean };
export type ProgFlags = Record<string, { disc: boolean; point: boolean }>;
export type ConnRow = { channel: string; connected: boolean; key_tail: string | null; last_at: string | null; manual?: boolean };
