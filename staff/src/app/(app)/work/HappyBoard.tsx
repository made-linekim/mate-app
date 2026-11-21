"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import type { HcRow } from "./log-drawer";
import "./hc.css";

// 해피콜 (시안_헬보기능 call.html / call_m.html, 11/20 승인)
// 고객 한 명당 두 번: ① 문구 복사하고 카카오 열기 ② 결과 한 번 → 다음 고객
// 서버: happycall_board (038). 아직 없으면 happycall_list 로 대신 보여 줘요.

export type Kind = "norsv" | "new" | "low" | "consult" | "todo";
export type Board = {
  kind: Kind; item_id: string | null; customer_key: string; branch: string; name: string | null; phone: string | null;
  membership: string | null; min_remaining: number | null; last_visit_on: string | null; registered_on: string | null; next_rsv: string | null;
  manager: string | null; assignee: string | null; why_a: string; why_n: string; why_b: string;
  tags: string | null; ad_consent: string | null; kakao_url: string | null;
  done: boolean; result: string | null; result_note: string | null; log_id: string | null;
};

const CARDS: { k: Kind | "all"; l: string; s: string }[] = [
  { k: "all", l: "오늘 연락 전체", s: "" },
  { k: "norsv", l: "다음 예약 없음", s: "마지막 이용 뒤 7일+" },
  { k: "new", l: "신규 2주", s: "등록 뒤 첫 2주" },
  { k: "low", l: "잔여 적음", s: "3회 이하 남음" },
  { k: "consult", l: "상담 후 미등록", s: "상담만 하고 이탈" },
];
const TAG: Record<Kind, { l: string; c: string }> = {
  norsv: { l: "다음 예약 없음", c: "r" }, new: { l: "신규 2주", c: "bl" }, low: { l: "잔여 적음", c: "y" },
  consult: { l: "상담 후 미등록", c: "" }, todo: { l: "예약표 할 일", c: "" },
};
const ORDER: Kind[] = ["norsv", "new", "low", "consult", "todo"];
const TAGS = ["재등록 관심", "소개 가능", "불만 있음", "연락 원치 않음"];
const ONSITE = "현장에서 소통함";
const NO_REASONS = [
  { l: ONSITE, r: "해당없음" }, { l: "이미 예약함", r: "해당없음" }, { l: "다른 곳 다님", r: "거절" }, { l: "지금은 쉬고 싶음", r: "거절" }, { l: "연락 원치 않음", r: "거절" },
];
const RES_LABEL: Record<string, string> = {
  예약완료: "예약 잡음", 답장대기: "답장 기다림 · 내일 다시", 부재: "부재 · 내일 다시 연락", 거절: "안 함", 해당없음: "안 함", 통화완료: "통화함",
};

const THIS_YEAR = new Date().getFullYear().toString();
// 올해가 아니면 연도까지 (예: 20.11.30)
const md = (s: string | null) => (!s ? "-" : s.slice(0, 4) === THIS_YEAR ? `${s.slice(5, 7)}/${s.slice(8, 10)}` : `${s.slice(2, 4)}.${s.slice(5, 7)}.${s.slice(8, 10)}`);
// 365일 넘으면 '1년 넘게' 처럼
const whyN = (n: string) => { const d = /^(\d+)일$/.exec(n); return d && Number(d[1]) >= 365 ? `${Math.floor(Number(d[1]) / 365)}년 넘게` : n; };
const nk = (r: Board) => `${r.branch}|${r.customer_key}`;
const given = (n: string | null) => {
  const s = (n ?? "").replace(/\(.*?\)/g, "").trim();
  return !s ? "고객" : s.length >= 3 ? s.slice(1) : s;
};

// 상황별 자동 문구 (시안 문구 기준)
function draftText(r: Board, branch: string, me: string) {
  const g = given(r.name);
  const hi = `${g}님, ${branch} ${me}예요.`;
  switch (r.kind) {
    case "new": return `${hi} 처음 관리 받아 보시니 어떠셨어요? 몸 상태가 궁금해서 연락드려요. 첫 2주에 한 번 더 받으시면 효과가 좋아요. 이번 주 편한 요일과 시간 알려주시면 바로 잡아 둘게요.`;
    case "low": return `${hi} 남은 관리가 ${r.min_remaining ?? 0}회라서 미리 연락드려요. 지금까지 달라진 점 같이 보면서 다음 관리 계획을 안내해 드릴게요. 편하실 때 답장 주세요.`;
    case "consult": return `${hi} 지난번 상담 와 주셔서 고마워요. 더 궁금하신 점 있으면 편하게 물어봐 주세요. 첫 관리 원하시는 날 알려주시면 바로 잡아 둘게요.`;
    default: return `${hi} 요즘 바쁘셨죠? 다음 관리 예약이 아직 없어서 연락드려요. 이번 주 편한 요일과 시간 알려주시면 바로 잡아 둘게요.`;
  }
}

// happycall_board 가 아직 없을 때: happycall_list 모양을 바꿔서 보여 줘요
function fromList(r: HcRow, today: string): Board {
  const days = (a: string | null) => (a ? Math.round((Date.parse(today) - Date.parse(a)) / 864e5) : null);
  const kind: Kind = r.kind === "expiring" ? "low" : r.kind === "lapsed" ? "norsv" : r.kind === "new" ? "new"
    : r.reason === "다음 예약 없음" ? "norsv" : r.reason === "상담 후 미등록" ? "consult" : "todo";
  const d = days(r.last_visit_on);
  const why: [string, string, string] =
    kind === "low" ? ["남은 횟수 ", `${r.min_remaining ?? "-"}회`, ", 재등록 안내 시점"]
    : kind === "new" ? ["등록 ", `${(days(r.registered_on) ?? 0) + 1}일째`, ", 다음 예약 없음"]
    : kind === "norsv" && d != null ? ["마지막 이용 뒤 ", `${d}일`, " 동안 예약 없음"]
    : [r.reason || TAG[kind].l, "", ""];
  return {
    kind, item_id: r.item_id, customer_key: r.customer_key, branch: r.branch, name: r.name, phone: r.phone,
    membership: r.membership, min_remaining: r.min_remaining, last_visit_on: r.last_visit_on, registered_on: r.registered_on, next_rsv: null,
    manager: r.manager, assignee: r.assignee || r.manager, why_a: why[0], why_n: why[1], why_b: why[2],
    tags: null, ad_consent: null, kakao_url: null, done: false, result: null, result_note: null, log_id: null,
  };
}

export default function HappyBoard({ branch, today, onCount }: { branch: string; today: string; onCount: (left: number, done: number, total: number) => void }) {
  const me = useMe();
  const router = useRouter();
  const [rows, setRows] = useState<Board[] | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState<Kind | "all">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState("");
  const [noOpen, setNoOpen] = useState(false);
  const [toast, setToast] = useState<{ name: string; label: string; ids: string[]; keys: string[] } | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkNo, setBulkNo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mOpen, setMOpen] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const b = await sb.rpc("happycall_board", { p_branch: branch });
    if (!b.error && Array.isArray(b.data)) { setLegacy(false); setErr(""); setRows(b.data as Board[]); return; }
    const l = await sb.rpc("happycall_list", { p_branch: branch });
    if (l.error || !Array.isArray(l.data)) { setErr(l.error?.message.includes("NO_PERMISSION") ? "해피콜 권한이 없어요." : "해피콜을 불러오지 못했어요."); setRows([]); return; }
    setLegacy(true); setErr("");
    const seen = new Set<string>();
    setRows((l.data as HcRow[]).map((r) => fromList(r, today)).filter((r) => (seen.has(nk(r)) ? false : (seen.add(nk(r)), true))));
  }, [branch, today]);
  useEffect(() => { setRows(null); setSel(null); setChecked(new Set()); load(); }, [load]);

  // 현장에서 이미 소통한 고객은 목록에서 빼요
  const all = useMemo(() => (rows ?? []).filter((r) => !(r.done && r.result_note === ONSITE)), [rows]);
  const sorted = useMemo(() => [...all].sort((a, b) =>
    Number(a.done) - Number(b.done) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (parseInt(b.why_n) || 0) - (parseInt(a.why_n) || 0)), [all]);
  const list = f === "all" ? sorted : sorted.filter((r) => r.kind === f);
  const open = list.filter((r) => !r.done);
  const doneN = all.filter((r) => r.done).length;
  const leftN = all.length - doneN;
  useEffect(() => { if (rows) onCount(leftN, doneN, all.length); }, [rows, leftN, doneN, all.length, onCount]);

  const cur = list.find((r) => nk(r) === sel) ?? open[0] ?? null;
  const curKey = cur ? nk(cur) : null;
  useEffect(() => {
    if (!cur) { setText(""); return; }
    setText(draftText(cur, cur.branch, me.name));
    setNoOpen(false); setCopied("");
  }, [curKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const cnt = (k: Kind | "all") => (k === "all" ? all.length : all.filter((r) => r.kind === k).length);
  const pos = cur && !cur.done ? open.findIndex((r) => nk(r) === curKey) : -1;
  const step = (n: number) => {
    if (!open.length) return;
    const i = pos < 0 ? 0 : (pos + n + open.length) % open.length;
    setSel(nk(open[i]));
  };

  const flash = (s: string) => { setCopied(s); setTimeout(() => setCopied(""), 2000); };
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); return true; } catch { return false; } };
  const kakao = async () => {
    if (!cur) return;
    const ok = await copy(text);
    flash(ok ? "문구를 복사했어요. 카카오 채널 대화창에 붙여 넣어 주세요." : "복사하지 못했어요. 문구를 길게 눌러 복사해 주세요.");
    window.open(cur.kakao_url || "https://center-pf.kakao.com/", "_blank", "noopener");
  };
  const fullPhone = cur?.phone && !cur.phone.includes("*") ? cur.phone : null;

  const kindFor = (r: Board) => {
    const k0 = r.kind === "todo" ? "norsv" : r.kind;
    return legacy ? (k0 === "low" ? "expiring" : k0 === "norsv" || k0 === "consult" ? "lapsed" : k0) : k0;
  };
  const errMsg = (m: string) => m.includes("NO_PERMISSION") ? "해피콜 기록 권한이 없어요." : m.includes("BAD_RESULT") || m.includes("BAD_KIND") ? "서버 업데이트(038)가 아직이에요. 이 결과는 저장되지 않았어요." : "저장하지 못했어요. 다시 눌러 주세요.";
  const save = async (r: Board, result: string, note: string) => {
    const { data, error } = await sb.rpc("happycall_log", {
      p_item: r.item_id, p_customer_key: r.customer_key, p_branch: r.branch, p_kind: kindFor(r), p_result: result, p_note: note, p_follow_day: null,
    });
    return error ? { ok: false as const, msg: errMsg(error.message) } : { ok: true as const, id: (data as string | null) ?? null };
  };
  const showToast = (name: string, label: string, ids: string[], keys: string[]) => {
    if (toastT.current) clearTimeout(toastT.current);
    setToast({ name, label, ids, keys });
    toastT.current = setTimeout(() => setToast(null), 8000);
  };
  const mark = (keys: string[], patch: Partial<Board>) => setRows((rs) => rs && rs.map((x) => (keys.includes(nk(x)) ? { ...x, ...patch } : x)));

  const record = async (r: Board, result: string, note = "") => {
    // 다음 고객으로 먼저 넘기고 저장 (실패하면 되돌려요)
    const idx = open.findIndex((x) => nk(x) === nk(r));
    const next = open[idx + 1] ?? open[idx - 1] ?? null;
    mark([nk(r)], { done: true, result, result_note: note });
    setSel(next ? nk(next) : null);
    if (!next) setMOpen(false);
    const res = await save(r, result, note);
    if (!res.ok) {
      mark([nk(r)], { done: false, result: null, result_note: null });
      setSel(nk(r)); setErr(res.msg);
      return false;
    }
    setErr("");
    mark([nk(r)], { log_id: res.id });
    setChecked((c) => { const n = new Set(c); n.delete(nk(r)); return n; });
    showToast(r.name ?? "고객", RES_LABEL[result] ?? (note || result), res.id ? [res.id] : [], [nk(r)]);
    return true;
  };
  // 선택한 고객 한 번에 기록
  const recordMany = async (result: string, note = "") => {
    const targets = open.filter((r) => checked.has(nk(r)));
    if (!targets.length) return;
    setBusy(true); setBulkNo(false);
    const ids: string[] = []; const keys: string[] = []; let fail = "";
    for (const r of targets) {
      const res = await save(r, result, note);
      if (res.ok) { ids.push(...(res.id ? [res.id] : [])); keys.push(nk(r)); } else fail = res.msg;
    }
    mark(keys, { done: true, result, result_note: note });
    setChecked(new Set()); setBusy(false);
    setErr(fail ? `${targets.length - keys.length}명은 ${fail}` : "");
    if (keys.length) showToast(`${keys.length}명`, note || RES_LABEL[result] || result, ids, keys);
  };
  const undo = async () => {
    if (!toast) return;
    const t = toast; setToast(null);
    for (const id of t.ids) {
      const { error } = await sb.rpc("happycall_undo", { p_id: id });
      if (error) return setErr("되돌리지 못했어요.");
    }
    mark(t.keys, { done: false, result: null, result_note: null, log_id: null });
    if (t.keys.length === 1) setSel(t.keys[0]);
  };
  const booked = async (r: Board) => {
    if (!(await record(r, "예약완료"))) return;
    try { sessionStorage.setItem("rsv:prefill", JSON.stringify({ customer_key: r.customer_key, customer_name: r.name ?? "" })); } catch { /* 저장소 없음 */ }
    router.push("/schedule?new=1");
  };
  const toggleTag = async (r: Board, t: string) => {
    const has = (r.tags ?? "").split(",").map((x) => x.trim()).includes(t);
    const nextTags = has ? (r.tags ?? "").split(",").map((x) => x.trim()).filter((x) => x && x !== t).join(",") : [r.tags, t].filter(Boolean).join(",");
    setRows((rs) => rs && rs.map((x) => (nk(x) === nk(r) ? { ...x, tags: nextTags } : x)));
    const { error } = await sb.rpc("customer_tag_toggle", { p_branch: r.branch, p_key: r.customer_key, p_tag: t });
    if (error) {
      setRows((rs) => rs && rs.map((x) => (nk(x) === nk(r) ? { ...x, tags: r.tags } : x)));
      setErr(/function|schema cache/i.test(error.message) ? "태그는 서버 업데이트(038) 뒤에 저장돼요." : "태그를 저장하지 못했어요.");
    }
  };
  const tagOn = (r: Board, t: string) => (r.tags ?? "").split(",").map((x) => x.trim()).includes(t);
  const doneWhy = (r: Board) =>
    r.result === "예약완료" ? `예약 잡음${r.next_rsv ? ` · ${r.next_rsv}` : ""}`
    : r.result === "거절" || r.result === "해당없음" ? `안 함${r.result_note ? ` · ${r.result_note}` : ""}`
    : RES_LABEL[r.result ?? ""] ?? r.result ?? "완료";
  const consent = cur?.ad_consent;
  const consentNote = consent && /동의|^y/i.test(consent) && !/거부|미동의/.test(consent) ? <span className="note">✓ 광고 수신 동의</span>
    : consent && /거부|미동의|^n/i.test(consent) ? <span className="note no">광고 수신 거부 · 안내만 보내기</span>
    : <span className="note">광고 수신 동의 확인 전</span>;

  const openKeys = open.map(nk);
  const allOn = openKeys.length > 0 && openKeys.every((k) => checked.has(k));
  const toggleAll = () => setChecked(allOn ? new Set() : new Set(openKeys));
  const toggleOne = (k: string) => setChecked((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const nChecked = openKeys.filter((k) => checked.has(k)).length;
  // 한 번에 보내기: 선택한 고객에게 보낼 공통 문구(이름 없이 '고객님')를 복사하고 카카오 채널 관리자를 열어요
  const bulkSend = async () => {
    const t = open.filter((r) => checked.has(nk(r)));
    if (!t.length) return;
    const kinds = new Set(t.map((r) => r.kind));
    const base = { ...t[0], name: null, kind: kinds.size === 1 ? t[0].kind : "norsv" } as Board;
    const ok = await copy(draftText(base, t[0].branch, me.name));
    flash(ok ? `${t.length}명에게 보낼 공통 문구를 복사했어요. 카카오 채널에서 붙여 넣어 보내 주세요.` : "복사하지 못했어요.");
    window.open("https://center-pf.kakao.com/", "_blank", "noopener");
  };

  return (
    <div className={`hc${mOpen ? " m-open" : ""}`}>
      <div className="hc-kpis">
        {CARDS.map((c) => (
          <button key={c.k} type="button" className={`hc-k${f === c.k ? " on" : ""}`} aria-pressed={f === c.k} onClick={() => { setF(c.k); setSel(null); setChecked(new Set()); }}>
            <span className="n num">{rows ? cnt(c.k) : "-"}</span>
            <div><b>{c.l}</b><small>{c.k === "all" ? `남은 ${leftN}명` : c.s}</small></div>
          </button>
        ))}
      </div>
      {(err || legacy) && <p className="hc-err">{err || "서버 업데이트(038) 전이라 예전 목록으로 보여 줘요. 답장 기다림·태그는 업데이트 뒤에 저장돼요."}</p>}

      <section className="hc-card hc-list">
        {nChecked > 0 ? (
          <div className="hc-bulk">
            <label className="hc-ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="전체 선택" /></label>
            <b className="num">{nChecked}명 선택</b>
            <div className="acts">
              <button type="button" className="p" disabled={busy} onClick={bulkSend}>한 번에 보내기</button>
              <button type="button" disabled={busy} onClick={() => recordMany("해당없음", ONSITE)}>현장에서 소통함</button>
              <button type="button" disabled={busy} onClick={() => recordMany("답장대기")}>답장 기다림</button>
              <button type="button" disabled={busy} onClick={() => recordMany("부재")}>부재</button>
              <button type="button" disabled={busy} className={bulkNo ? "on" : ""} onClick={() => setBulkNo((v) => !v)}>안 함</button>
              <button type="button" className="x" onClick={() => { setChecked(new Set()); setBulkNo(false); }}>선택 해제</button>
            </div>
            {bulkNo && (
              <div className="hc-bulk-no">
                {NO_REASONS.filter((x) => x.l !== ONSITE).map((x) => <button key={x.l} type="button" disabled={busy} onClick={() => recordMany(x.r, x.l)}>{x.l}</button>)}
              </div>
            )}
          </div>
        ) : (
          <div className="row h">
            <label className="hc-ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allOn} onChange={toggleAll} disabled={!openKeys.length} aria-label="전체 선택" /></label>
            <span>고객</span><span>왜 지금 연락하나요</span><span>대상</span><span>담당</span>
          </div>
        )}
        {rows === null && <div className="hc-none">불러오는 중이에요.</div>}
        {rows && list.length === 0 && <div className="hc-none">{f === "all" ? "오늘 연락할 고객이 없어요." : "이 대상은 오늘 없어요."}</div>}
        {list.map((r) => (
          <div key={nk(r)} className={`row${r.done ? " done" : ""}${curKey === nk(r) ? " hc-on" : ""}`} onClick={() => { setSel(nk(r)); setMOpen(true); }}>
            {r.done ? <span className="dot ok">✓</span>
              : <label className="hc-ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.has(nk(r))} onChange={() => toggleOne(nk(r))} aria-label={`${r.name ?? "고객"} 선택`} /></label>}
            <div className="nm"><b>{r.name ?? "-"}</b><small>{[r.membership || (r.kind === "consult" ? "상담" : ""), r.phone].filter(Boolean).join(" · ")}</small></div>
            <div className="why">{r.done ? doneWhy(r) : <>{r.why_a}{r.why_n && <em>{whyN(r.why_n)}</em>}{r.why_b}</>}</div>
            <span>{r.done ? <span className="hc-tag g">완료</span> : <span className={`hc-tag ${TAG[r.kind].c}`}>{TAG[r.kind].l}</span>}</span>
            <span className="who">{r.assignee || r.manager || "-"}</span>
          </div>
        ))}
      </section>

      <aside className="hc-card hc-pane">
        <div className="hc-next">
          <button type="button" className="hc-x" onClick={() => setMOpen(false)} aria-label="목록으로">✕ 목록</button>
          <button type="button" onClick={() => step(-1)} disabled={open.length < 2}>‹ 이전</button>
          <span className="num">{pos >= 0 ? pos + 1 : 0} / {open.length}명</span>
          <button type="button" onClick={() => step(1)} disabled={open.length < 2}>다음 ›</button>
        </div>
        {!cur ? (
          <div className="hc-none">{rows ? "오늘 연락을 모두 마쳤어요." : "불러오는 중이에요."}</div>
        ) : (
          <>
            <div className="row2">
              <h2>{cur.name ?? "-"} {cur.done ? <span className="hc-tag g">완료</span> : <span className={`hc-tag ${TAG[cur.kind].c}`}>{TAG[cur.kind].l}</span>}</h2>
              <button type="button" className="hc-b" disabled={!fullPhone} title={fullPhone ? undefined : "번호 전체 보기 권한이 있어야 복사돼요"}
                onClick={async () => fullPhone && flash((await copy(fullPhone)) ? "번호를 복사했어요." : "복사하지 못했어요.")}>번호 복사</button>
            </div>
            <div className="sum">
              <div><b className="num">{cur.min_remaining != null ? `${cur.min_remaining}회` : "-"}</b><small>남은 횟수</small></div>
              <div><b className="num">{md(cur.last_visit_on)}</b><small>최근 방문</small></div>
              <div><b className="num">{cur.next_rsv ?? "없음"}</b><small>다음 예약</small></div>
            </div>
            <div className="reason">왜 지금: {cur.done ? doneWhy(cur) : `${cur.why_a}${whyN(cur.why_n)}${cur.why_b}`}</div>
            <div>
              <div className="row2"><div className="lbl">보낼 문구 (상황에 맞게 자동 작성)</div>{consentNote}</div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="보낼 문구" />
            </div>
            <button type="button" className="big" onClick={kakao}>문구 복사하고 카카오 채널 열기</button>
            {copied && <p className="hc-ok">{copied}</p>}
            {!cur.done && (
              <div>
                <div className="lbl">결과 한 번 누르면 기록되고 다음 고객으로 넘어가요</div>
                <div className="res">
                  <button type="button" className="g" onClick={() => booked(cur)}>예약 잡음<small>날짜 고르기</small></button>
                  <button type="button" onClick={() => record(cur, "답장대기")}>답장 기다림<small>내일 다시</small></button>
                  <button type="button" onClick={() => record(cur, "부재")}>부재<small>내일 다시</small></button>
                  <button type="button" className={noOpen ? "on" : ""} onClick={() => setNoOpen((v) => !v)}>안 함<small>이유 고르기</small></button>
                </div>
                {noOpen && (
                  <div className="chips hc-why">
                    {NO_REASONS.map((x) => (
                      <button key={x.l} type="button" className="chip" onClick={async () => {
                        if (x.l === "연락 원치 않음" && !tagOn(cur, x.l)) await toggleTag(cur, x.l);
                        record(cur, x.r, x.l);
                      }}>{x.l}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="lbl">고객 태그 (한 번 누르기)</div>
              <div className="chips">
                {TAGS.map((t) => <button key={t} type="button" className={`chip${tagOn(cur, t) ? " on" : ""}`} aria-pressed={tagOn(cur, t)} onClick={() => toggleTag(cur, t)}>{t}</button>)}
              </div>
            </div>
          </>
        )}
      </aside>

      {toast && (
        <div className="hc-toast" role="status">
          <span>{toast.name} · {toast.label} 기록했어요</span>
          <button type="button" onClick={undo}>되돌리기</button>
        </div>
      )}
    </div>
  );
}
