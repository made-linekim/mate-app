"use client";
import { useRouter } from "next/navigation";
import { Modal, useMk, useRpc, md } from "./ui";

/* 예약 문자함 (이달의 추천 머리줄 버튼). 시안에 목록 화면은 없어 확인 창 형태로 보여 주고,
   한 건을 누르면 시안 U-PC-MKT-4-DONE '발송 예약됨' 화면(/marketing/sms?r=…)으로 가요. */
export type Rsv = { id: string; branch: string; audience: string; body: string; count: number; at: string; made_at: string; by: string | null; by_tier?: "owner" | "manager" | "staff" | null;
  pick_title: string | null; canceled_at: string | null; canceled_by: string | null; can_cancel: boolean };
export const kst = (t: string) => new Date(new Date(t).getTime() + 9 * 3600e3).toISOString();
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export const atText = (t: string) => { const d = kst(t); return `${md(d.slice(0, 10))} (${DOW[new Date(d.slice(0, 10) + "T00:00:00Z").getUTCDay()]}) ${d.slice(11, 16)}`; };

export function Reserved({ onClose }: { onClose: () => void }) {
  const { branch } = useMk();
  const router = useRouter();
  const { data, err } = useRpc<Rsv[]>("mkt_sms_reserved_list", { p_branch: branch });
  const list = (data ?? []).filter((r) => !r.canceled_at);
  return (
    <Modal title="예약 문자함" wide onClose={onClose} foot={<button className="btn" onClick={onClose}>닫기</button>}>
      {err ? <p className="help">{err === "NEED_SQL" ? "예약 문자함은 062 SQL을 실행하면 보여요." : err}</p>
        : !data ? <p className="help">불러오는 중…</p>
        : list.length === 0 ? <p className="help">보내기를 기다리는 예약 문자가 없어요.</p>
        : (
          <div className="mx-rlist">
            {list.map((r) => (
              <button key={r.id} className="mx-ritem" onClick={() => { onClose(); router.push(`/marketing/sms?r=${r.id}`); }}>
                <b>{atText(r.at)}</b>
                <span>{r.pick_title ?? "문자"} · {r.count.toLocaleString()}명</span>
                <small>{r.body}</small>
              </button>
            ))}
          </div>
        )}
    </Modal>
  );
}
