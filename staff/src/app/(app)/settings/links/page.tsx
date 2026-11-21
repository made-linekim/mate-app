"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { HelpD, PageH, V3i, useBranch, useLead } from "../kit";
import type { ConnRow } from "../defaults";

/* 채널 설명 (시안 U-PC-SET-18 연결) */
const DESC: Record<string, string> = {
  메타: "광고 성과 수집", "네이버 검색광고": "광고 성과 수집", 인스타그램: "게시물 수집", "네이버 블로그": "공개 글 수 수집 · 공식 글쓰기 API 없음",
  "네이버 검색": "키워드 순위 · API HUB", OpenAI: "해피콜 문구 다듬기 · 선택", "뷰티사랑넷 엑셀": "예약·회원권 반영 · import 키", 당근: "공식 API 없음",
};
const when = (t: string | null) => {
  if (!t) return null;
  const d = new Date(t); const today = new Date().toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return today ? `오늘 ${hm}` : `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${hm}`;
};

/* 시안 U-PC-SET-18 연결. 상태는 057 conn_status (키는 끝 네 자리만). 다시 연결은 키를 넣는 곳(Supabase 비밀값)에서 해요. */
export default function LinksPage() {
  const { branch, pick, owner } = useBranch(true);
  const { lead } = useLead();
  const [rows, setRows] = useState<ConnRow[] | null>(null);
  useEffect(() => { sb.rpc("conn_status", { p_branch: branch === "all" ? null : branch }).then((r) => setRows((r.data ?? []) as ConnRow[])); }, [branch]);
  if (!lead) return <div className="ct p32"><PageH title="연결" sub="광고 · 채널 연결" /><div className="body"><HelpD>연결은 대표관리자와 관리자만 봐요.</HelpD></div></div>;

  return (
    <div className="ct p32">
      <PageH title="연결" sub={`설정 › 운영 › 연결 · ${branch === "all" ? "전 지점" : branch}`} />
      {pick}
      <div className="ltool">
        <div className="note"><V3i n="info" />연결 상태는 대표관리자와 관리자만 봐요. 키 값은 끝 네 자리만 보이며, 전체 키는 이 화면에 없어요.</div>
        {owner && <div className="note"><V3i n="info" />대표관리자는 지점 고르기로 전 지점을 봐요.</div>}
      </div>
      <div className="body">
        <div className="conn">
          {(rows ?? []).map((c) => c.manual ? (
            <div key={c.channel} className="crow2">
              <div><div className="cn">{c.channel}</div><div className="cd">{DESC[c.channel] ?? ""}</div></div>
              <div><div className="cd">키와 다시 연결은 없어요. 광고비는 마케팅 › 광고에서 직접 입력해요.</div></div>
              <div className="actions"><span className="badge line">직접 입력 · API 없음</span></div>
            </div>
          ) : (
            <div key={c.channel} className="crow2">
              <div><div className="cn">{c.channel}</div><div className="cd">{DESC[c.channel] ?? ""}</div></div>
              <div>
                {c.key_tail ? <div className="kmask">•••••••• {c.key_tail}</div> : <div className="cd">키 없음</div>}
                <div className="cd">{when(c.last_at) ? `마지막 수집 ${when(c.last_at)}` : "수집 기록 없음"}</div>
              </div>
              <div className="actions"><span className={`badge ${c.connected ? "ok" : ""}`}>{c.connected ? "연결됨" : "연결 안 됨"}</span></div>
            </div>
          ))}
          {rows && rows.length === 0 && <HelpD>연결 정보를 불러오지 못했어요.</HelpD>}
        </div>
      </div>
    </div>
  );
}
