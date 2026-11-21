"use client";
/* 통계 · 집계 공용 (리포트 목록, 숫자 모양, 기간) — DB: /mnt/project-files/mera/db/041_통계_집계.sql */
import { todayKST } from "./sales";

export type Cat = "매출" | "고객" | "예약·방문" | "직원";
export type Span = "연간" | "월간" | "일간" | "전체";
/* 기간 고르는 방식: year=연도, range=기간(이번 달·올해·직접), now=지금 기준, last12=최근 1년 */
export type PeriodKind = "year" | "range" | "now" | "last12";
export type ReportDef = {
  id: string; cat: Cat; span: Span; title: string; desc: string; period: PeriodKind;
  money?: boolean;           // 금액 권한이 있어야 의미 있는 리포트
  empty: "sales" | "rsv" | "cust" | "hc"; // 빈 화면 안내 문구 종류
  defRange?: "month" | "year";
};

export const REPORTS: ReportDef[] = [
  { id: "sales_month", cat: "매출", span: "월간", title: "월 매출", desc: "올해와 작년 월별 매출을 비교해요", period: "year", money: true, empty: "sales" },
  { id: "sales_year", cat: "매출", span: "연간", title: "연간 매출", desc: "최근 3년 매출을 구분별로 봐요", period: "year", money: true, empty: "sales" },
  { id: "sales_day", cat: "매출", span: "일간", title: "일간 매출", desc: "날짜별 매출과 건수를 봐요", period: "range", money: true, empty: "sales", defRange: "month" },
  { id: "sales_kind", cat: "매출", span: "월간", title: "구분별 매출", desc: "관리·회원권·제품·기타로 나눠 봐요", period: "year", money: true, empty: "sales" },
  { id: "sales_method", cat: "매출", span: "월간", title: "결제 수단별", desc: "카드·현금·계좌·NPay 비중을 봐요", period: "year", money: true, empty: "sales" },
  { id: "sales_staff", cat: "매출", span: "월간", title: "담당자별 매출", desc: "직원마다 매출과 건수를 봐요", period: "range", money: true, empty: "sales", defRange: "month" },
  { id: "sales_service", cat: "매출", span: "월간", title: "관리별 매출", desc: "어떤 관리가 많이 나갔는지 봐요", period: "range", money: true, empty: "sales", defRange: "month" },
  { id: "receivable", cat: "매출", span: "월간", title: "미수금 추이", desc: "받지 못한 금액의 흐름을 봐요", period: "year", money: true, empty: "sales" },
  { id: "membership_sales", cat: "매출", span: "월간", title: "회원권 판매", desc: "새 회원권 수와 회원권 매출을 봐요", period: "year", empty: "sales" },
  { id: "cust_new", cat: "고객", span: "연간", title: "신규 고객", desc: "최근 3년 월별 새 고객 수를 봐요", period: "year", empty: "cust" },
  { id: "cust_rank", cat: "고객", span: "연간", title: "고객 매출 순위", desc: "매출이 많은 고객 20명을 봐요", period: "range", money: true, empty: "sales", defRange: "year" },
  { id: "cust_avg", cat: "고객", span: "월간", title: "고객 평균 매출", desc: "결제한 고객 한 명당 매출을 봐요", period: "year", money: true, empty: "sales" },
  { id: "churn", cat: "고객", span: "전체", title: "이탈 위험", desc: "마지막 방문으로 연락할 고객 수를 봐요", period: "now", empty: "cust" },
  { id: "rsv_status", cat: "예약·방문", span: "월간", title: "예약 현황", desc: "예약·완료·취소·노쇼를 봐요", period: "year", empty: "rsv" },
  { id: "noshow_top", cat: "예약·방문", span: "연간", title: "노쇼 많은 고객", desc: "노쇼가 많은 고객 10명을 봐요", period: "range", empty: "rsv", defRange: "year" },
  { id: "cancel_top", cat: "예약·방문", span: "연간", title: "예약 취소 많은 고객", desc: "취소가 많은 고객 10명을 봐요", period: "range", empty: "rsv", defRange: "year" },
  { id: "visit_rank", cat: "예약·방문", span: "연간", title: "방문 순위", desc: "방문이 많은 고객 10명을 봐요", period: "range", empty: "rsv", defRange: "year" },
  { id: "hour_visits", cat: "예약·방문", span: "월간", title: "시간대별 방문", desc: "몇 시에 많이 오는지 봐요", period: "range", empty: "rsv", defRange: "month" },
  { id: "weekday", cat: "예약·방문", span: "월간", title: "요일별 방문", desc: "무슨 요일에 많이 오는지 봐요", period: "range", empty: "rsv", defRange: "month" },
  { id: "staff_work", cat: "직원", span: "월간", title: "담당별 처리", desc: "직원별 예약·완료·해피콜 처리를 봐요", period: "range", empty: "rsv", defRange: "month" },
  { id: "staff_minutes", cat: "직원", span: "월간", title: "직원별 관리 시간", desc: "최근 1년 월별 관리 시간을 봐요", period: "last12", money: true, empty: "sales" },
  { id: "happycall", cat: "직원", span: "월간", title: "해피콜 이행", desc: "해피콜 대상 중 몇 명에게 연락했는지 봐요", period: "year", empty: "hc" },
];
export const CATS: Cat[] = ["매출", "고객", "예약·방문", "직원"];
export const reportOf = (id: string) => REPORTS.find((r) => r.id === id);

export const EMPTY_MSG: Record<ReportDef["empty"], string> = {
  sales: "아직 매출 기록이 없어요. 뷰티사랑넷 매출 엑셀을 옮기거나 예약에서 결제하면 바로 채워져요.",
  rsv: "아직 예약 기록이 없어요. 예약표에서 예약을 받기 시작하면 쌓여요.",
  cust: "이 기간에 해당하는 고객이 없어요.",
  hc: "아직 해피콜 기록이 없어요. 오늘 할 일 > 해피콜에서 결과를 누르면 쌓여요.",
};

export type ColType = "text" | "num" | "won" | "pct" | "min";
export type Col = [string, string, ColType];
export type Row = Record<string, string | number | null>;
export type ReportData = {
  cols: Col[]; rows: Row[]; money: boolean; note: string | null; branch: string;
  chart: { x: string; bars: string[]; names: string[] } | null;
};

export function fmt(v: unknown, t: ColType): string {
  if (v == null || v === "") return t === "text" ? "-" : "0";
  if (t === "text") return String(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (t === "pct") return `${n}%`;
  if (t === "min") return n >= 60 ? `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ""}` : `${n}분`;
  return n.toLocaleString();
}
export const isNumCol = (t: ColType) => t === "num" || t === "won" || t === "min";
export const hasData = (d: ReportData | null) =>
  !!d && d.rows.some((r) => d.cols.some(([k, , t]) => isNumCol(t) && Number(r[k] ?? 0) !== 0));

/* 기간 */
const pad = (n: number) => String(n).padStart(2, "0");
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const monthRange = (ym: string) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return { from: `${ym}-01`, to: `${ym}-${pad(lastDay(y, m))}` };
};
export const yearRange = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });
export const thisMonth = () => todayKST().slice(0, 7);
export const thisYear = () => +todayKST().slice(0, 4);
export const dot = (d: string) => `${+d.slice(5, 7)}.${d.slice(8, 10)}`;

/* 표 → CSV 한 줄씩 */
export function tableCsv(cols: Col[], rows: Row[]) {
  return { head: cols.map((c) => c[1]), body: rows.map((r) => cols.map(([k, , t]) => (t === "text" ? (r[k] ?? "") : Number(r[k] ?? 0)))) };
}

/* RPC 오류를 사람 말로 */
export function errText(e: { code?: string; message?: string } | null) {
  if (!e) return "";
  if (e.code === "PGRST202" || /Could not find the function/i.test(e.message ?? "")) return "통계용 DB 준비가 아직이에요. 041_통계_집계.sql 을 실행하면 바로 보여요.";
  if (e.code === "42501" || /NO_PERMISSION/.test(e.message ?? "")) return "통계를 볼 권한이 없어요. 대표관리자에게 '집계·통계' 권한을 요청해 주세요.";
  return "불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.";
}
