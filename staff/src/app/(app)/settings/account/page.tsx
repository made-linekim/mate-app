"use client";
import { useCallback, useEffect, useState } from "react";
import { sb, callFn, type Staff } from "@/lib/sb";
import { HelpD, Msg, PageH, Sw, Chip, Confirm, tierName, useLead } from "../kit";
import { BRANCHES } from "@/lib/sb";

type Acc = { id: string; name: string; login_id: string; tier: string; branch: string; last_sign_in_at: string | null; status?: string };
const mask = (id: string) => (id.length <= 3 ? id[0] + "***" : `${id.slice(0, Math.min(4, id.length - 2))}-****`);
function ago(t: string | null) {
  if (!t) return "—";
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  return days === 0 ? `오늘 ${hm}` : days === 1 ? `어제 ${hm}` : `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${hm}`;
}

/* 시안 U-PC-SET-13 계정 — 대표관리자만 봐요 */
export default function AccountPage() {
  const { owner } = useLead();
  const [rows, setRows] = useState<Acc[]>([]);
  const [br, setBr] = useState("all");
  const [ask, setAsk] = useState<Acc | null>(null);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await sb.rpc("account_list");
    if (!r.error) return setRows((r.data ?? []) as Acc[]);
    // 057 전에는 최근 접속 없이 직원 목록만
    const s = await sb.from("staff_accounts").select("*").order("tier").order("name");
    setRows(((s.data ?? []) as Staff[]).map((x) => ({ id: x.id, name: x.name, login_id: x.login_id, tier: x.tier, branch: x.branch, last_sign_in_at: null, status: x.status })));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function reset() {
    if (!ask) return;
    const t = ask; setAsk(null);
    try {
      const r = await callFn<{ setup_code: string }>("staff-admin", { action: "reissue_code", staff_id: t.id });
      setCode({ name: t.name, code: r.setup_code });
    } catch (e) { setMsg((e as Error).message); }
  }

  if (!owner) return <div className="ct"><PageH title="계정" sub="전 지점 · 로그인 계정" /><div className="body"><HelpD>계정은 대표관리자만 봐요.</HelpD></div></div>;
  const shown = rows.filter((r) => r.status !== "resigned" && (br === "all" || r.branch === br || r.tier === "owner"));

  return (
    <div className="ct">
      <PageH title="계정" sub="전 지점 · 로그인 계정"><Msg text={msg} /></PageH>
      <div className="body">
        <div className="ltool"><div className="reasons">{["all", ...BRANCHES].map((b) => <Chip key={b} on={br === b} onClick={() => setBr(b)}>{b === "all" ? "전체" : b}</Chip>)}</div></div>
        <div className="v3card">
          <table className="tbl">
            <tbody>
              <tr><th>이름</th><th>아이디</th><th>역할</th><th>지점</th><th>최근 접속</th><th>2단계 인증</th><th>관리</th></tr>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td><td>{mask(a.login_id)}</td><td>{tierName(a.tier)}</td><td>{a.tier === "owner" ? "전체" : a.branch}</td>
                  <td>{ago(a.last_sign_in_at)}</td><td><Sw on={false} lock label="2단계 인증" /></td>
                  <td><button type="button" className="btn sm" onClick={() => setAsk(a)}>비밀번호 초기화</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <HelpD>아이디는 가려 보여요. 비밀번호 초기화는 기록에 남아요.</HelpD>
      </div>
      {ask && <Confirm title="비밀번호를 초기화할까요?" lines={[`${ask.name} · ${mask(ask.login_id)}`, "지금 비밀번호로는 더 들어올 수 없어요. 새 설정 코드로 비밀번호를 다시 정해요."]} ok="초기화" onOk={reset} onClose={() => setAsk(null)} />}
      {code && <Confirm title="새 설정 코드" lines={[`${code.name} 님에게 직접 알려 주세요.`, <b key="c" style={{ fontSize: 20, letterSpacing: 2 }}>{code.code}</b>, "이 코드는 다시 보이지 않아요."]} ok="확인" onOk={() => setCode(null)} onClose={() => setCode(null)} />}
    </div>
  );
}
