"use client";
// 예약표 공통: 타입, 날짜·시간 계산
export type Program = {
  id: string; name: string; short: string | null; grp: string; parent_id: string | null;
  color: string | null; minutes: number; capacity: number; sort: number;
};
export type RStatus = "예약" | "완료" | "취소" | "노쇼";
export type Rsv = {
  id: string; branch: string; day: string; start_time: string; minutes: number; kind: string;
  customer_key: string | null; customer_name: string; title: string; staff_id: string; staff_name: string | null;
  program_id: string | null; status: RStatus; memo: string; cancel_reason: string; receiver_name: string | null; created_at: string;
};
export type Holiday = { day: string; reason: string };

export const DAY_START = 9 * 60;   // 09:00
export const DAY_END = 21 * 60;    // 21:00
export const STEP = 30;            // 30분 간격
export const ROW_H = 32;           // 30분 한 칸 높이(px)

export const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const slotLabel = (m: number) => {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h < 12 ? "오전" : "오후"} ${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")}`;
};
export const SLOTS = Array.from({ length: (DAY_END - DAY_START) / STEP }, (_, i) => DAY_START + i * STEP);

// 날짜는 항상 한국 시간 기준 YYYY-MM-DD 문자열로 다룸
export const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};
export const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const weekStart = (d: string) => addDays(d, -((dow(d) + 6) % 7)); // 월요일 시작
export const fmtDay = (d: string) => { const [, m, dd] = d.split("-"); return `${Number(m)}월 ${Number(dd)}일 (${DOW[dow(d)]})`; };

export const overlaps = (aStart: number, aMin: number, bStart: number, bMin: number) => aStart < bStart + bMin && bStart < aStart + aMin;
export const active = (r: Rsv) => r.status === "예약" || r.status === "완료";

// 같은 프로그램·겹치는 시간에 잡힌(예약·완료) 인원
export function usedAt(list: Rsv[], day: string, programId: string, start: number, minutes: number, except?: string) {
  return list.filter((r) => r.day === day && r.program_id === programId && active(r) && r.id !== except
    && overlaps(toMin(r.start_time), r.minutes, start, minutes)).length;
}

// 한 열 안에서 겹치는 블록을 나란히 배치(lane)
export function lanes<T extends { start: number; minutes: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.minutes - a.minutes);
  const ends: number[] = [];
  const placed = sorted.map((it) => {
    let lane = ends.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = it.start + it.minutes;
    return { ...it, lane };
  });
  // 서로 겹치는 묶음마다 lane 수 계산
  return placed.map((p) => ({
    ...p, lanes: Math.max(...placed.filter((q) => overlaps(q.start, q.minutes, p.start, p.minutes)).map((q) => q.lane)) + 1,
  }));
}

export const STATUS_STYLE: Record<RStatus, React.CSSProperties> = {
  예약: {},
  완료: { opacity: "var(--st-done-opacity)" as unknown as number },
  취소: { background: "var(--st-cancel-bg)", color: "var(--st-cancel-ink)", borderColor: "var(--st-cancel-line)" },
  노쇼: { background: "var(--st-noshow-bg)", color: "var(--st-noshow-ink)", borderColor: "var(--st-noshow-line)" },
};
