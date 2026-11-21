"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { sb, callFn, emailOf, LOGIN_ID_RE } from "@/lib/sb";
import s from "../auth.module.css";

function Form() {
  const router = useRouter();
  const q = useSearchParams();
  const [id, setId] = useState(q.get("id") ?? "");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const lid = id.trim().toLowerCase();
    if (!LOGIN_ID_RE.test(lid)) return setMsg("아이디를 확인해 주세요");
    if (!/^\d{6}$/.test(code)) return setMsg("코드는 숫자 6자리예요");
    if (pw.length < 8) return setMsg("비밀번호는 8자 이상으로 정해 주세요");
    if (pw !== pw2) return setMsg("비밀번호 두 칸이 달라요");
    setBusy(true);
    try {
      await callFn("first-login", { login_id: lid, code, new_password: pw });
      const { error } = await sb.auth.signInWithPassword({ email: emailOf(lid), password: pw });
      if (error) throw new Error("비밀번호는 정했어요. 로그인 화면에서 다시 들어와 주세요");
      router.replace("/schedule");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card ${s.box}`} onSubmit={submit}>
      <p className={s.logo}>MERA</p>
      <p className={s.sub}>첫 로그인 · 관리자에게 받은 6자리 코드로 비밀번호를 정해요 (코드는 72시간 동안 쓸 수 있어요)</p>
      <div className="field">
        <label htmlFor="id">아이디</label>
        <input id="id" className="inp" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="code">코드 6자리</label>
        <input id="code" className="inp num" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="field">
        <label htmlFor="pw">새 비밀번호 (8자 이상)</label>
        <input id="pw" className="inp" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pw2">새 비밀번호 확인</label>
        <input id="pw2" className="inp" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <button className="btn p" style={{ width: "100%", marginTop: 20 }} disabled={busy}>{busy ? "저장 중…" : "비밀번호 정하고 들어가기"}</button>
      {msg && <p className={s.err}>{msg}</p>}
      <p className={s.foot}><Link href="/login">로그인으로 돌아가기</Link></p>
    </form>
  );
}

export default function FirstLogin() {
  return (
    <main className={s.wrap}>
      <Suspense><Form /></Suspense>
    </main>
  );
}
