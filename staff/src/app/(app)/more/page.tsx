"use client";
import "./more.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, TIER_LABEL } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { BRANCHES } from "@/lib/sb";
import { useTopBranch } from "@/lib/branch";

type Day = { d: number; open: boolean; s: string; e: string };

/* 시안 MO-MORE-1 더보기 (관리자 이상) / 더보기_직원 / 로그아웃확인.
   '알림 설정'·'도움말'은 아직 화면이 없어 숨겨요 (11/21 규칙: 없는 메뉴는 보이지 않게). */
export default function MorePage() {
  const me = useMe();
  const router = useRouter();
  const lead = me.tier !== "staff";
  const [br, setBr] = useTopBranch(me);
  const [bye, setBye] = useState(false);
  const [mine, setMine] = useState(false);
  const [hours, setHours] = useState<string>("");
  useEffect(() => { if (window.matchMedia("(min-width: 768px)").matches) router.replace("/schedule"); }, [router]);
  useEffect(() => {
    if (!mine) return;
    sb.rpc("settings_get", { p_branch: me.branch }).then((r) => {
      const d = r.data as { shifts?: { name: string; label: string; s: string; e: string }[]; hours?: { days: Day[] } } | null;
      const sh = d?.shifts?.find((x) => x.name === me.name);
      if (sh) return setHours(`${sh.label} · ${sh.s} – ${sh.e}`);
      const open = (d?.hours?.days ?? []).filter((x) => x.open);
      setHours(open.length ? `지점 업무시간 ${open[0].s} – ${open[0].e}` : "—");
    });
  }, [mine, me.branch, me.name]);

  return (
    <div className="mo">
      <div className="mo-hd"><b>더보기</b><span className="sp" /><span className="br">{br}</span></div>
      <div className="mo-note">
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
        {lead ? "더보기에는 현장에서 쓰는 항목만 두었어요. 설정은 관리자 이상이 보기만 하고, 바꾸려면 PC에서 해요." : "더보기에는 현장에서 쓰는 항목만 두었어요. 설정은 PC에서 관리자가 바꿔요."}
      </div>
      <div className="mo-me"><div className="av">{me.name.slice(0, 1)}</div><div><b>{me.name}</b><span>{me.title || TIER_LABEL[me.tier]} · {me.branch}</span></div></div>
      <div className="mo-list">
        <button type="button" className="mo-row" onClick={() => setMine(true)}>내 정보 · 내 근무시간<em>열기</em></button>
        {lead && (me.tier === "owner"
          ? <label className="mo-row">지점 바꾸기<select className="mo-sel" value={br} onChange={(e) => setBr(e.target.value)} aria-label="지점 바꾸기">{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select></label>
          : <div className="mo-row" style={{ cursor: "default" }}>지점 바꾸기<em>{me.branch}</em></div>)}
        {lead && <Link className="mo-row" href="/settings">설정 보기<em>보기만</em></Link>}
      </div>
      <button type="button" className="mo-out" onClick={() => setBye(true)}>로그아웃</button>

      {bye && <>
        <div className="mo-dim" onClick={() => setBye(false)} />
        <div className="mo-sheet" role="dialog" aria-label="로그아웃 확인">
          <div className="hdl" />
          <b>로그아웃할까요?</b>
          <p>다시 들어오려면 아이디와 비밀번호가 필요해요.</p>
          <div className="acts"><button type="button" onClick={() => setBye(false)}>닫기</button><button type="button" onClick={() => sb.auth.signOut()}>로그아웃</button></div>
        </div>
      </>}
      {mine && <>
        <div className="mo-dim" onClick={() => setMine(false)} />
        <div className="mo-sheet" role="dialog" aria-label="내 정보">
          <div className="hdl" />
          <b>내 정보 · 내 근무시간</b>
          <div className="kv"><span>이름</span>{me.name}</div>
          <div className="kv"><span>직급</span>{me.title || TIER_LABEL[me.tier]}</div>
          <div className="kv"><span>지점</span>{me.branch}</div>
          <div className="kv"><span>아이디</span>{me.login_id}</div>
          <div className="kv"><span>근무시간</span>{hours || "불러오는 중"}</div>
          <p style={{ marginTop: 8 }}>바꾸려면 관리자에게 요청해 주세요.</p>
          <div className="acts" style={{ gridTemplateColumns: "1fr" }}><button type="button" onClick={() => setMine(false)}>닫기</button></div>
        </div>
      </>}
    </div>
  );
}
