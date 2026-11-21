"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { KIND_LABEL, canDecide, decider, friendlyErr, ReasonPick, type Kind } from "@/lib/approval";
import "./approval.css";

/* 시안 U-PC-TODO-3-PAY (승인 대기 · 승인 확인 · 완료 · 본인 요청) + U-PC-RSV-5 노쇼 확인.
   오늘 할 일 '승인 대기' 탭에 그대로 넣어 쓰는 판이에요. 고객앱 쪽(챌린지 인증·식단 확인·회원 연결)은 고객앱 연결 후 칩이 더해져요. */
type Req = {
  id: string; branch: string; kind: Kind; target_type: string; target_id: string; payload: Record<string, unknown> & { customer?: string; when?: string; program?: string; deduct?: boolean };
  amount: number | null; reason: string; status: "대기" | "승인" | "반려" | "취소" | "바로 처리";
  requested_by: string; requested_name: string; requested_at: string; decided_name: string | null; decided_at: string | null; decide_note: string;
};
const GROUPS: { k: string; l: string; kinds: Kind[] }[] = [
  { k: "pay", l: "결제·환불", kinds: ["pay_cancel", "refund", "membership_adjust"] },
  { k: "rsv", l: "노쇼·취소", kinds: ["rsv_noshow", "rsv_cancel", "rsv_naver_reject"] },
  { k: "money", l: "지출·정산", kinds: ["expense", "receivable_settle"] },
  { k: "set", l: "권한·설정", kinds: ["perm_change", "setting_change"] },
];
const STATUS = ["대기", "처리 완료", "전체"] as const;
const won = (n: number | null) => (n == null ? "" : `${n.toLocaleString()}원`);
const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso), k = new Date(d.getTime() + 9 * 3600e3), t = new Date(Date.now() + 9 * 3600e3);
  const hm = k.toISOString().slice(11, 16);
  return k.toISOString().slice(0, 10) === t.toISOString().slice(0, 10) ? `오늘 ${hm}` : `${+k.toISOString().slice(5, 7)}.${k.toISOString().slice(8, 10)} ${hm}`;
};
const what = (r: Req) =>
  r.amount != null ? won(r.amount)
  : r.kind === "rsv_noshow" ? (r.payload.deduct ? "1회 차감" : "기록만")
  : r.kind === "rsv_cancel" ? "예약 취소" : "";
const badge = (s: Req["status"]) => (s === "대기" ? "warn" : s === "반려" ? "em" : s === "취소" ? "" : "ok");

export default function ApprovalBoard({ branch }: { branch: string | null }) {
  const me = useMe();
  const [rows, setRows] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [st, setSt] = useState<(typeof STATUS)[number]>("대기");
  const [grp, setGrp] = useState<string | null>(null);
  const [open, setOpen] = useState<Req | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("approval_list", { p_branch: branch, p_status: null });
    if (error) { setErr(/approval_list|Could not find|does not exist/i.test(error.message) ? "NEED_SQL" : friendlyErr(error.message)); setRows([]); return; }
    setErr(""); setRows((data ?? []) as Req[]);
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const base = (rows ?? []).filter((r) => st === "전체" || (st === "대기" ? r.status === "대기" : r.status !== "대기"))
    .filter((r) => !q || `${r.payload.customer ?? ""} ${KIND_LABEL[r.kind]} ${r.requested_name}`.includes(q.trim()));
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.k, base.filter((r) => g.kinds.includes(r.kind)).length])), [base]);
  const list = base.filter((r) => !grp || GROUPS.find((g) => g.k === grp)!.kinds.includes(r.kind));

  if (err === "NEED_SQL") return <div className="ap-empty">요청·승인 기능이 아직 서버에 없어요. 대표관리자가 070 요청승인 SQL을 실행하면 바로 보여요.</div>;

  return (
    <div className={`ap-board ${open ? "with" : ""}`}>
      <div className="ap-main">
        <div className="ap-tools">
          <input className="inp ap-q" placeholder="이름 · 종류" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="sel ap-st" aria-label="상태" value={st} onChange={(e) => setSt(e.target.value as typeof st)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="ap-groups">
          {GROUPS.map((g) => (
            <button key={g.k} className={grp === g.k ? "on" : ""} onClick={() => setGrp(grp === g.k ? null : g.k)}>{g.l} <b>{counts[g.k]}</b></button>
          ))}
        </div>
        <div className="ap-tbl">
          <table className="t">
            <thead><tr><th>종류</th><th>고객 · 대상</th><th className="r">금액 · 내용</th><th>요청한 사람</th><th>시각</th><th>상태</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={open?.id === r.id ? "sel" : ""} onClick={() => setOpen(r)}>
                  <td data-label="종류">{KIND_LABEL[r.kind]}</td>
                  <td data-label="고객"><b>{r.payload.customer || "—"}</b>{r.payload.when && <small> {String(r.payload.when)}</small>}</td>
                  <td data-label="내용" className="r num">{what(r)}</td>
                  <td data-label="요청">{r.requested_name}{r.requested_by === me.id ? " (나)" : ""}</td>
                  <td data-label="시각" className="num">{when(r.requested_at)}</td>
                  <td data-label="상태"><span className={`badge ${badge(r.status)}`}>{r.status}</span></td>
                </tr>
              ))}
              {rows && list.length === 0 && <tr><td colSpan={6} className="ap-none">{st === "대기" ? "기다리는 요청이 없어요" : "요청이 없어요"}</td></tr>}
              {!rows && <tr><td colSpan={6} className="ap-none">불러오는 중…</td></tr>}
            </tbody>
          </table>
        </div>
        {err && <p className="ap-err">{err}</p>}
      </div>
      {open && <Detail r={open} me={me} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function Detail({ r, me, onClose, onDone }: { r: Req; me: ReturnType<typeof useMe>; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [ask, setAsk] = useState<null | "ok" | "no">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = r.requested_by === me.id;
  const can = r.status === "대기" && canDecide(me, r.kind, r.amount) && (!mine || me.tier === "owner");
  const decide = async (ok: boolean) => {
    if (!ok && !note) return setErr("거절 사유를 골라 주세요.");
    setBusy(true); setErr("");
    const { error } = await sb.rpc("approval_decide", { p_id: r.id, p_ok: ok, p_note: note });
    setBusy(false);
    if (error) return setErr(friendlyErr(error.message));
    onDone();
  };
  const cancel = async () => {
    setBusy(true);
    const { error } = await sb.rpc("approval_cancel", { p_id: r.id });
    setBusy(false);
    if (error) return setErr(friendlyErr(error.message));
    onDone();
  };
  const effect: Partial<Record<Kind, string>> = {
    rsv_noshow: r.payload.deduct ? "예약이 노쇼로 바뀌고 회원권 1회가 차감돼요. 되돌릴 수 없어요." : "예약이 노쇼로 바뀌어요. 회원권은 차감하지 않아요.",
    rsv_cancel: "예약이 취소돼요.",
    pay_cancel: "결제가 취소돼요. 차감한 회차를 되돌리고 매출을 지워요.",
    expense: "지출 장부에 요청한 직원 이름으로 들어가요.",
  };
  return (
    <aside className="ap-side">
      <header><h3>{KIND_LABEL[r.kind]} 요청 <span className={`badge ${badge(r.status)}`}>{r.status}</span></h3><button className="btn sm" onClick={onClose}>닫기</button></header>
      <div className="ap-sb">
        <dl>
          <dt>고객 · 대상</dt><dd>{r.payload.customer || "—"}{r.payload.when ? ` · ${r.payload.when}` : ""}{r.payload.program ? ` · ${r.payload.program}` : ""} · {r.branch}</dd>
          {what(r) && <><dt>금액 · 조정</dt><dd className="ap-big num">{what(r)}</dd></>}
          <dt>사유</dt><dd>{r.reason || "—"}</dd>
        </dl>
        <dl className="ap-box">
          <dt>요청한 사람</dt><dd>{r.requested_name} · {r.branch}</dd>
          <dt>{r.status === "반려" ? "거절한 사람" : "승인한 사람"}</dt><dd>{r.decided_name ?? `아직 없음 · ${decider(r.kind, r.amount)}가 처리해요`}</dd>
          <dt>시각</dt><dd>{when(r.requested_at)} 요청{r.decided_at ? ` · ${when(r.decided_at)} ${r.status}` : ""}</dd>
          {r.decide_note && <><dt>거절 사유</dt><dd>{r.decide_note}</dd></>}
        </dl>
        {can && (
          <>
            <div className="ap-l">거절 사유 (거절할 때만)</div>
            <ReasonPick options={["사유가 부족해요", "금액을 다시 확인해 주세요", "고객과 다시 상담해 주세요"]} value={note} onChange={setNote} />
          </>
        )}
        {ask && (
          <div className="ap-confirm">
            <b>{ask === "ok" ? "승인할까요?" : "거절할까요?"}</b>
            <p>{ask === "ok" ? (effect[r.kind] ?? "승인 기록이 남아요. 반영은 해당 화면에서 해요.") : "요청한 사람에게 거절 사유와 함께 보여요."}</p>
            <div className="ap-ft"><button className="btn sm" onClick={() => setAsk(null)}>닫기</button><button className="btn sm danger" disabled={busy} onClick={() => decide(ask === "ok")}>{ask === "ok" ? "승인" : "거절"}</button></div>
          </div>
        )}
        {err && <p className="ap-err">{err}</p>}
      </div>
      <footer>
        {can && !ask && <><button className="btn" onClick={() => setAsk("no")}>거절</button><div style={{ flex: 1 }} /><button className="btn p" onClick={() => setAsk("ok")}>승인</button></>}
        {mine && r.status === "대기" && !can && <><div style={{ flex: 1 }} /><button className="btn" disabled={busy} onClick={cancel}>요청 취소</button></>}
      </footer>
    </aside>
  );
}
