// 알림톡 1명 보내기 (서버 전용). 카카오 검수를 통과한 템플릿 코드만 보낼 수 있어요.
import { NextResponse } from "next/server";
import { NHN, ready, sbAs, sendAlimtalk, errText } from "@/lib/server/nhn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!ready().alimtalk) return NextResponse.json({ error: "알림톡 설정이 아직 끝나지 않았어요." }, { status: 503 });
  const sb = sbAs(req);
  if (!sb) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const { customerKey, templateCode, params, testNo } = await req.json().catch(() => ({}));
  if (typeof templateCode !== "string" || !templateCode) return NextResponse.json({ error: "템플릿을 골라 주세요." }, { status: 400 });
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(params ?? {})) if (typeof v === "string" || typeof v === "number") p[k] = String(v).slice(0, 200);

  const b = await sb.rpc("msg_alimtalk_begin", { p_customer_key: customerKey ?? null, p_template_code: templateCode, p_params: p, p_test_no: typeof testNo === "string" && testNo ? testNo : null });
  if (b.error) return NextResponse.json({ error: errText(b.error.message) }, { status: 400 });
  const id = (b.data as { id: string }).id;
  const t = await sb.rpc("msg_targets", { p_id: id, p_secret: NHN.serverSecret() });
  const to = ((t.data ?? []) as { phone: string }[])[0]?.phone;
  if (t.error || !to) {
    await sb.rpc("msg_finish", { p_id: id, p_secret: NHN.serverSecret(), p_ok: 0, p_fail: 1, p_request_id: null, p_error: t.error?.message ?? "no phone" });
    return NextResponse.json({ error: errText(t.error?.message ?? "BAD_PHONE") }, { status: 400 });
  }
  let r;
  try { r = await sendAlimtalk({ templateCode, to, params: p }); }
  catch (e) { r = { ok: 0, fail: 1, requestId: null, error: (e as Error).message }; }
  await sb.rpc("msg_finish", { p_id: id, p_secret: NHN.serverSecret(), p_ok: r.ok, p_fail: r.fail, p_request_id: r.requestId, p_error: r.error });
  if (r.ok === 0) return NextResponse.json({ error: `보내지 못했어요. (${r.error ?? "업체 응답 없음"})` }, { status: 502 });
  return NextResponse.json({ ok: 1 });
}
