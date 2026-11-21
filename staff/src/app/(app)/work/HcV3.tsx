"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import type { HcRow } from "./log-drawer";
import CareBoard, { type CareKind } from "./CareBoard";

// 해피콜 — 메라 v3 확정 시안 (U-PC-TODO-1 · S2-CALL 해피콜카드 · S2-CALL-RESULT 통화결과 · U-MO-TODO-1 · MO 통화결과)
// 목록: 이름 · 휴대전화 · 단계 · 왜 전화하는지 · 먼저 꺼낼 말 · 담당 · 전화하기/문자
// 줄 클릭 → 오른쪽 해피콜 카드 → 통화 끝 → 통화 결과(연결 · 부재 · 재방문 약속) → 토스트(되돌리기 · 예약 잡기)
// 서버: happycall_board(038) · 없으면 happycall_list. 기록: happycall_log · happycall_undo

type Kind = "norsv" | "new" | "low" | "consult" | "todo";
type Row = {
  kind: Kind; item_id: string | null; customer_key: string; branch: string; name: string | null; phone: string | null;
  membership: string | null; min_remaining: number | null; last_visit_on: string | null; registered_on: string | null;
  ends_on?: string | null;
  manager: string | null; assignee: string | null; why_a: string; why_n: string; why_b: string;
  done: boolean; result: string | null; result_note: string | null; log_id: string | null;
};
// PC 목록 추가 정보 (091 happycall_extra): 보유 회원권 · 유효기간 · 마지막 방문 · 연락 이력 1~4차
type Call = { n: number; result: string; note: string | null; at: string; by: string | null };
type Ext = { key: string; membership: string | null; min_remaining: number | null; ends_on: string | null; last_visit_on: string | null; calls: Call[] };
const callTag = (c: Call) => c.note === "재방문 약속" ? { l: "재방문 약속", c: "grn" }
  : c.result === "부재" ? { l: "부재", c: "amb" } : c.result === "거절" ? { l: "거절", c: "red" }
  : c.result === "예약완료" ? { l: "예약", c: "grn" } : c.result === "답장대기" ? { l: "답장 대기", c: "" } : { l: "통화", c: "" };
const dot = (d: string) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const kAt = (t: string) => { const k = new Date(new Date(t).getTime() + 9 * 36e5).toISOString(); return `${Number(k.slice(5, 7))}.${k.slice(8, 10)}`; };
// 해피콜 업무 카드 (대표님 11/21 시안 이미지): 지점 · 대상 · 시도 · 완료율 + 1차~4차 · 완료 · 거절 · 제외 인원
// n차 = 다음에 할 연락이 몇 번째인지 (최근 30일 연락 기록 기준, 부재·답장 대기면 다음 차수로)
type Stg = "1" | "2" | "3" | "4" | "done" | "no" | "skip";
const STGS: { k: Stg; l: string; c: string; tip: string }[] = [
  { k: "1", l: "1차", c: "y", tip: "아직 연락 안 한 고객" }, { k: "2", l: "2차", c: "y", tip: "1번 연락했고 아직 안 닿은 고객" },
  { k: "3", l: "3차", c: "y", tip: "2번 연락했고 아직 안 닿은 고객" }, { k: "4", l: "4차", c: "y", tip: "3번 넘게 연락했고 아직 안 닿은 고객" },
  { k: "done", l: "완료", c: "g", tip: "통화했거나 예약을 잡은 고객" }, { k: "no", l: "거절", c: "k", tip: "연락을 거절한 고객" },
  { k: "skip", l: "제외", c: "", tip: "현장에서 소통함 등으로 뺀 고객" },
];
// 단계 배지 (고객 단계 데이터가 생기기 전까지 해피콜 사유로 정해요)
const STAGE: Record<Kind, { l: string; c: string }> = {
  norsv: { l: "위험", c: "red" }, todo: { l: "위험", c: "red" }, low: { l: "주의", c: "amb" }, new: { l: "신규", c: "grn" }, consult: { l: "상담", c: "" },
};
// 통화 결과 3가지 → happycall_log 결과
const RESULTS = [
  { l: "연결", r: "통화완료", n: "" },
  { l: "부재", r: "부재", n: "" },
  { l: "재방문 약속", r: "통화완료", n: "재방문 약속" },
] as const;
const resLabel = (r: Row) => (r.result_note === "재방문 약속" ? "재방문 약속" : r.result === "부재" ? "부재" : r.result === "예약완료" ? "예약 잡음" : r.result ? "연결" : "");
// 받침(ㄹ 빼고)이 있으면 "으로"
const ro = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; const j = c >= 0 && c < 11172 ? c % 28 : 0; return j && j !== 8 ? "으로" : "로"; };
const nk = (r: Row) => `${r.branch}|${r.customer_key}`;
const why = (r: Row) => `${r.why_a}${r.why_n}${r.why_b}`.trim();
// 종류별로 나눠 보기 (대표님 11/21 "구분 못하나, 정신사납다"): 한 번에 한 종류만, 먼저 꺼낼 말은 종류 위에 한 번
type Grp = "risk" | "consult" | "new" | "low";
const GROUPS: { k: Grp; l: string; say: string }[] = [
  { k: "risk", l: "위험 · 다음 예약 없음", say: "요즘 방문이 뜸해서 안부가 궁금했어요. 요즘 컨디션부터 물어보세요." },
  { k: "consult", l: "상담 후 미등록", say: "상담 때 궁금해하신 점부터 다시 물어보세요." },
  { k: "new", l: "신규 등록", say: "처음 받아 보신 관리가 어땠는지부터 물어보세요." },
  { k: "low", l: "회원권 곧 끝남", say: "그동안 달라진 점부터 같이 이야기하고, 남은 횟수를 알려 드리세요." },
];
const grpOf = (r: Row): Grp => (r.kind === "norsv" || r.kind === "todo" ? "risk" : r.kind);
// 먼저 꺼낼 말 (통화 첫마디)
function opener(r: Row) {
  switch (r.kind) {
    case "new": return "처음 받아 보신 관리가 어땠는지부터 물어보세요.";
    case "low": return `남은 관리가 ${r.min_remaining ?? 0}회예요. 그동안 달라진 점부터 같이 이야기해 보세요.`;
    case "consult": return "상담 때 궁금해하신 점부터 다시 물어보세요.";
    default: return "요즘 방문이 뜸해서 안부가 궁금했어요. 요즘 컨디션부터 물어보세요.";
  }
}
const dial = (p: string | null) => { const d = (p ?? "").replace(/\D/g, ""); return d.length >= 10 && !(p ?? "").includes("*") ? d : null; };

function fromList(r: HcRow, today: string): Row {
  const days = (a: string | null) => (a ? Math.round((Date.parse(today) - Date.parse(a)) / 864e5) : null);
  const kind: Kind = r.kind === "expiring" ? "low" : r.kind === "lapsed" ? "norsv" : r.kind === "new" ? "new"
    : r.reason === "다음 예약 없음" ? "norsv" : r.reason === "상담 후 미등록" ? "consult" : "todo";
  const d = days(r.last_visit_on);
  const w: [string, string, string] =
    kind === "low" ? ["남은 횟수 ", `${r.min_remaining ?? "-"}회`, " · 재등록 안내 시점"]
    : kind === "new" ? ["등록 ", `${(days(r.registered_on) ?? 0) + 1}일째`, " · 다음 예약 없음"]
    : kind === "norsv" && d != null ? ["마지막 방문 ", `${d}일 전`, " · 다음 예약 없음"]
    : [r.reason || "해피콜 대상", "", ""];
  return {
    kind, item_id: r.item_id, customer_key: r.customer_key, branch: r.branch, name: r.name, phone: r.phone,
    membership: r.membership, min_remaining: r.min_remaining, last_visit_on: r.last_visit_on, registered_on: r.registered_on,
    ends_on: r.ends_on, manager: r.manager, assignee: r.assignee || r.manager, why_a: w[0], why_n: w[1], why_b: w[2],
    done: false, result: null, result_note: null, log_id: null,
  };
}

export default function HcV3({ branch, today, onCount, initCare = null }: { branch: string; today: string; onCount: (left: number, done: number, total: number) => void; initCare?: CareKind | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [grp, setGrp] = useState<Grp | null>(null);
  // 식단 케어 · 운동 케어 (CareBoard) — 해피콜 종류 칩 옆에 항상 보여요
  const [care, setCare] = useState<CareKind | null>(initCare);
  const [careN, setCareN] = useState<Record<CareKind, number | null>>({ diet: null, ex: null });
  useEffect(() => {
    let on = true;
    (["diet", "ex"] as const).forEach(async (k) => {
      const { data, error } = await sb.rpc("care_board", { p_branch: branch, p_kind: k });
      if (on && !error && Array.isArray(data)) setCareN((s) => ({ ...s, [k]: (data as { grp: string; done_today: boolean }[]).filter((r) => r.grp === "linked" && !r.done_today).length }));
    });
    return () => { on = false; };
  }, [branch]);
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"card" | "result">("card");
  const [sheet, setSheet] = useState<string | null>(null); // 모바일 통화 결과
  const [toast, setToast] = useState<{ row: Row; label: string; id: string | null } | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const b = await sb.rpc("happycall_board", { p_branch: branch });
    if (!b.error && Array.isArray(b.data)) { setLegacy(false); setErr(""); setRows(b.data as Row[]); return; }
    const l = await sb.rpc("happycall_list", { p_branch: branch });
    if (l.error || !Array.isArray(l.data)) { setErr(l.error?.message.includes("NO_PERMISSION") ? "해피콜 권한이 없어요." : "해피콜을 불러오지 못했어요."); setRows([]); return; }
    setLegacy(true); setErr("");
    const seen = new Set<string>();
    setRows((l.data as HcRow[]).map((r) => fromList(r, today)).filter((r) => (seen.has(nk(r)) ? false : (seen.add(nk(r)), true))));
  }, [branch, today]);
  useEffect(() => { setRows(null); setSel(null); load(); }, [load]);
  // PC 목록: 고객별 회원권·유효기간·연락 이력 (091 없으면 빈 칸, 목록은 그대로)
  const [ext, setExt] = useState<Map<string, Ext>>(new Map());
  const keysSig = useMemo(() => [...new Set((rows ?? []).map((r) => r.customer_key))].sort().join("|"), [rows]);
  const loadExt = useCallback(async () => {
    const keys = keysSig ? keysSig.split("|").slice(0, 500) : [];
    if (!keys.length) return setExt(new Map());
    const { data, error } = await sb.rpc("happycall_extra", { p_branch: branch, p_keys: keys });
    if (!error && Array.isArray(data)) setExt(new Map((data as Ext[]).map((x) => [x.key, x])));
  }, [branch, keysSig]);
  useEffect(() => { loadExt(); }, [loadExt]);

  const [stg, setStg] = useState<Stg | null>(null);
  const since = useMemo(() => new Date(Date.parse(today) - 30 * 864e5).toISOString(), [today]);
  const stageOf = useCallback((r: Row): Stg => {
    if (r.done && r.result === "해당없음") return "skip";
    const cs = (ext.get(r.customer_key)?.calls ?? []).filter((c) => c.at >= since);
    const last = r.done ? { result: r.result ?? "", note: r.result_note } : cs[cs.length - 1];
    if (last?.result === "거절") return "no";
    if (last && (last.result === "통화완료" || last.result === "예약완료")) return "done";
    const tried = Math.max(cs.length, r.done ? 1 : 0);
    return String(Math.min(tried + 1, 4)) as Stg;
  }, [ext, since]);
  const all = useMemo(() => (rows ?? []).filter((r) => !(r.done && r.result === "해당없음")), [rows]);
  const doneN = all.filter((r) => r.done).length;
  useEffect(() => { if (rows) onCount(all.length - doneN, doneN, all.length); }, [rows, all.length, doneN, onCount]);
  const staff = useMemo(() => [...new Set(all.map((r) => r.assignee).filter(Boolean) as string[])].sort(), [all]);
  const base = (rows ?? []).filter((r) => (!who || r.assignee === who) && (!q.trim() || `${r.name ?? ""} ${r.assignee ?? ""}`.includes(q.trim())));
  const fun = useMemo(() => {
    const m: Record<Stg, number> = { 1: 0, 2: 0, 3: 0, 4: 0, done: 0, no: 0, skip: 0 };
    let tried = 0;
    base.forEach((r) => { const k = stageOf(r); m[k]++; if (k !== "1" && k !== "skip") tried++; });
    const tot = base.length - m.skip;
    return { m, tot, tried, rate: tot ? Math.round((m.done / tot) * 100) : 0 };
  }, [base, stageOf]);
  const found = base.filter((r) => (stg ? stageOf(r) === stg : !(r.done && r.result === "해당없음")));
  const cnt = (k: Grp) => found.filter((r) => grpOf(r) === k && !r.done).length;
  const shownG = GROUPS.filter((g) => found.some((r) => grpOf(r) === g.k));
  const g = shownG.find((x) => x.k === grp) ?? shownG[0] ?? null;
  // 남은 사람 먼저, 그 안에서 최근에 왔던 고객부터 (오래전 고객은 아래로)
  const list = found.filter((r) => g && grpOf(r) === g.k)
    .sort((a, b) => Number(a.done) - Number(b.done) || (b.last_visit_on ?? "").localeCompare(a.last_visit_on ?? ""));
  const cur = sel ? all.find((r) => nk(r) === sel) ?? null : null;
  const sheetRow = sheet ? all.find((r) => nk(r) === sheet) ?? null : null;

  const mark = (key: string, patch: Partial<Row>) => setRows((rs) => (rs ?? []).map((r) => (nk(r) === key ? { ...r, ...patch } : r)));
  const kindFor = (r: Row) => {
    const k0 = r.kind === "todo" ? "norsv" : r.kind;
    return legacy ? (k0 === "low" ? "expiring" : k0 === "norsv" || k0 === "consult" ? "lapsed" : k0) : k0;
  };
  const record = async (r: Row, res: (typeof RESULTS)[number]) => {
    setErr("");
    const { data, error } = await sb.rpc("happycall_log", {
      p_item: r.item_id, p_customer_key: r.customer_key, p_branch: r.branch, p_kind: kindFor(r), p_result: res.r, p_note: res.n, p_follow_day: null,
    });
    if (error) {
      setErr(error.message.includes("NO_PERMISSION") ? "해피콜 기록 권한이 없어요." : error.message.includes("BAD_") ? "서버 업데이트(038)가 아직이에요. 결과가 저장되지 않았어요." : "저장하지 못했어요. 다시 눌러 주세요.");
      return;
    }
    const id = (data as string | null) ?? null;
    mark(nk(r), { done: true, result: res.r, result_note: res.n, log_id: id });
    loadExt();
    setSel(null); setSheet(null); setMode("card");
    setToast({ row: r, label: res.l, id });
    if (tt.current) clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(null), 8000);
  };
  const undo = async () => {
    if (!toast) return;
    const t = toast; setToast(null);
    if (t.id) { const { error } = await sb.rpc("happycall_undo", { p_id: t.id }); if (error) return setErr("되돌리지 못했어요."); }
    mark(nk(t.row), { done: false, result: null, result_note: null, log_id: null });
    loadExt();
  };
  const book = (r: Row) => {
    try { sessionStorage.setItem("rsv:prefill", JSON.stringify({ customer_key: r.customer_key, customer_name: r.name ?? "" })); } catch { /* 저장소 없음 */ }
    router.push("/schedule?new=1");
  };
  const open = (r: Row) => { setSel(nk(r)); setMode("card"); };
  const Call = ({ r, cls }: { r: Row; cls: string }) => {
    const d = dial(r.phone);
    return d ? <a className={cls} href={`tel:${d}`} onClick={(e) => e.stopPropagation()}>전화하기</a>
      : <button className={cls} disabled title="전화번호를 볼 수 있는 권한이 있어야 바로 걸 수 있어요" onClick={(e) => e.stopPropagation()}>전화하기</button>;
  };
  const Sms = ({ r }: { r: Row }) => {
    const d = dial(r.phone);
    const ic = <svg className="i" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    return d ? <a className="btn3 sm" href={`sms:${d}`} onClick={(e) => e.stopPropagation()}>{ic}문자</a>
      : <button className="btn3 sm" disabled onClick={(e) => e.stopPropagation()}>{ic}문자</button>;
  };
  const Info = ({ r, wide }: { r: Row; wide: boolean }) => {
    const x = ext.get(r.customer_key);
    const ms = x ? x.membership : r.membership, left = x ? x.min_remaining : r.min_remaining;
    const ends = x ? x.ends_on : r.ends_on ?? null, last = x ? x.last_visit_on : r.last_visit_on;
    const ago = last ? Math.round((Date.parse(today) - Date.parse(last)) / 864e5) : null;
    const endLeft = ends ? Math.round((Date.parse(ends) - Date.parse(today)) / 864e5) : null;
    return (
      <>
        <td className="ms">{ms ? <><b>{ms}</b>{left != null && <span className={`left num${left <= 2 ? " low" : ""}`}>남은 {left}회</span>}</> : <span className="nil">없음</span>}</td>
        {wide && <td className="num">{ends ? <>{dot(ends)}{endLeft != null && endLeft >= 0 && endLeft <= 30 && <span className="soon"> · {endLeft}일 남음</span>}{endLeft != null && endLeft < 0 && <span className="soon"> · 지남</span>}</> : <span className="nil">-</span>}</td>}
        <td className="num">{last ? <>{dot(last)} <span className={`ago${ago != null && ago >= 30 ? " far" : ""}`}>{ago}일 전</span></> : <span className="nil">방문 없음</span>}</td>
        <td className="calls">{x && x.calls.length ? x.calls.map((c) => { const t = callTag(c); return <span key={c.n} className={`ctag ${t.c}`} title={`${kAt(c.at)} ${c.by ?? ""}${c.note && c.note !== "재방문 약속" ? ` · ${c.note}` : ""}`}><i className="num">{c.n}차</i>{t.l}</span>; }) : <span className="nil">{x ? "처음" : "-"}</span>}</td>
      </>
    );
  };
  const Stage = ({ r }: { r: Row }) => <span className={`bdg ${STAGE[r.kind].c}`}>{STAGE[r.kind].l}</span>;
  const Res = ({ r }: { r: Row }) => (r.done ? <span className="bdg">{resLabel(r)}</span> : null);

  const CARE: { k: CareKind; l: string }[] = [{ k: "diet", l: "식단 케어" }, { k: "ex", l: "운동 케어" }];
  const chips = (
    <div className="hv3-grp" role="tablist" aria-label="해피콜 종류">
      {!care && shownG.length === 0 && rows && <span className="hv3-none">전화 해피콜 대상 없음</span>}
      {shownG.map((x) => (
        <button key={x.k} role="tab" aria-selected={!care && g?.k === x.k} className={!care && g?.k === x.k ? "on" : ""} onClick={() => { setCare(null); setGrp(x.k); setSel(null); }}>
          {x.l}<span className="num">{cnt(x.k)}</span>
        </button>
      ))}
      {CARE.map((x) => (
        <button key={x.k} role="tab" aria-selected={care === x.k} className={`care${care === x.k ? " on" : ""}`} onClick={() => { setCare(x.k); setSel(null); }}>
          {x.l}<span className="num">{careN[x.k] ?? "-"}</span>
        </button>
      ))}
    </div>
  );
  if (care) return (
    <div className="hv3-carewrap">
      <div className="hv3-carechips">{chips}</div>
      <CareBoard key={care} kind={care} branch={branch} today={today} onCount={(n) => setCareN((s) => ({ ...s, [care]: n }))} />
    </div>
  );

  return (
    <div className={`hv3${cur ? " open" : ""}`}>
      <div className="hv3-left">
        {err && <p className="wv3-err">{err}</p>}
        <div className="hv3-tool">
          <input className="inp3" placeholder="이름 · 담당" value={q} onChange={(e) => setQ(e.target.value)} aria-label="이름 · 담당 찾기" />
          <select className="hv3-sel" value={who} onChange={(e) => setWho(e.target.value)} aria-label="담당자">
            <option value="">담당자 전체</option>
            {staff.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn3 r" onClick={() => router.push("/customers")}>연락할 고객</button>
        </div>
        <div className="hv3-body">
        {!cur && (
          <aside className="card hv3-fun" aria-label="해피콜 업무">
            <div className="fh"><i>{branch.slice(0, 1)}</i><b>{branch}</b><span>{who || "담당 전체"}</span><em className="num">{fun.tot}명</em></div>
            <div className="fs"><span>시도 <b className="num">{fun.tried}</b></span><span>완료율 <b className="num">{fun.rate}%</b></span></div>
            <div className="bar"><i style={{ width: `${fun.rate}%` }} /></div>
            <div className="fl">
              {STGS.map((x) => (
                <button key={x.k} className={stg === x.k ? "on" : ""} title={x.tip} onClick={() => { setStg(stg === x.k ? null : x.k); setSel(null); }}>
                  <span className={`st ${x.c}`}>{x.l}</span><b className="num">{fun.m[x.k]}</b><svg className="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ))}
            </div>
            {stg && <button className="clr" onClick={() => setStg(null)}>단계 거르기 풀기</button>}
          </aside>
        )}
        <div className="hv3-main">
        {chips}
        {g && <div className="hv3-say"><b>먼저 꺼낼 말</b><span>{g.say}</span></div>}
        <section className="card hv3-tbl">
          {list.length === 0 ? <p className="wv3-empty">{rows ? "오늘 연락할 고객이 없어요." : "불러오는 중이에요."}</p> : (
            <table>
              <thead><tr>
                <th>이름</th>{!cur && <th>휴대전화</th>}<th>보유 회원권</th>{!cur && <th>유효기간</th>}<th>마지막 방문</th><th>연락 이력</th><th>담당</th>{!cur && <th />}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={nk(r)} className={sel === nk(r) ? "on" : ""} onClick={() => open(r)}>
                    <td><b>{r.name ?? "-"}</b> <Res r={r} /></td>
                    {!cur && <td className="num">{r.phone ?? "-"}</td>}
                    <Info r={r} wide={!cur} />
                    <td>{r.assignee ?? "-"}</td>
                    {!cur && <td className="act"><Call r={r} cls="btn3 sm" /><Sms r={r} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        </div>
        </div>
        {/* 모바일 카드 (U-MO-TODO-1) */}
        <div className="hv3-cards">
          {list.length === 0 && <section className="card"><p className="wv3-empty">{rows ? "오늘 연락할 고객이 없어요." : "불러오는 중이에요."}</p></section>}
          {list.map((r) => (
            <section key={nk(r)} className="card hv3-mc">
              <div className="h"><b>{r.name ?? "-"}</b><Stage r={r} />{r.done && <span className="bdg g">{resLabel(r)}</span>}</div>
              <div className="w">왜 · {why(r)}</div>
              <div className="m">담당 {r.assignee ?? "-"}{r.phone ? ` · ${r.phone}` : ""}</div>
              {!r.done && <div className="a"><Call r={r} cls="btn3" /><button className="btn3" onClick={() => setSheet(nk(r))}>통화 결과</button></div>}
            </section>
          ))}
        </div>
      </div>

      {cur && (
        <aside className="hv3-panel">
          <div className="ph"><h2>{mode === "card" ? "해피콜" : "통화 결과"}</h2><Stage r={cur} /><button className="x" onClick={() => setSel(null)}>닫기</button></div>
          <div className="pb">
            <div className="who"><h3>{cur.name ?? "-"}</h3><p>{[cur.phone, cur.assignee ? `담당 ${cur.assignee}` : ""].filter(Boolean).join(" · ")}</p></div>
            {mode === "card" ? (
              <>
                <div className="box"><label>왜 전화하는지</label><p>{why(cur)}</p></div>
                <div className="box"><label>먼저 꺼낼 말</label><p>{opener(cur)}</p></div>
                {(ext.get(cur.customer_key)?.calls.length ?? 0) > 0 && (
                  <div className="box"><label>연락 이력</label>
                    {ext.get(cur.customer_key)!.calls.map((c) => { const t = callTag(c); return <p key={c.n} className="hist"><span className={`ctag ${t.c}`}><i className="num">{c.n}차</i>{t.l}</span><span className="num">{kAt(c.at)} · {c.by ?? "직원"}{c.note && c.note !== "재방문 약속" ? ` · ${c.note}` : ""}</span></p>; })}
                  </div>
                )}
                <div className="help">통화가 끝나면 아래에서 결과를 남겨요. 고객 앱에는 이 카드가 보이지 않아요.</div>
              </>
            ) : (
              <div className="fld"><label>결과</label>
                <div className="hv3-res">{RESULTS.map((x) => <button key={x.l} onClick={() => record(cur, x)}>{x.l}</button>)}</div>
              </div>
            )}
          </div>
          <div className="pf">
            <button className="btn3" onClick={() => (mode === "result" ? setMode("card") : setSel(null))}>뒤로 가기</button>
            {mode === "card"
              ? <button className="btn3 p r" onClick={() => setMode("result")}>통화 끝</button>
              : <button className="btn3 ghost" onClick={() => router.push(`/customers/chart?b=${encodeURIComponent(cur.branch)}&k=${encodeURIComponent(cur.customer_key)}`)}>고객 차트 열기</button>}
          </div>
        </aside>
      )}

      {sheetRow && (
        <>
          <div className="wv3-dim" onClick={() => setSheet(null)} />
          <div className="wv3-sheet hv3-sheet" role="dialog" aria-label="통화 결과">
            <i className="grab" />
            <div className="ph"><h2>통화 결과</h2><Stage r={sheetRow} /><button className="x" onClick={() => setSheet(null)}>닫기</button></div>
            <div className="pb">
              <div className="who"><b>{sheetRow.name ?? "-"}</b>{sheetRow.phone ? ` · ${sheetRow.phone}` : ""}</div>
              <div className="fld"><label>결과</label>
                <div className="hv3-res">{RESULTS.map((x) => <button key={x.l} onClick={() => record(sheetRow, x)}>{x.l}</button>)}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="wv3-toast hv3-toast" role="status">
          <span>{toast.row.name ?? "고객"}을 {toast.label}{ro(toast.label)} 남겼어요.</span>
          <button onClick={undo}>되돌리기</button>
          <button className="bk" onClick={() => book(toast.row)}>예약 잡기</button>
        </div>
      )}
    </div>
  );
}
