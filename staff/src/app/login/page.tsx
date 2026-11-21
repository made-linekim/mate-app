"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { sb, emailOf, LOGIN_ID_RE } from "@/lib/sb";
import s from "../auth.module.css";

export default function Login() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!LOGIN_ID_RE.test(id.trim().toLowerCase())) return setMsg("아이디를 확인해 주세요");
    setBusy(true);
    const { data, error } = await sb.auth.signInWithPassword({ email: emailOf(id), password: pw });
    setBusy(false);
    if (error) return setMsg("아이디나 비밀번호가 맞지 않아요. 처음이면 아래 '첫 로그인'으로 들어와 주세요");
    if (data.user?.user_metadata?.must_set_password) {
      await sb.auth.signOut();
      return router.push(`/first-login?id=${encodeURIComponent(id.trim().toLowerCase())}`);
    }
    router.replace("/schedule");
  }

  return (
    <main className={s.wrap}>
      <form className={`card ${s.box}`} onSubmit={submit}>
        <p className={s.logo}>MERA</p>
        <p className={s.sub}>직원 로그인</p>
        <div className="field">
          <label htmlFor="id">아이디</label>
          <input id="id" className="inp" autoComplete="username" autoCapitalize="none" value={id} onChange={(e) => setId(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">비밀번호</label>
          <input id="pw" className="inp" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <button className="btn p" style={{ width: "100%", marginTop: 20 }} disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
        {msg && <p className={s.err}>{msg}</p>}
        <p className={s.foot}>처음 받은 코드가 있나요? <Link href="/first-login">첫 로그인</Link></p>
      </form>
    </main>
  );
}
