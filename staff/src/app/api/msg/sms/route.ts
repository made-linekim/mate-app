// 광고 문자 보내기 (서버 전용). 권한·지점·밤시간·수신동의는 DB 함수 msg_sms_begin 이 검사해요.
import { NextResponse } from "next/server";
import { NHN, ready, sbAs, sendAdSms, errText } from "@/lib/server/nhn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!ready().sms) return NextResponse.json({ error: "문자 업체 키가 아직 설정되지 않았어요." }, { status: 503 });
  const sb = sbAs(req);
  if (!sb) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { branch, text, testNo } = await req.json().catch(() => ({}));
  if (typeof branch !== "string" || typeof text !== "string") return NextResponse.json({ error: "문구를 다시 확인해 주세요." }, { status: 400 });

  const b = await sb.rpc("msg_sms_begin", { p_branch: branch, p_text: text, p_test_no: typeof testNo === "string" && testNo ? testNo : null });
  if (b.error) return NextResponse.json({ error: errText(b.error.message) }, { status: 400 });
  const job = b.data as { id: string; count: number; send_no: string; body: string; title: string };

  const t = await sb.rpc("msg_targets", { p_id: job.id, p_secret: NHN.serverSecret() });
  if (t.error) {
    await sb.rpc("msg_finish", { p_id: job.id, p_secret: NHN.serverSecret(), p_ok: 0, p_fail: job.count, p_request_id: null, p_error: "targets: " + t.error.message });
    return NextResponse.json({ error: errText(t.error.message) }, { status: 400 });
  }
  const to = ((t.data ?? []) as { phone: string }[]).map((x) => x.phone);
  let r;
  try { r = await sendAdSms({ sendNo: job.send_no, title: job.title, body: job.body, to }); }
  catch (e) { r = { ok: 0, fail: to.length, requestId: null, error: (e as Error).message }; }
  await sb.rpc("msg_finish", { p_id: job.id, p_secret: NHN.serverSecret(), p_ok: r.ok, p_fail: r.fail, p_request_id: r.requestId, p_error: r.error });
  if (r.ok === 0) return NextResponse.json({ error: `보내지 못했어요. (${r.error ?? "업체 응답 없음"})` }, { status: 502 });
  return NextResponse.json({ ok: r.ok, fail: r.fail });
}
