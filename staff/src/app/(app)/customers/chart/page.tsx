"use client";
// 고객 차트 — v3 확정 시안 CHART_v3 (PC P07·P08·P09·P13·P14·P16·P27·P28·P33) · MO_CHART (M01·M02·M18·M22) 그대로.
// 고객 앱 기록(체중·식단·챌린지·걸음·수면·라운지·주간 리포트)은 아직 DB 에 없어서 P33 '첫 방문 · 기록 없음' 모양으로 보여요.
import "../customers.css";
import "./chart.css";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { sb } from "@/lib/sb";

type Item = { program: string; total: number; used: number; service: number | null };
type Membership = {
  id: string; name: string; kind: "회차" | "기간" | "금액"; status: string; start_on: string; end_on: string | null;
  amount_total: number | null; amount_left: number | null; price: number | null; paid: number | null; unpaid: number | null;
  sold_by: string | null; sold_at: string | null; memo: string | null; shared: boolean; items: Item[];
};
type Visit = { day: string; time: string | null; status: string; program: string | null; minutes?: number; staff: string | null; memo: string | null; cancel_reason?: string | null; src: string };
type Memo = { id: string; body: string; author: string; at: string };
type Payment = { day: string; amount: number; method: string | null; product: string | null; type: string | null; reg: string | null; refund: boolean; unpaid: number | null; by: string | null; memo: string | null };
type Chart = {
  customer: {
    key: string; branch: string; customer_no: string | null; name: string; phone: string | null; manager: string | null;
    registered_on: string | null; last_visit_on: string | null; source: string | null; source_detail: string | null;
    ad_consent: string | null; tags: string | null; referrer: string | null; first_payment: number | null; first_payment_on: string | null;
    gender?: string | null; age?: number | null;
  };
  memberships: Membership[]; visits: Visit[]; memos: Memo[];
  counts: { done: number; noshow: number; cancel: number };
  next: { day: string; time: string; program: string | null } | null;
  payments: Payment[] | null;
  pay_sum: { total: number; last_day: string | null; unpaid: number } | null;
  health: { note: string | null; flags: string | null; by: string | null; at: string | null } | null;
  perms: { phone?: boolean; pay: boolean; health: boolean; memo: boolean; sms: boolean; reserve: boolean };
};
// happycall_list 한 줄 (이 고객 것만 씀)
type Hc = { kind: string; item_id: string | null; customer_key: string; branch: string; reason: string; last_result: string | null; last_note: string | null; last_called_at: string | null; last_handler: string | null };

const won = (n: number | null | undefined) => (n == null ? "-" : `${n.toLocaleString()}원`);
const man = (n: number) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : won(n));
const today = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
const dw = (d: string) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
const mdw = (d: string) => `${md(d)} (${dw(d)})`;
const ymd2 = (d: string) => d.slice(2).replaceAll("-", ".");
const ymd = (d: string) => d.replaceAll("-", ".");
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 36e5).toISOString().slice(0, 10);
const kstTime = (iso: string) => new Date(Date.parse(iso) + 9 * 36e5).toISOString().slice(11, 16);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const monday = (d: string) => addDays(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
const PCOLORS = ["p-plum", "p-mauve", "p-dblue", "p-teal", "p-dpink", "p-lilac", "p-cool"];
const pcolor = (s: string) => PCOLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PCOLORS.length];
const sexAge = (cu: Chart["customer"]) => {
  const g = /^(F|W|여)/i.test(cu.gender ?? "") ? "여" : /^(M|남)/i.test(cu.gender ?? "") ? "남" : "";
  return [g, cu.age != null ? String(cu.age) : ""].filter(Boolean).join(" · ");
};

function remainCount(m: Membership) {
  const t = m.items.reduce((s, i) => s + (i.total ?? 0) + (i.service ?? 0), 0);
  const u = m.items.reduce((s, i) => s + (i.used ?? 0), 0);
  return m.items.length ? { left: Math.max(t - u, 0), total: t } : null;
}
// 막대는 쓴 만큼 (시안 P14: 10회 중 4회 남음 → 60%)
// "잔여 4회 · 64일" (요약) / "4회 남음 · 64일" (회원권 탭)
function memLine(m: Membership, style: "aside" | "card") {
  const t = today();
  const days = m.end_on ? Math.max(daysBetween(t, m.end_on), 0) : null;
  const r = m.kind === "회차" ? remainCount(m) : null;
  const amt = m.kind === "금액" ? (m.amount_left != null ? `잔액 ${man(m.amount_left)}` : "잔액 -") : null;
  const cnt = r ? (style === "aside" ? `잔여 ${r.left}회` : `${r.left}회 남음`) : null;
  return { main: amt ?? cnt ?? (m.kind === "기간" ? "기간권" : "-"), days, soon: days != null && days <= 7 && m.status === "사용중", r };
}
function Expiry({ m }: { m: Membership }) {
  if (!m.end_on) return <span className="badge line">기한 없음</span>;
  if (m.status !== "사용중") return <span className="badge expired">{ymd2(m.end_on)} 끝남</span>;
  const d = daysBetween(today(), m.end_on);
  if (d <= 7) return <span className="badge expiring">D-{Math.max(d, 0)} · {md(m.end_on)} 만료</span>;
  return <span className="badge line">{ymd2(m.end_on)} 만료</span>;
}

// 상담·해피콜 기록은 고객 메모에 "[종류·결과] 내용" 으로 남겨요 (새 테이블 없이)
const KINDS = ["해피콜", "상담", "재등록", "노쇼 후", "체험 후"] as const;
const RESULTS = ["통화·상담 완료", "부재중", "예약 완료", "등록 완료", "다시 연락", "보류", "거절"] as const;
const HC_RESULT: Record<string, string> = { "통화·상담 완료": "통화완료", 부재중: "부재", "예약 완료": "예약완료", "등록 완료": "통화완료", "다시 연락": "통화완료", 보류: "통화완료", 거절: "거절" };
const HC_BACK: Record<string, string> = { 통화완료: "통화·상담 완료", 부재: "부재중", 예약완료: "예약 완료", 거절: "거절", 해당없음: "해당없음" };
const CALL_RE = /^\[(해피콜|상담|재등록|노쇼 후|체험 후)·([^\]]+)\]\s?([\s\S]*)$/;
type CallRec = { day: string; kind: string; result: string; text: string; by: string; follow: string | null };
function parseCalls(memos: Memo[]): CallRec[] {
  return memos.flatMap((m) => {
    const x = CALL_RE.exec(m.body);
    if (!x) return [];
    const f = /\((\d{2})\.(\d{2})\)\s*$/.exec(x[3]);
    return [{ day: kstDay(m.at), kind: x[1], result: x[2], text: x[3].replace(/\s*\(\d{2}\.\d{2}\)\s*$/, ""), by: m.author, follow: f ? `${f[1]}.${f[2]}` : null }];
  });
}
const resBadge = (r: string) => (r === "다시 연락" ? "em" : ["부재중", "보류", "거절", "해당없음"].includes(r) ? "" : "ok");
function CallLine({ r }: { r: CallRec }) {
  return <span className={`badge ${resBadge(r.result)} st`}>{r.result}{r.result === "다시 연락" && r.follow ? ` ${r.follow}` : ""}</span>;
}

const TABS = [
  { k: "week", l: "한눈에" }, { k: "info", l: "회원정보" }, { k: "visits", l: "관리기록" }, { k: "mem", l: "회원권·결제", mo: "회원권" },
  { k: "call", l: "상담·해피콜" }, { k: "diet", l: "식단" }, { k: "chal", l: "챌린지" }, { k: "body", l: "몸의 변화" }, { k: "ex", l: "운동일지" },
] as const;
type TabK = (typeof TABS)[number]["k"];
const ALIAS: Record<string, TabK> = { memo: "visits" }; // 예전 '메모' 탭은 관리기록 안으로 합쳐졌어요
const NO_ASIDE: TabK[] = ["week", "diet", "chal"];

type Care = { b: string; s: string; red: boolean; badges: { t: string; c: string }[] };
function careOf(c: Chart, hc: Hc[]): Care {
  const t = today();
  const badges: { t: string; c: string }[] = [];
  const active = c.memberships.filter((m) => m.status === "사용중");
  const exp = active.filter((m) => m.end_on && daysBetween(t, m.end_on) <= 7).sort((a, b) => a.end_on!.localeCompare(b.end_on!));
  const low = active.filter((m) => { const r = m.kind === "회차" ? remainCount(m) : null; return r != null && r.left <= 2; });
  exp.forEach((m) => badges.push({ t: `${m.name} D-${Math.max(daysBetween(t, m.end_on!), 0)} 만료`, c: "em" }));
  low.forEach((m) => badges.push({ t: `${m.name} 잔여 ${remainCount(m)!.left}회`, c: "warn" }));
  hc.forEach((h) => badges.push({ t: `해피콜 대상 · ${h.reason}`, c: "em" }));
  if (exp[0]) return { b: `회원권 D-${Math.max(daysBetween(t, exp[0].end_on!), 0)} 만료`, s: `${exp[0].name} · 재등록 안내 필요`, red: true, badges };
  if (hc[0]) return { b: "해피콜 대상", s: hc[0].reason, red: true, badges };
  if (low[0]) return { b: `잔여 ${remainCount(low[0])!.left}회`, s: `${low[0].name} · 재등록 안내`, red: true, badges };
  const visited = c.visits.some((v) => v.status === "완료" || v.status === "방문");
  if (!visited && c.next) return { b: `첫 방문 ${mdw(c.next.day)}`, s: [c.next.program, c.customer.manager && `담당 ${c.customer.manager}`].filter(Boolean).join(" · "), red: false, badges };
  if (c.next) return { b: `다음 예약 ${mdw(c.next.day)}`, s: [c.next.time, c.next.program].filter(Boolean).join(" · "), red: false, badges };
  return { b: "챙길 일 없어요", s: "다음 예약 없음", red: false, badges };
}

function ChartView() {
  const sp = useSearchParams();
  const router = useRouter();
  const branch = sp.get("b") ?? "";
  const key = sp.get("k") ?? "";
  const t0 = sp.get("tab") ?? "";
  const fromRsv = sp.get("from") === "rsv";
  const ctx = (sp.get("ctx") ?? "").split("|");
  const [c, setC] = useState<Chart | null | undefined>(undefined);
  const [hc, setHc] = useState<Hc[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabK>(TABS.some((t) => t.k === t0) ? (t0 as TabK) : ALIAS[t0] ?? "info");
  const [sms, setSms] = useState(false);
  const [toast, setToast] = useState("");
  const tabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = tabsRef.current; const on = box?.querySelector<HTMLElement>("button.on");
    if (box && on && box.scrollWidth > box.clientWidth) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
  }, [tab, c]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("customer_chart", { p_branch: branch, p_key: key });
    if (error) { setErr(error.message.includes("FORBIDDEN") ? "이 고객 차트를 볼 권한이 없어요" : error.message); setC(null); return; }
    setErr(""); setC((data ?? null) as Chart | null);
    const h = await sb.rpc("happycall_list", { p_branch: branch });
    setHc(((h.data ?? []) as Hc[]).filter((r) => r.customer_key === key && r.branch === branch));
  }, [branch, key]);
  useEffect(() => { load(); }, [load]);

  if (c === undefined) return <div className="gc"><div className="ghead" style={{ color: "var(--ink-3)" }}>불러오는 중…</div></div>;
  if (!c) return (
    <div className="gc">
      <div className="ghead"><Link href="/customers" className="btn sm t">‹ 고객 목록</Link></div>
      <div className="ghead"><span style={{ color: err ? "var(--red)" : "var(--ink-3)" }}>{err || "고객을 찾지 못했어요"}</span></div>
    </div>
  );

  const cu = c.customer;
  const tags = [...new Set([...(cu.tags ?? "").split(/[,#]+/).map((s) => s.trim()).filter(Boolean)])].slice(0, 3);
  const calls = parseCalls(c.memos);
  const lastHc = hc.find((h) => h.last_called_at);
  if (lastHc?.last_called_at && !calls.some((r) => r.kind === "해피콜" && r.day === kstDay(lastHc.last_called_at!))) {
    calls.push({ day: kstDay(lastHc.last_called_at), kind: "해피콜", result: HC_BACK[lastHc.last_result ?? ""] ?? lastHc.last_result ?? "", text: lastHc.last_note ?? "", by: lastHc.last_handler ?? "", follow: null });
    calls.sort((a, b) => b.day.localeCompare(a.day));
  }
  const plainMemos = c.memos.filter((m) => !CALL_RE.test(m.body));
  const care = careOf(c, hc);
  const canCall = !!c.perms.phone || hc.length > 0;
  const sa = sexAge(cu);
  const mt = [sa, cu.phone, cu.manager && `담당 ${cu.manager}`].filter(Boolean).join(" · ");

  async function call() {
    const { data, error } = await sb.rpc("customer_phone_reveal", { p_branch: cu.branch, p_key: cu.key, p_purpose: "call" });
    if (error) return setToast(error.message.includes("DAILY_LIMIT") ? "오늘 볼 수 있는 연락처 수를 넘었어요" : "전화 걸 권한이 없어요");
    const n = String(data ?? "").replace(/\D/g, "");
    if (!n) return setToast("연락처가 없어요");
    window.location.href = `tel:${n}`;
  }
  const reserve = () => {
    try { sessionStorage.setItem("rsv:prefill", JSON.stringify({ branch: cu.branch, key: cu.key, name: cu.name })); } catch { /* 없어도 새 예약은 열림 */ }
    router.push("/schedule?new=1");
  };
  const report = () => setToast("주간 리포트·피드백은 고객 앱이 연결되면 보낼 수 있어요");
  const soon = (w: string) => setToast(`${w}은 준비 중이에요`);

  return (
    <div className="gc">
      {fromRsv && (
        <div className="gback">
          <button className="btn sm t" onClick={() => router.back()}>‹ 예약표로</button>
          <span>{ctx[0] ? `${mdw(ctx[0])} ${ctx[1] ?? ""} ` : ""}<b>{cu.name}</b> {ctx[2] ?? ""} 예약 시트에서 열었어요 · 닫으면 예약 시트로 돌아가요</span>
        </div>
      )}
      <div className="gmbar gm"><b>고객 차트</b><span className="sp" /><span className="gsel">{cu.branch}</span></div>
      {/* 머리: PC P07/P13 · 모바일 M01 */}
      <div className="ghead">
        {!fromRsv && <Link href="/customers" className="btn sm t gpc">‹ 고객 목록</Link>}
        <Link href="/customers" className="back gm" aria-label="고객 목록">‹</Link>
        <div className="av gpc" style={{ width: 40, height: 40 }}>{cu.name.slice(0, 1)}</div>
        <div className="av gm" style={{ width: 32, height: 32 }}>{cu.name.slice(0, 1)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="nmrow"><span className="nm">{cu.name}</span>{tags.map((t) => <span key={t} className="badge gpc">{t}</span>)}</div>
          <div className="mt gpc">{mt}</div>
          <div className="mt gm">{[cu.phone, cu.manager].filter(Boolean).join(" · ")}</div>
        </div>
        <span className="sp" />
        {canCall && <button className="btn sm" onClick={call}>통화</button>}
        {c.perms.sms && <button className="btn sm gpc" onClick={() => setSms(true)}>문자</button>}
        <button className="btn sm gpc" onClick={report}>리포트 · 피드백</button>
        <button className="btn sm gm" onClick={report}>리포트</button>
        {c.perms.reserve && <button className="btn p sm gpc" onClick={reserve}>예약 잡기</button>}
      </div>
      {/* KPI 5칸 (P33: 고객 앱 기록 없음) */}
      <div className="gkpis">
        <div><label><span className="gpc">체중 · 7일 평균</span><span className="gm">체중 7일 평균</span></label><b>기록 없음</b><span className="s">첫 측정 전</span></div>
        <div><label>허리 · 월 1회</label><b>기록 없음</b><span className="s">월 1회 · 선택</span></div>
        <div><label><span className="gpc">라인 챌린지</span><span className="gm">챌린지 이번 주</span></label><b>참여 전</b><span className="s">동의 후 참여</span></div>
        <div className="k-steps"><label>걸음 · 수면</label><b>앱 연결 전</b><span className="s">연결하면 자동</span></div>
        <div><label>지금 챙길 것</label><b className={`care ${care.red ? "red" : ""}`}>{care.b}</b><span className="s">{care.s}</span></div>
      </div>
      <div className="gtabs" ref={tabsRef}>
        <div className="v3seg" role="tablist">
          {TABS.map((t) => (
            <button key={t.k} role="tab" className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}>
              <span className="pc">{t.l}</span><span className="mo">{"mo" in t ? t.mo : t.l}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "week" && <WeekTab c={c} report={report} go={setTab} />}
      {tab === "diet" && <DietTab />}
      {tab === "chal" && <ChalTab />}
      {!NO_ASIDE.includes(tab) && (
        <div className="gb">
          <div className="main2">
            {tab === "info" && <InfoTab c={c} calls={calls} go={setTab} report={report} />}
            {tab === "visits" && <VisitsTab c={c} memos={plainMemos} reload={load} setToast={setToast} />}
            {tab === "mem" && <MemTab c={c} soon={soon} />}
            {tab === "call" && <CallTab c={c} hc={hc[0] ?? null} calls={calls} reload={load} />}
            {tab === "body" && <BodyTab soon={soon} />}
            {tab === "ex" && <ExTab c={c} soon={soon} />}
          </div>
          <Aside c={c} care={care} memos={plainMemos} />
        </div>
      )}
      {sms && <SmsDrawer name={cu.name} onClose={() => setSms(false)} />}
      {toast && <div className="c-toast" role="status">{toast}</div>}
    </div>
  );
}

/* 오른쪽 고객 요약 — 모든 탭에서 같이 보여요 (P07 aside) */
function Aside({ c, care, memos }: { c: Chart; care: Care; memos: Memo[] }) {
  const t = today();
  const lastOf = (s: string) => c.visits.find((v) => v.status === s)?.day;
  const ns = lastOf("노쇼"), cx = lastOf("취소");
  const flags = (c.health?.flags ?? "").split(/[,·]+/).map((s) => s.trim()).filter(Boolean);
  const active = c.memberships.filter((m) => m.status === "사용중");
  const last = c.customer.last_visit_on;
  return (
    <div className="aside">
      <h4>고객 요약<span>모든 탭에서 같이 보여요</span></h4>
      <div className="ar"><label>이력</label><span>
        취소 <b className={c.counts.cancel ? "red" : ""}>{c.counts.cancel}회</b>{cx ? ` ${md(cx)}` : ""} · 노쇼 <b className={c.counts.noshow ? "red" : ""}>{c.counts.noshow}회</b>{ns ? ` ${md(ns)}` : ""}<br />
        최근 방문 {last ? `${md(last)} (${daysBetween(last, t) === 0 ? "오늘" : `${daysBetween(last, t)}일 전`})` : "없음"} · 다음 {c.next ? `${mdw(c.next.day)} ${c.next.time}` : "없음"}
      </span></div>
      {c.perms.health && (
        <div className="ar"><label>건강</label><span>{flags.map((f) => <span key={f} className="badge warn" style={{ marginRight: 4 }}>{f}</span>)}{c.health?.note || (flags.length ? "" : <span className="muted">적어 둔 내용이 없어요</span>)}</span></div>
      )}
      <div className="ar"><label>목표</label><span className="muted">정하지 않았어요</span></div>
      {active.map((m) => {
        const x = memLine(m, "aside");
        return (
          <div key={m.id} className="am">
            <b>{m.name}</b>
            <span>{x.main}{x.days != null && <> · <b className={x.soon ? "red" : ""}>{x.days}일</b></>}</span>
            <span className="q">{x.soon ? <><Expiry m={m} /> 재등록 안내 필요</> : m.end_on ? `${ymd2(m.end_on)} 만료` : "기한 없음"}</span>
          </div>
        );
      })}
      {active.length === 0 && <div className="am"><span className="muted">쓰는 회원권이 없어요</span></div>}
      <div className="ar"><label>비고</label><span>{memos[0]?.body ? memos[0].body.slice(0, 60) : <span className="muted">-</span>}</span></div>
      <div className="ar"><label>챙길 것</label><span className="bs">{care.badges.length ? care.badges.map((b) => <span key={b.t} className={`badge ${b.c}`}>{b.t}</span>) : <span className="muted">없어요</span>}</span></div>
    </div>
  );
}

/* 회원정보 — PC P07, 모바일 M01 */
function InfoTab({ c, calls, go, report }: { c: Chart; calls: CallRec[]; go: (t: TabK) => void; report: () => void }) {
  const cu = c.customer;
  const [more, setMore] = useState(false);
  const lastPay = (c.payments ?? []).find((p) => !p.refund);
  const visitN = c.visits.filter((v) => v.status === "완료" || v.status === "방문").length;
  const flags = (c.health?.flags ?? "").split(/[,·]+/).map((s) => s.trim()).filter(Boolean);
  const reg = [cu.registered_on && ymd(cu.registered_on), [cu.source, cu.referrer && `(${cu.referrer})`].filter(Boolean).join("")].filter(Boolean).join(" · ") || "-";
  const pay = c.perms.pay && c.pay_sum;
  return (
    <>
      {/* PC */}
      <div className="two gpc">
        <div className="box"><div className="bh">기본 정보<button onClick={() => go("call")} title="고객 정보 수정은 준비 중이에요" disabled style={{ opacity: .5 }}>수정</button></div>
          <div className="mini2">
            <label>담당</label><span>{cu.manager || "-"}</span>
            <label>등록</label><span>{reg}</span>
            <label>방문</label><span>{visitN}회{cu.last_visit_on ? ` · 최근 ${md(cu.last_visit_on)}` : ""}</span>
            <label>동의</label><span>{cu.ad_consent ? `광고 수신 ${cu.ad_consent}` : "-"}</span>
          </div></div>
        <div className="box"><div className="bh">매출 · 결제<button onClick={() => go("mem")}>회원권·결제 탭 ›</button></div>
          {pay ? (
            <div className="mini2">
              <label>누적 결제</label><b>{won(c.pay_sum!.total)}</b>
              <label>최근 결제</label><span>{lastPay ? `${md(lastPay.day)} · ${won(lastPay.amount)}` : c.pay_sum!.last_day ? md(c.pay_sum!.last_day) : "-"}</span>
              <label>미수금</label><span className={c.pay_sum!.unpaid > 0 ? "red" : ""}>{won(c.pay_sum!.unpaid)}</span>
              <label>포인트</label><span className="muted">-</span>
            </div>
          ) : <div className="empty">고객별 매출 권한이 있는 직원만 볼 수 있어요</div>}
        </div>
      </div>
      <div className="two gpc">
        <div className="box"><div className="bh">주간 리포트<button onClick={report}>보내기</button></div>
          <div className="mini2">
            <label>이번 주</label><span><span className="badge">고객 앱 연결 전</span></span>
            <label>지난 주</label><span className="muted">보낸 리포트 없음</span>
          </div></div>
        <div className="box"><div className="bh">라운지 · 이번 달</div>
          <div className="mini2">
            <label>참여</label><span className="muted">고객 앱 연결 전</span>
            <label>응원</label><span className="muted">-</span>
            <label>상태</label><span className="muted">-</span>
          </div></div>
      </div>
      <div className="box gpc"><div className="bh">최근 상담·해피콜<button onClick={() => go("call")}>상담·해피콜 탭 ›</button></div>
        {calls.slice(0, 3).map((r, i) => (
          <div key={i} className="li"><span className="d">{md(r.day)}</span><span className="badge">{r.kind}</span><span className="tx">{[r.text, r.by].filter(Boolean).join(" · ") || "-"}</span><span className="sp" /><CallLine r={r} /></div>
        ))}
        {calls.length === 0 && <div className="empty">기록이 아직 없어요</div>}
      </div>

      {/* 모바일 M01 */}
      <div className="mbox gm blk"><div className="bh">담당 · 건강<button disabled style={{ opacity: .5 }}>수정</button></div>
        <div className="mrow">
          <label>담당</label><span>{cu.manager || "-"}</span>
          {c.perms.health && <><label>건강</label><span>{flags.map((f) => <span key={f} className="badge warn" style={{ marginRight: 4 }}>{f}</span>)}{c.health?.note || (flags.length ? "" : "-")}</span></>}
          <label>목표</label><span className="muted">정하지 않았어요</span>
        </div></div>
      <div className="mbox gm blk"><div className="bh">결제 · 리포트<button onClick={() => go("mem")}>회원권·결제 ›</button></div>
        <div className="mrow">
          <label>누적 결제</label>{pay ? <b>{won(c.pay_sum!.total)}</b> : <span className="muted">권한 없음</span>}
          <label>주간 리포트</label><span><span className="badge">고객 앱 연결 전</span></span>
        </div></div>
      <div className="mbox gm blk"><div className="bh">라운지 · 식단 · 운동<span className="muted" style={{ fontSize: 12 }}>이번 달</span></div>
        <div className="mrow">
          <label>라운지</label><span className="muted">고객 앱 연결 전</span>
          <label>식단</label><span className="muted">-</span>
          <label>자동</label><span className="muted">걸음 · 수면 앱 연결 전</span>
        </div></div>
      <button className="fold gm" onClick={() => setMore(!more)}><b>정보 더보기</b><span>{more ? "" : "등록 · 방문 · 동의"}</span><span className="sp" /><span>{more ? "▴" : "▾"}</span></button>
      {more && (
        <div className="mbox gm blk"><div className="mrow">
          <label>등록</label><span>{reg}</span>
          <label>방문</label><span>{visitN}회{cu.last_visit_on ? ` · 최근 ${md(cu.last_visit_on)}` : ""}</span>
          <label>동의</label><span>{cu.ad_consent ? `광고 수신 ${cu.ad_consent}` : "-"}</span>
          <label>고객번호</label><span>{cu.customer_no || "-"}</span>
        </div></div>
      )}
    </>
  );
}

/* 관리기록 — P13 (관리 내역 + 관리 메모 한곳에) */
function VisitsTab({ c, memos, reload, setToast }: { c: Chart; memos: Memo[]; reload: () => Promise<void>; setToast: (s: string) => void }) {
  const [f, setF] = useState<"all" | "v" | "m">("all");
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  type R = { sort: string; d: string; prog: string; pc: string; who: string; tx: string; st: string; sc: string; kind: "v" | "m" };
  const rows: R[] = [
    ...c.visits.map((v): R => {
      const st = v.status === "예약" ? "예약 확정" : v.status === "방문" ? "완료" : v.status;
      const sc = v.status === "예약" ? "line" : v.status === "노쇼" ? "noshow" : v.status === "취소" ? "cancel" : "ok";
      const prog = v.program ?? (v.src === "import" ? "방문" : "관리");
      return { sort: `${v.day} ${v.time ?? "00:00"}`, d: `${mdw(v.day)}${v.time ? ` ${v.time}` : ""}`, prog, pc: pcolor(prog), who: v.staff ?? "", tx: v.cancel_reason ?? v.memo ?? (v.src === "import" ? "이전 기록" : ""), st, sc, kind: "v" };
    }),
    ...memos.map((m): R => ({ sort: `${kstDay(m.at)} ${kstTime(m.at)}`, d: `${mdw(kstDay(m.at))} 메모`, prog: "메모", pc: "p-slate", who: m.author ?? "", tx: m.body, st: "관리 메모", sc: "", kind: "m" })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));
  const vN = rows.filter((r) => r.kind === "v").length;
  const list = rows.filter((r) => f === "all" || r.kind === f);
  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("customer_memo_add", { p_branch: c.customer.branch, p_key: c.customer.key, p_body: body.trim() });
    setBusy(false);
    if (error) return setToast(error.message.includes("FORBIDDEN") ? "메모를 쓸 권한이 없어요" : error.message);
    setBody(""); setAdding(false); setToast("관리 메모를 남겼어요."); await reload();
  };
  return (
    <>
      <div className="gbar">
        <div className="seg">
          <button className={f === "all" ? "on" : ""} onClick={() => setF("all")}>전체 {rows.length}</button>
          <button className={f === "v" ? "on" : ""} onClick={() => setF("v")}>관리 내역 {vN}</button>
          <button className={f === "m" ? "on" : ""} onClick={() => setF("m")}>관리 메모 {memos.length}</button>
        </div>
        <span className="sp" />
        {c.perms.memo && <button className="btn sm" onClick={() => setAdding(!adding)}>+ 메모</button>}
      </div>
      {adding && (
        <div className="memo-add">
          <input className="inp" autoFocus maxLength={2000} placeholder="직원끼리 알아야 할 내용 (연락 선호 시간, 주의할 점 등)" value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) save(); }} />
          <button className="btn p" disabled={busy || !body.trim()} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      )}
      <div className="recs">
        {list.map((r, i) => (
          <div key={i} className="rec">
            <span className="d">{r.d}</span><span className={`pb ${r.pc}`}>{r.prog}</span><span className="who">{r.who}</span>
            <span className="tx">{r.tx}</span><span className={`badge ${r.sc}`}>{r.st}</span>
          </div>
        ))}
        {list.length === 0 && <div className="empty" style={{ borderTop: 0 }}>기록이 없어요</div>}
      </div>
    </>
  );
}

/* 회원권·결제 — P14 */
function MemTab({ c, soon }: { c: Chart; soon: (w: string) => void }) {
  const sp = useSearchParams();
  const [f, setF] = useState<"ms" | "pay" | "pt" | "unpaid" | "goods">("ms");
  const [ended, setEnded] = useState(false);
  const pays = c.payments ?? [];
  const unpaid = c.pay_sum?.unpaid ?? 0;
  const goods = pays.filter((p) => /제품/.test(p.type ?? ""));
  const active = c.memberships.filter((m) => m.status === "사용중");
  const list = ended ? c.memberships : active;
  const sellHref = `/membership?sell=1&b=${encodeURIComponent(sp.get("b") ?? "")}&k=${encodeURIComponent(sp.get("k") ?? "")}`;
  const payRows = (rows: Payment[]) => !c.perms.pay ? <div className="empty">결제 내역은 고객별 매출 권한이 있는 직원만 볼 수 있어요</div> : (
    <div className="ptable">
      <div className="pr hd"><span>날짜</span><span>내용</span><span className="x">결제수단</span><span className="n">금액</span><span className="x">입력</span></div>
      {rows.map((p, i) => (
        <div key={i} className="pr">
          <span>{md(p.day)}</span>
          <span>{p.product ?? p.type ?? "-"}{p.refund && <span className="badge em" style={{ marginLeft: 6 }}>환불</span>}{p.unpaid ? <span className="badge warn" style={{ marginLeft: 6 }}>미수 {won(p.unpaid)}</span> : null}</span>
          <span className="x">{p.method ?? "-"}</span>
          <span className={`n ${p.refund ? "red" : ""}`}>{won(p.refund ? -Math.abs(p.amount) : p.amount)}</span>
          <span className="x muted">{p.by ?? "-"}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="empty">내역이 아직 없어요</div>}
    </div>
  );
  return (
    <>
      <div className="gbar">
        <div className="seg">
          <button className={f === "ms" ? "on" : ""} onClick={() => setF("ms")}>회원권 {active.length}</button>
          <button className={f === "pay" ? "on" : ""} onClick={() => setF("pay")}>결제 내역</button>
          <button className={f === "pt" ? "on" : ""} onClick={() => setF("pt")}>포인트</button>
          <button className={f === "unpaid" ? "on" : ""} onClick={() => setF("unpaid")}>미수금 {c.perms.pay ? won(unpaid) : ""}</button>
          <button className={f === "goods" ? "on" : ""} onClick={() => setF("goods")}>제품 {goods.length}</button>
        </div>
        <span className="sp" />
        <Link className="btn sm" href={sellHref}>회원권 판매</Link>
      </div>
      {f === "ms" && (
        <div className="mcards">
          {list.map((m) => {
            const x = memLine(m, "card");
            const ratio = x.r ? (x.r.total ? x.r.left / x.r.total : 0) : m.kind === "금액" && m.amount_total ? (m.amount_left ?? 0) / m.amount_total : m.end_on ? Math.max(0, Math.min(1, daysBetween(today(), m.end_on) / Math.max(1, daysBetween(m.start_on, m.end_on)))) : 1;
            return (
              <div key={m.id} className={`mcard2 ${m.status !== "사용중" ? "gone" : ""}`}>
                <div className="r"><b>{m.name}</b><span style={{ color: "var(--ink-3)" }}>{x.main}{x.days != null ? ` · ${x.days}일` : ""}</span>{m.shared && <span className="badge warn">공유받음</span>}<span className="sp" /><Expiry m={m} /></div>
                <div className="r"><div className="pbar"><i style={{ width: `${Math.round((1 - ratio) * 100)}%` }} /></div>
                  <span className="sold">{m.sold_at ? `${ymd2(kstDay(m.sold_at))} 판매` : `${ymd2(m.start_on)} 시작`}{c.perms.pay && m.price ? ` · ${won(m.price)}` : ""}</span>
                  <button className="btn sm t" onClick={() => soon("회원권 조정")}>조정</button>
                  <button className="btn sm t" onClick={() => soon("회원권 공유")}>공유</button>
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div className="mcard2 muted" style={{ textAlign: "center" }}>쓰는 회원권이 없어요</div>}
          {c.memberships.length > active.length && <button className="btn sm t" style={{ alignSelf: "flex-start" }} onClick={() => setEnded(!ended)}>{ended ? "쓰는 것만 보기" : `끝난 회원권 ${c.memberships.length - active.length}개 보기`}</button>}
        </div>
      )}
      {f === "pay" && payRows(pays)}
      {f === "unpaid" && payRows(pays.filter((p) => (p.unpaid ?? 0) > 0))}
      {f === "goods" && payRows(goods)}
      {f === "pt" && <div className="ptable"><div className="empty" style={{ borderTop: 0 }}>포인트 기록이 아직 없어요</div></div>}
    </>
  );
}

/* 상담·해피콜 — P08 · M02 */
function CallTab({ c, hc, calls, reload }: { c: Chart; hc: Hc | null; calls: CallRec[]; reload: () => Promise<void> }) {
  const [kind, setKind] = useState<string>("해피콜");
  const [result, setResult] = useState("");
  const [said, setSaid] = useState("");
  const [next, setNext] = useState("");
  const [day, setDay] = useState(addDays(today(), 1));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState<"all" | "해피콜" | "상담">("all");
  const list = calls.filter((r) => f === "all" || (f === "해피콜" ? r.kind === "해피콜" : r.kind !== "해피콜"));

  async function save() {
    if (!result) return setMsg("결과를 골라 주세요");
    setBusy(true); setMsg("");
    const body = `[${kind}·${result}] ${said.trim() ? `"${said.trim().replace(/^"|"$/g, "")}"` : ""}${next.trim() ? `${said.trim() ? " → " : ""}${next.trim()}` : ""}${next.trim() && day ? ` (${md(day)})` : ""}`.trim();
    const m = await sb.rpc("customer_memo_add", { p_branch: c.customer.branch, p_key: c.customer.key, p_body: body });
    if (m.error) { setBusy(false); return setMsg(m.error.message.includes("FORBIDDEN") ? "기록할 권한이 없어요" : m.error.message); }
    if (kind === "해피콜" && hc) {
      const r = await sb.rpc("happycall_log", {
        p_item: hc.item_id, p_customer_key: hc.customer_key, p_branch: hc.branch, p_kind: hc.kind,
        p_result: HC_RESULT[result], p_note: [said.trim(), next.trim()].filter(Boolean).join(" → "),
        p_follow_day: result === "다시 연락" || result === "부재중" ? day || null : null,
      });
      if (r.error) setMsg("기록은 남겼지만 해피콜 목록 처리는 못 했어요 (권한 확인)");
    }
    setBusy(false); setResult(""); setSaid(""); setNext("");
    await reload();
  }

  return (
    <>
      {c.perms.memo ? (
        <div className="box" style={{ padding: 12 }}>
          <div className="frm">
            <label>종류</label>
            <div className="seg">{KINDS.map((k) => <button key={k} className={`${kind === k ? "on" : ""} ${k === "체험 후" ? "gpc" : ""}`} onClick={() => setKind(k)}>{k}</button>)}</div>
            <label>결과</label>
            <div className="chips">{RESULTS.map((r) => <button key={r} className={`chip ${result === r ? "on" : ""}`} onClick={() => setResult(r)}>{r}</button>)}</div>
            <label>고객 말</label>
            <textarea className="inp said" rows={1} placeholder="고객이 한 말을 그대로 적어요" value={said} onChange={(e) => setSaid(e.target.value)} maxLength={300} />
            <label>다음 행동</label>
            <div className="nx">
              <input className="inp" placeholder="예: 재등록 혜택 안내 다시 연락" value={next} onChange={(e) => setNext(e.target.value)} maxLength={200} />
              <label className="inp gdate">{day ? mdw(day) : "날짜"}<input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="다음 연락일" /></label>
              <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
            </div>
            {(msg || (kind === "해피콜" && hc)) && <div className="help" style={{ color: msg ? "var(--red)" : undefined }}>{msg || `해피콜 대상이에요 (${hc!.reason}). 저장하면 해피콜 목록에서도 처리돼요.`}</div>}
          </div>
        </div>
      ) : <div className="box"><div className="empty" style={{ borderTop: 0 }}>상담 기록은 고객 편집 권한이 있는 직원만 쓸 수 있어요</div></div>}
      <div className="hist">
        <div className="sech">기록 <span className="meta">해피콜 · 상담일지 · 운동일지 상담 한곳에</span><span className="sp" />
          <span className="seg gpc">{(["all", "해피콜", "상담"] as const).map((k) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{k === "all" ? "전체" : k}</button>)}</span>
        </div>
        {list.map((r, i) => (
          <div key={i} className="hi"><span className="d">{md(r.day)}</span><span className="badge k">{r.kind}</span><span className="tx">{[r.text, r.by].filter(Boolean).join(" · ") || "-"}</span><CallLine r={r} /></div>
        ))}
        {list.length === 0 && <div className="empty">기록이 아직 없어요</div>}
      </div>
    </>
  );
}

/* 한눈에 — 고객 앱 기록이 없을 때 P33 · M22 */
function WeekTab({ c, report, go }: { c: Chart; report: () => void; go: (t: TabK) => void }) {
  const t = today();
  const mon = monday(t);
  const [start, setStart] = useState(mon);
  return (
    <div className="gb full"><div className="main2" style={{ gap: 0 }}>
      <div className="gweek gpc">
        <button className="ib" onClick={() => setStart(addDays(start, -7))} aria-label="지난주">‹</button>
        <span className="d">{mdw(start)} – {mdw(addDays(start, 6))}</span>
        <button className="ib" onClick={() => setStart(addDays(start, 7))} aria-label="다음 주">›</button>
        <button className="btn sm" onClick={() => setStart(mon)}>이번 주</button>
        <span className="sp" /><span className="nt">오늘 {mdw(t)} · 기록은 고객 앱에서 올라와요</span>
      </div>
      <div className="empts">
        <div className="empt"><b>고객 앱 연결 전이에요</b><p>식단 사진 · 수분 · 수면 · 걸음은 고객 앱을 연결하면 매일 자동으로 들어와요.</p><button className="btn sm p" onClick={report}>앱 연결 문자 보내기</button></div>
        <div className="empt"><b>몸의 변화 기록이 없어요</b><p>첫 방문 때 체중과 허리를 재 두면 7일 평균과 월 변화가 이 칸에 쌓여요.</p><button className="btn sm" onClick={() => go("body")}>첫 측정 기록</button></div>
        <div className="empt gpc"><b>라인 챌린지 참여 전</b><p>앱 동의 3단계를 마치면 이번 달 챌린지에 넣을 수 있어요. 다른 고객과 비교하지 않아요.</p><button className="btn sm" onClick={() => go("chal")}>챌린지 안내 보기</button></div>
      </div>
      {c.visits.length === 0 && <div className="gnote">관리기록도 아직 없어요 · 첫 방문 뒤 관리기록 탭에 쌓여요</div>}
    </div></div>
  );
}

/* 식단 — P27 · M18 (기록 없음) */
function DietTab() {
  const t = today();
  const mon = monday(t);
  const [start, setStart] = useState(mon);
  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(start, i)), [start]);
  return (
    <>
      <div className="gweek gpc">
        <button className="ib" onClick={() => setStart(addDays(start, -7))} aria-label="지난주">‹</button>
        <span className="d">{mdw(start)} – {mdw(addDays(start, 6))}</span>
        <button className="ib" onClick={() => setStart(addDays(start, 7))} aria-label="다음 주">›</button>
        <button className="btn sm" onClick={() => setStart(mon)}>이번 주</button>
        <span className="sp" /><span className="nt">오늘 {mdw(t)} · 기록은 고객 앱에서 올라와요</span>
      </div>
      <div className="gnote gpc">직원이 사진을 보고 확인해요 · 단백질 미션은 없어요 · 빠진 날은 회색 · 고객 앱이 연결되면 사진이 쌓여요</div>
      <div className="gnote gm" style={{ paddingTop: 8 }}>직원이 사진을 보고 확인 · 단백질 미션 없음 · 고객 앱 연결 전</div>
      <div className="dietg">
        {days.map((d) => (
          <div key={d} className={`dietcol ${d === t ? "td" : ""} ${d > t ? "fut" : ""}`}>
            <div className="dh"><span className="gpc" style={{ color: "inherit", fontSize: 13, fontWeight: 600 }}>{Number(d.slice(8))} {dw(d)}</span><b className="gm">{Number(d.slice(8))} ({dw(d)})</b><span>없음</span></div>
            <div className="meal empty">{d > t ? "아직 없음" : "기록 없음"}</div>
          </div>
        ))}
        {days.some((d) => d > t) && <div className="dfut gm">{Number(addDays(t, 1).slice(8))}일 이후는 아직 없어요</div>}
      </div>
    </>
  );
}

/* 챌린지 — P28 (참여 전: 같은 칸에 빈 값) */
function ChalTab() {
  const t = today();
  const y = t.slice(0, 7);
  const m = Number(t.slice(5, 7));
  const n = 28; // 라인 챌린지는 28일 (시안 11.01 – 11.28)
  const td = Number(t.slice(8));
  return (
    <>
      <div className="gweek">
        <button className="ib" disabled aria-label="지난 챌린지">‹</button>
        <span className="d">라인 챌린지 · {m}월 ({md(`${y}-01`)} – {md(`${y}-${n}`)})</span>
        <button className="ib" disabled aria-label="다음 챌린지">›</button>
        <button className="btn sm">이번 챌린지</button>
        <span className="sp" /><span className="nt">고객끼리 비교하거나 순위는 두지 않아요</span>
      </div>
      <div className="chbox">
        <div className="ccard">
          <h3>진행</h3>
          <div className="c3">
            <div><label>참여 전</label><b>{n}일 중</b></div>
            <div><label>이번 주 미션</label><b>- / 7일</b></div>
            <div><label>누적 달성</label><b>-</b></div>
          </div>
          <div className="prog"><i style={{ width: 0 }} /></div>
          <div className="cnote">날짜별 달성 · 빈 날·앞날은 회색 · 앱 동의 3단계를 마치면 참여해요</div>
          <div className="mdots">{[...Array(n)].map((_, i) => <em key={i} className={i + 1 === td ? "td" : ""}>{i + 1}</em>)}</div>
        </div>
        <div className="ccard">
          <h3>오늘의 미션 · {mdw(t)}</h3>
          {["식단 사진", "걸음 8,000보", "수면 7시간", "수분", "운동 · 주 4회"].map((k) => <div key={k} className="mis"><label>{k}</label><span className="muted">참여 전</span></div>)}
          <div className="cnote" style={{ marginTop: 12 }}>빠진 날은 회색으로만 두어요. 빨간 표시는 직원이 확인할 사진처럼 손볼 일에만 써요.</div>
          <div className="cmt"><b>담당 코멘트</b><div>참여를 시작하면 담당 직원이 코멘트를 남길 수 있어요.</div></div>
        </div>
      </div>
    </>
  );
}

/* 몸의 변화 — P09 (기록 없음) */
function BodyTab({ soon }: { soon: (w: string) => void }) {
  return (
    <>
      <div className="k4">
        <div><label>체중 · 7일 평균</label><b>-</b><span className="s">기록 없음</span></div>
        <div><label>허리 · 월 1회 (선택)</label><b>-</b><span className="s">기록 없음</span></div>
        <div><label>체지방량</label><b>-</b><span className="s">인바디 기록 없음</span></div>
        <div><label>골격근량</label><b>-</b><span className="s">인바디 기록 없음</span></div>
      </div>
      <div className="two">
        <div className="box"><div className="bh">체중 7일 평균 · 허리 (월 1회)</div>
          <div className="ph-empty">측정 기록이 아직 없어요<span className="hint">기록이 쌓이면 달마다 선으로 보여요</span></div></div>
        <div className="box"><div className="bh">눈바디 · 전후 사진<button onClick={() => soon("사진 올리기")}>올리기</button></div>
          <div className="ph-empty">사진이 아직 없어요<span className="hint">본인 · 직원만 볼 수 있게 올려요</span></div></div>
      </div>
      <div className="hint">측정: 체중은 매일 → 7일 평균 자동 · 허리 월 1회(선택) · 인바디 2~4주 · 다른 고객과 비교하지 않아요</div>
    </>
  );
}

/* 운동일지 — P16 (센터 방문은 관리기록에서, 본인 기록은 고객 앱 연결 후) */
function ExTab({ c, soon }: { c: Chart; soon: (w: string) => void }) {
  const t = today();
  const mon = monday(t);
  const done = c.visits.filter((v) => v.status === "완료" || v.status === "방문");
  const week = done.filter((v) => v.day >= mon && v.day <= t).length;
  return (
    <>
      <div className="k4">
        <div><label>이번 주 운동</label><b>{week}<small>회</small></b><span className="s">센터 방문 기준</span></div>
        <div><label>걸음 · 어제</label><b>-</b><span className="s">앱 연결 전</span></div>
        <div><label>수면 · 어젯밤</label><b>-</b><span className="s">앱 연결 전</span></div>
        <div><label>최근 운동일지</label><b style={{ fontSize: 16, lineHeight: "24px" }}>{done[0] ? mdw(done[0].day) : "-"}</b><span className="s">{done[0]?.program ?? "기록 없음"}</span></div>
      </div>
      <div className="hist">
        <div className="sech">운동일지<span className="meta">운동일지 상담은 상담·해피콜 탭에 함께 보여요</span><span className="sp" /><button className="btn sm" onClick={() => soon("운동일지 쓰기")}>+ 기록</button></div>
        {done.slice(0, 20).map((v, i) => (
          <div key={i} className="rec ex">
            <span className="d">{mdw(v.day)}</span><span className="tx">{[v.program ?? "방문", "센터"].join(" · ")}</span><span className="who">{v.staff ?? ""}</span><span className="badge ok">센터 운동</span>
          </div>
        ))}
        {done.length === 0 && <div className="empty">운동 기록이 아직 없어요</div>}
      </div>
    </>
  );
}

function SmsDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="drawer" style={{ zIndex: 41 }}>
        <div className="hd">문자 · {name}님</div>
        <div className="bd">
          <p style={{ marginTop: 0, fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
            한 사람에게 보내는 문자는 여기서만 써요. 발송 업체 연결 전이라 지금은 문구를 복사해서 보내 주세요.
          </p>
          <textarea className="inp" style={{ height: 200, padding: 12, resize: "vertical" }} value={text} onChange={(e) => { setText(e.target.value); setCopied(false); }} placeholder="보낼 내용" />
          <div className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 4, textAlign: "right" }}>{new Blob([text]).size}바이트{new Blob([text]).size > 90 ? " · 장문" : ""}</div>
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>닫기</button>
          <button className="btn p" disabled={!text.trim()} onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "복사했어요" : "문구 복사"}</button>
        </div>
      </div>
    </>
  );
}

export default function Page() {
  return <Suspense fallback={null}><ChartView /></Suspense>;
}
