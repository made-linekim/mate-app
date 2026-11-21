import type { PermOpts } from "@/lib/perm";

/* 세부설정 (헬보 v148 r10 시안 방식): 메뉴 탭 → 기능 카드 켜기·끄기 → 켜면 아래 선택.
   MERA 메뉴에 맞춘 탭 8개. 키는 perm_catalog 의 key. 목록에 없는 키는 catalog 의 menu 이름 탭으로 가요. */
export const TABS = ["예약", "오늘 할 일", "고객", "매출", "통계", "마케팅", "급여", "설정"] as const;

export type Opt =
  | { k: "mode"; label: string; choices: [string, string][] }
  | { k: "show"; label: string; choices: [string, string][] }
  | { k: "scope"; label: string; multi: true; choices: [string, string][] }
  | { k: "period"; label: string; select: [string, string][] };

const MODE: Opt = { k: "mode", label: "권한", choices: [["ok", "가능"], ["request", "요청 보내기"]] };
const PERIOD: Opt = { k: "period", label: "조회 기간", select: [["1m", "최근 1개월"], ["3m", "최근 3개월"], ["6m", "최근 6개월"], ["12m", "최근 12개월"], ["all", "전체"]] };
const SCOPE: Opt = { k: "scope", label: "조회 가능", multi: true, choices: [["title", "같은 직급"], ["branch", "같은 지점 전체"], ["other", "다른 지점"]] };
const SHOW: Opt = { k: "show", label: "보이는 값", choices: [["amount", "금액"], ["rank", "순위만"]] };

export type CardDef = { tab: string; label?: string; help?: string; off?: string; opts?: Opt[]; def?: PermOpts };
export const CARDS: Record<string, CardDef> = {
  "schedule.reserve": { tab: "예약", label: "예약 접수 · 수정", off: "꺼짐 · 예약표를 보기만 해요" },
  "schedule.view_others": { tab: "예약", opts: [SCOPE], def: { scope: ["branch"] } },
  "common.naver": { tab: "예약" },
  "board.view": { tab: "예약", label: "현황보드 보기" },
  "schedule.pay": { tab: "예약", label: "결제 처리 (예약 · 임의 매출)" },
  "schedule.pay_cancel": { tab: "예약", opts: [MODE], def: { mode: "request" }, off: "꺼짐 · 버튼이 안 보여요" },

  "customer.happycall": { tab: "오늘 할 일", label: "해피콜 대상 보기 · 결과 기록" },
  "common.work_memo": { tab: "오늘 할 일" },
  "ai.assistant": { tab: "오늘 할 일" },

  "customer.view": { tab: "고객", label: "고객 목록 · 차트 보기", off: "꺼짐 · 고객 메뉴가 안 보여요" },
  "customer.edit": { tab: "고객" },
  "customer.phone_full": { tab: "고객", off: "꺼짐 · 010-****-1234 처럼 가려 보여요" },
  "customer.health": { tab: "고객" },
  "common.sms_log": { tab: "고객" },
  "common.sms_send": { tab: "고객" },
  "app.manual_cert": { tab: "고객" },
  "app.coin_adjust": { tab: "고객", opts: [MODE], def: { mode: "request" }, off: "꺼짐 · 버튼이 안 보여요" },

  "sales.own": { tab: "매출", label: "내 매출 · 순위 보기", opts: [SHOW], def: { show: "amount" } },
  "sales.others": { tab: "매출", label: "다른 직원 매출 조회", opts: [SCOPE, PERIOD, SHOW], def: { scope: ["branch"], period: "1m", show: "rank" } },
  "sales.by_customer": { tab: "매출", opts: [PERIOD], def: { period: "3m" } },
  "sales.membership": { tab: "매출" },
  "sales.service": { tab: "매출" },
  "sales.product": { tab: "매출" },
  "sales.other": { tab: "매출" },
  "sales.expense": { tab: "매출", opts: [MODE], def: { mode: "ok" } },
  "sales.receivable": { tab: "매출" },
  "sales.accounts": { tab: "매출" },

  "stats.view": { tab: "통계", opts: [PERIOD], def: { period: "3m" } },
  "export.excel": { tab: "통계" },

  "ads.budget": { tab: "마케팅" },

  "payroll.own": { tab: "급여" },
  "attendance.self": { tab: "급여" },
  "attendance.manage": { tab: "급여", opts: [SCOPE], def: { scope: ["branch"] } },
  "payroll.manage": { tab: "급여" },

  "settings.edit": { tab: "설정", label: "설정 바꾸기 (업무시간 · 휴무 · 상품)" },
};

/** 켤 때 넣는 값: 하위 선택이 있으면 기본값, 없으면 true */
export const onValue = (key: string) => {
  const d = CARDS[key];
  return d?.opts?.length ? { ...(d.def ?? {}) } : true;
};
