import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json, err, sha256, newCode, emailOf, LOGIN_ID_RE } from "../_shared/util.ts";

// 직원 등록 / 코드 재발급. 권한 검사는 호출한 사람의 토큰으로 RLS·트리거가 함
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await asUser.rpc("me");
  if (!me?.id || !["owner", "manager"].includes(me.tier)) return err("FORBIDDEN", "직원 관리는 대표관리자·관리자만 할 수 있어요", 403);

  const body = await req.json().catch(() => ({}));
  const issue = async (staffId: string) => {
    const code = newCode();
    await admin.from("staff_setup_codes").upsert({
      staff_id: staffId, code_hash: await sha256(`${staffId}:${code}`),
      expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(), issued_by: me.id, attempts: 0,
    });
    return code;
  };

  if (body.action === "create") {
    const s = body.staff ?? {};
    const loginId = String(s.login_id ?? "").trim().toLowerCase();
    if (!LOGIN_ID_RE.test(loginId)) return err("INVALID_INPUT", "아이디는 영문 소문자·숫자·_ 4~20자예요");
    if (!s.name) return err("INVALID_INPUT", "이름을 넣어 주세요");
    const { data: dup } = await admin.from("staff_accounts").select("id").eq("login_id", loginId).maybeSingle();
    if (dup) return err("DUPLICATE", "이미 쓰는 아이디예요");
    const pw = crypto.randomUUID() + crypto.randomUUID();
    const { data: u, error: ue } = await admin.auth.admin.createUser({
      email: emailOf(loginId), password: pw, email_confirm: true,
      user_metadata: { login_id: loginId, must_set_password: true },
    });
    if (ue || !u.user) return err("AUTH", ue?.message ?? "계정 생성 실패", 500);
    // 호출자 권한으로 넣어야 관리자 제한(직원 등급만, 대표 전용 권한 금지)이 적용됨
    const { error: ie } = await asUser.from("staff_accounts").insert({
      id: u.user.id, login_id: loginId, name: s.name, title: s.title ?? null,
      branch: s.branch ?? me.branch, tier: s.tier ?? "staff", perms: s.perms ?? {},
      hired_on: s.hired_on ?? null, color: s.color ?? "#DDDDDD",
    });
    if (ie) { await admin.auth.admin.deleteUser(u.user.id); return err("FORBIDDEN", ie.message, 403); }
    return json({ ok: true, staff_id: u.user.id, setup_code: await issue(u.user.id), expires_in_hours: 72 });
  }

  if (body.action === "reissue_code") {
    // 볼 수 있고 수정 가능한 대상인지: 같은 값으로 update 해서 RLS·트리거 통과 여부 확인
    const { data: t } = await asUser.from("staff_accounts").select("id,tier,status").eq("id", body.staff_id).maybeSingle();
    if (!t) return err("NOT_FOUND", "직원을 찾을 수 없어요", 404);
    if (me.tier === "manager" && t.tier !== "staff") return err("FORBIDDEN", "관리자는 직원 등급만 코드를 줄 수 있어요", 403);
    return json({ ok: true, setup_code: await issue(t.id), expires_in_hours: 72 });
  }
  return err("INVALID_INPUT", "action 값을 확인해 주세요");
});
