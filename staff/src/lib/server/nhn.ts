// 서버 전용: NHN Cloud 문자(SMS/LMS) · 알림톡 발송. 키는 Vercel 환경변수에만 있어요.
import { createClient } from "@supabase/supabase-js";

const env = (k: string) => (process.env[k] ?? "").trim();
export const NHN = {
  smsApp: () => env("NHN_SMS_APPKEY"),
  smsSecret: () => env("NHN_SMS_SECRETKEY"),
  atApp: () => env("NHN_ALIMTALK_APPKEY"),
  atSecret: () => env("NHN_ALIMTALK_SECRETKEY"),
  atSender: () => env("NHN_ALIMTALK_SENDERKEY"),
  serverSecret: () => env("MSG_SERVER_SECRET"),
};
export const ready = () => ({
  sms: !!(NHN.smsApp() && NHN.smsSecret() && NHN.serverSecret()),
  alimtalk: !!(NHN.atApp() && NHN.atSecret() && NHN.atSender() && NHN.serverSecret()),
});

/** 직원 로그인 토큰으로 Supabase 부르기 (권한 검사는 DB 함수 안에서) */
export function sbAs(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** EUC-KR 기준 바이트 (한글 2, 영문 1) */
export const euckrBytes = (s: string) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);

type Result = { ok: number; fail: number; requestId: string | null; error: string | null };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function post(url: string, secret: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8", "X-Secret-Key": secret },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return r.json().catch(() => ({ header: { isSuccessful: false, resultMessage: `HTTP ${r.status}` } }));
}

/** 광고 문자: 90바이트 이하 ad-sms, 넘으면 ad-mms(장문). 1,000명씩 나눠 보내요. */
export async function sendAdSms(p: { sendNo: string; title: string; body: string; to: string[] }): Promise<Result> {
  const long = euckrBytes(p.body) > 90;
  const url = `https://sms.api.nhncloudservice.com/sms/v3.0/appKeys/${encodeURIComponent(NHN.smsApp())}/sender/${long ? "ad-mms" : "ad-sms"}`;
  let ok = 0, fail = 0, requestId: string | null = null, error: string | null = null;
  for (const part of chunk(p.to, 1000)) {
    const j = await post(url, NHN.smsSecret(), {
      ...(long ? { title: p.title } : {}),
      body: p.body, sendNo: p.sendNo, userId: "mera-staff",
      recipientList: part.map((n) => ({ recipientNo: n })),
    });
    if (!j?.header?.isSuccessful) { fail += part.length; error = `${j?.header?.resultCode ?? ""} ${j?.header?.resultMessage ?? "발송 실패"}`.trim(); continue; }
    requestId ??= j.body?.data?.requestId ?? null;
    for (const x of j.body?.data?.sendResultList ?? []) (x.resultCode === 0 ? ok++ : fail++);
  }
  return { ok, fail, requestId, error };
}

/** 알림톡 1명 (카카오 검수 끝난 템플릿 코드 + 치환값) */
export async function sendAlimtalk(p: { templateCode: string; to: string; params: Record<string, string> }): Promise<Result> {
  const url = `https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${encodeURIComponent(NHN.atApp())}/messages`;
  const j = await post(url, NHN.atSecret(), {
    senderKey: NHN.atSender(), templateCode: p.templateCode,
    recipientList: [{ recipientNo: p.to, templateParameter: p.params }],
  });
  if (!j?.header?.isSuccessful) return { ok: 0, fail: 1, requestId: null, error: `${j?.header?.resultCode ?? ""} ${j?.header?.resultMessage ?? "발송 실패"}`.trim() };
  const r = j.message?.sendResults?.[0];
  const good = r ? r.resultCode === 0 : true;
  return { ok: good ? 1 : 0, fail: good ? 0 : 1, requestId: j.message?.requestId ?? null, error: good ? null : r?.resultMessage ?? null };
}

/** DB 오류 → 직원용 문구 */
const ERR: Record<string, string> = {
  NO_PERMISSION: "권한이 없어요. 대표관리자에게 요청해 주세요.",
  NO_BRANCH: "이 지점은 보낼 수 없어요.",
  NOT_SIGNED_IN: "다시 로그인해 주세요.",
  NIGHT_AD: "밤 9시부터 아침 8시까지는 광고 문자를 보낼 수 없어요.",
  NO_SEND_NO: "발신번호가 아직 설정되지 않았어요.",
  NO_080: "080 수신거부 번호가 아직 설정되지 않았어요.",
  NO_TARGET: "광고 수신에 동의한 고객이 없어요.",
  TOO_SOON: "방금 보냈어요. 10분 뒤에 다시 보내 주세요.",
  BAD_PHONE: "휴대폰 번호를 다시 확인해 주세요.",
  BAD_INPUT: "문구를 다시 확인해 주세요.",
  NOT_FOUND: "발송 준비가 끝났어요. 다시 눌러 주세요.",
};
export function errText(m: string) {
  if (/does not exist|Could not find the function/i.test(m)) return "DB 설정(046 SQL)이 아직 실행되지 않았어요.";
  const k = Object.keys(ERR).find((x) => m.includes(x));
  return k ? ERR[k] : "보내지 못했어요. 잠시 뒤 다시 해 주세요.";
}
