// 카카오 검수 '승인'된 알림톡 템플릿 목록 (로그인한 직원만)
import { NextResponse } from "next/server";
import { NHN, ready, sbAs } from "@/lib/server/nhn";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!ready().alimtalk) return NextResponse.json({ error: "알림톡 설정이 아직 끝나지 않았어요." }, { status: 503 });
  const sb = sbAs(req);
  const u = sb ? await sb.auth.getUser() : null;
  if (!u?.data?.user) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 });
  const r = await fetch(`https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3/appkeys/${encodeURIComponent(NHN.atApp())}/senders/${encodeURIComponent(NHN.atSender())}/templates?pageSize=100`,
    { headers: { "X-Secret-Key": NHN.atSecret() }, next: { revalidate: 600 } });
  const j = await r.json().catch(() => null);
  if (!j?.header?.isSuccessful) return NextResponse.json({ error: "템플릿을 불러오지 못했어요." }, { status: 502 });
  const list = (j.templateListResponse?.templates ?? [])
    .filter((t: { status?: string }) => t.status === "TSC03")
    .map((t: { templateCode: string; templateName: string; templateContent: string }) => ({
      code: t.templateCode, name: t.templateName, content: t.templateContent,
      vars: [...new Set([...(t.templateContent ?? "").matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]))],
    }));
  return NextResponse.json({ templates: list });
}
