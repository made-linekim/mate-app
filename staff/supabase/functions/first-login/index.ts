import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json, err, sha256, LOGIN_ID_RE } from "../_shared/util.ts";

// 첫 로그인: 아이디 + 1회용 코드 + 새 비밀번호 → 비밀번호 설정
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err("METHOD", "POST만 가능해요", 405);
  const { login_id, code, new_password } = await req.json().catch(() => ({}));
  const id = String(login_id ?? "").trim().toLowerCase();
  if (!LOGIN_ID_RE.test(id) || !/^\d{6}$/.test(String(code ?? ""))) return err("INVALID_INPUT", "아이디나 코드를 확인해 주세요");
  if (typeof new_password !== "string" || new_password.length < 8) return err("WEAK_PASSWORD", "비밀번호는 8자 이상으로 정해 주세요");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: staff } = await admin.from("staff_accounts").select("id,status").eq("login_id", id).maybeSingle();
  if (!staff || staff.status !== "active") return err("NOT_FOUND", "아이디나 코드를 확인해 주세요", 400);
  const { data: sc } = await admin.from("staff_setup_codes").select("*").eq("staff_id", staff.id).maybeSingle();
  if (!sc || new Date(sc.expires_at) < new Date()) return err("CODE_EXPIRED", "코드가 없거나 만료됐어요. 관리자에게 새 코드를 받아 주세요");
  if (sc.attempts >= 5) return err("LOCKED", "5번 틀려서 잠겼어요. 관리자에게 새 코드를 받아 주세요");
  if ((await sha256(`${staff.id}:${code}`)) !== sc.code_hash) {
    await admin.from("staff_setup_codes").update({ attempts: sc.attempts + 1 }).eq("staff_id", staff.id);
    return err("WRONG_CODE", "코드가 맞지 않아요");
  }
  const { error } = await admin.auth.admin.updateUserById(staff.id, {
    password: new_password, user_metadata: { login_id: id, must_set_password: false },
  });
  if (error) return err("AUTH", error.message, 500);
  await admin.from("staff_setup_codes").delete().eq("staff_id", staff.id);
  return json({ ok: true });
});
