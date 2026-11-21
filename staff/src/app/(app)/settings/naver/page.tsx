"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { Card, Help, HelpD, Msg, ORow, PageH, Sw, UseR, useBranch, useLead, useSettings, val } from "../kit";
import { NAVER0, type Naver } from "../defaults";

type Conn = { connected: boolean; key_tail: string | null; last_at: string | null; products: string[] };
type G = { id: string; name: string; active: boolean };

/* 시안 U-PC-SET-06 네이버 예약 연동. 연결 정보는 057 naver_status 에서 와요 (아직 연결 전이면 '연결 안 됨'). */
export default function NaverPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const { data, save } = useSettings(branch);
  const orig = val(data, "naver", NAVER0);
  const [v, setV] = useState<Naver>(NAVER0);
  const [conn, setConn] = useState<Conn | null>(null);
  const [progs, setProgs] = useState<G[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { setV(val(data, "naver", NAVER0)); }, [data]);
  useEffect(() => {
    sb.rpc("naver_status", { p_branch: branch }).then((r) => setConn((r.data as Conn) ?? null));
    sb.rpc("program_admin_list").then((r) => setProgs(((r.data ?? []) as G[]).filter((g) => g.active)));
  }, [branch]);
  const edit = lead && !!data?.can_edit;
  const dirty = JSON.stringify(v) !== JSON.stringify(orig);
  async function onSave() { setMsg(await save("naver", v, "네이버 예약 설정을 바꿨어요.") || "저장했어요"); }
  const last = conn?.last_at ? new Date(conn.last_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : null;

  return (
    <div className="ct">
      <PageH title="네이버 예약 연동" sub={`${branch} · 연결과 상품 매칭`}>
        <Msg text={msg} />
        {edit && <button className="btn p" onClick={onSave} disabled={!dirty}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        <Card title="연결 상태">
          <ORow n={1} label="상태">
            <span className={`badge ${conn?.connected ? "ok" : ""}`}>{conn?.connected ? "연결됨" : "연결 안 됨"}</span>
            <Help>{last ? `마지막 가져오기 ${last}` : "가져온 적 없어요"}</Help>
          </ORow>
          <ORow n={2} label="연동 키">
            <Help>{conn?.key_tail ? `•••••••• ${conn.key_tail}` : "없음"}</Help>
            <Help>끝 네 자리만 보여요.</Help>
          </ORow>
          <ORow n={3} label="자동 가져오기">
            {edit ? <UseR on={v.auto} onChange={(x) => setV({ ...v, auto: x })} label="자동 가져오기" /> : <Sw on={v.auto} lock />}
            <Help>새로 들어온 예약을 현황 보드에 넣어요.</Help>
          </ORow>
          <ORow n={4} label="취소 반영"><Help>바로 반영 · 거절할 수 없어요</Help></ORow>
          <HelpD>취소된 시간은 다시 예약할 수 있어요.</HelpD>
        </Card>
        <Card title="네이버 상품 ↔ MERA 관리">
          <table className="tbl">
            <tbody>
              <tr><th>네이버 상품</th><th>MERA 관리</th></tr>
              {(conn?.products ?? []).map((n) => (
                <tr key={n}><td>{n}</td><td>
                  {edit ? <select className="sel sm" value={v.map[n] ?? ""} onChange={(e) => setV({ ...v, map: { ...v.map, [n]: e.target.value } })} aria-label={`${n} 매칭`}>
                    <option value="">고르기</option>{progs.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select> : <span className="sel sm off">{v.map[n] || "—"}</span>}
                </td></tr>
              ))}
              {!conn?.products?.length && <tr><td colSpan={2}>연결하면 네이버 상품이 여기에 보여요</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
