"use client";
import "../customers.css";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
const ago = (d: string | null) => {
  if (!d) return "";
  const n = daysBetween(d, today());
  return n === 0 ? "오늘" : n > 0 ? `${n}일전` : `${-n}일후`;
};
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${d.slice(5, 7)}.${d.slice(8, 10)}`;
const mdw = (d: string) => `${md(d)} (${DOW[new Date(d + "T00:00:00Z").getUTCDay()]})`;
const ymd2 = (d: string) => d.slice(2).replaceAll("-", ".");
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 36e5).toISOString().slice(0, 10);
const dt = (iso: string) => { const k = new Date(Date.parse(iso) + 9 * 36e5).toISOString(); return `${k.slice(0, 10)} ${k.slice(11, 16)}`; };
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const STATUS_BADGE: Record<string, string> = { 완료: "ok", 방문: "ok", 예약: "", 노쇼: "warn", 취소: "em" };

function SellLink() {
  const sp = useSearchParams();
  return <Link href={`/membership?sell=1&b=${encodeURIComponent(sp.get("b") ?? "")}&k=${encodeURIComponent(sp.get("k") ?? "")}`}>회원권 판매</Link>;
}

function remainCount(m: Membership) {
  const t = m.items.reduce((s, i) => s + (i.total ?? 0) + (i.service ?? 0), 0);
  const u = m.items.reduce((s, i) => s + (i.used ?? 0), 0);
  return m.items.length ? Math.max(t - u, 0) : null;
}
function remain(m: Membership) {
  if (m.kind === "회차") {
    const r = remainCount(m);
    const t = m.items.reduce((s, i) => s + (i.total ?? 0) + (i.service ?? 0), 0);
    return r != null ? `잔여 ${r}회 / ${t}회` : "회차 정보 없음";
  }
  if (m.kind === "금액") return m.amount_left != null ? `잔액 ${won(m.amount_left)}` : "금액권";
  return m.end_on ? `남은 ${Math.max(daysBetween(today(), m.end_on), 0)}일` : "기간권";
}

// 상담·해피콜 기록은 고객 메모에 "[종류·결과] 내용" 으로 남겨요 (새 테이블 없이)
const KINDS = ["해피콜", "상담", "재등록", "노쇼 후", "체험 후"] as const;
const RESULTS = ["통화·상담 완료", "부재중", "예약 완료", "등록 완료", "다시 연락", "보류", "거절"] as const;
// happycall_log 가 아는 결과로 바꿔요
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
const resClass = (r: string) => (r === "다시 연락" ? "again" : ["부재중", "보류", "거절", "해당없음"].includes(r) ? "no" : "");

const TABS = [
  { k: "week", l: "한눈에", m: false }, { k: "info", l: "회원정보", m: true }, { k: "call", l: "상담·해피콜", m: true },
  { k: "visits", l: "관리기록", m: true }, { k: "body", l: "몸의 변화", m: false }, { k: "diet", l: "식단·인증", m: false },
  { k: "mem", l: "회원권·결제", m: false }, { k: "memo", l: "메모", m: false },
] as const;
type TabK = (typeof TABS)[number]["k"];

function ChartView() {
  const sp = useSearchParams();
  const branch = sp.get("b") ?? "";
  const key = sp.get("k") ?? "";
  const t0 = sp.get("tab");
  const [c, setC] = useState<Chart | null | undefined>(undefined);
  const [hc, setHc] = useState<Hc[]>([]);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabK>(TABS.some((t) => t.k === t0) ? (t0 as TabK) : "info");
  const [moreTabs, setMoreTabs] = useState(false);
  const [sms, setSms] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("customer_chart", { p_branch: branch, p_key: key });
    if (error) { setErr(error.message.includes("FORBIDDEN") ? "이 고객 차트를 볼 권한이 없어요" : error.message); setC(null); return; }
    setErr(""); setC((data ?? null) as Chart | null);
    // 해피콜 대상인지 (권한 없으면 빈 목록)
    const h = await sb.rpc("happycall_list", { p_branch: branch });
    setHc(((h.data ?? []) as Hc[]).filter((r) => r.customer_key === key && r.branch === branch));
  }, [branch, key]);
  useEffect(() => { load(); }, [load]);

  if (c === undefined) return <div className="page" style={{ color: "var(--ink-3)" }}>불러오는 중…</div>;
  if (!c) return (
    <>
      <header className="top"><Link href="/customers" className="c-back">‹ 고객 목록</Link></header>
      <div className="page"><p style={{ color: err ? "var(--red)" : "var(--ink-3)" }}>{err || "고객을 찾지 못했어요"}</p></div>
    </>
  );

  const cu = c.customer;
  const visitCount = c.visits.filter((v) => v.status === "완료" || v.status === "방문").length;
  const tags = (cu.tags ?? "").split(/[,#]+/).map((s) => s.trim()).filter(Boolean);
  const calls = parseCalls(c.memos);
  const lastHc = hc.find((h) => h.last_called_at);
  if (lastHc?.last_called_at && !calls.some((r) => r.kind === "해피콜" && r.day === kstDay(lastHc.last_called_at!))) {
    calls.push({ day: kstDay(lastHc.last_called_at), kind: "해피콜", result: HC_BACK[lastHc.last_result ?? ""] ?? lastHc.last_result ?? "", text: lastHc.last_note ?? "", by: lastHc.last_handler ?? "", follow: null });
    calls.sort((a, b) => b.day.localeCompare(a.day));
  }
  const plainMemos = c.memos.filter((m) => !CALL_RE.test(m.body));
  const count: Partial<Record<TabK, number>> = { call: calls.length, visits: c.visits.length, mem: c.memberships.length, memo: plainMemos.length };
  const canCall = !!c.perms.phone || hc.length > 0;
  const go = (t: TabK) => { setTab(t); setMoreTabs(false); };

  async function call() {
    setMsg("");
    const { data, error } = await sb.rpc("customer_phone_reveal", { p_branch: cu.branch, p_key: cu.key, p_purpose: "call" });
    if (error) return setMsg(error.message.includes("DAILY_LIMIT") ? "오늘 볼 수 있는 연락처 수를 넘었어요" : "전화 걸 권한이 없어요");
    const n = String(data ?? "").replace(/\D/g, "");
    if (!n) return setMsg("연락처가 없어요");
    window.location.href = `tel:${n}`;
  }

  const actions = (
    <>
      {canCall && <button className="btn call" onClick={call}>통화</button>}
      {c.perms.sms && <button className="btn" onClick={() => setSms(true)}>문자</button>}
      {c.perms.reserve && <Link className="btn p" href="/schedule">예약 잡기</Link>}
    </>
  );
  const curMore = TABS.find((t) => t.k === tab && !t.m);

  return (
    <div className="c-chart">
      <header className="top">
        <Link href="/customers" className="c-back c-pc-only">‹ 고객 목록</Link>
        <Link href="/customers" className="c-m-only" aria-label="고객 목록" style={{ fontSize: 20, padding: "0 4px" }}>‹</Link>
        <h1>고객 차트</h1>
        <span className="sub">고객 › {cu.name}</span>
      </header>
      <div className="page">
        {/* 머리 (P07 · P26) */}
        <div className="c-head">
          <div className="c-av">{cu.name.slice(0, 1)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="c-name">
              <b>{cu.name}</b>
              {tags.map((t) => <span key={t} className="badge">{t}</span>)}
              {cu.source && !tags.includes(cu.source) && <span className="badge">{cu.source}</span>}
            </div>
            <div className="c-subl num">
              {[cu.customer_no && `고객번호 ${cu.customer_no}`, cu.phone, cu.branch].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="c-right">{actions}</div>
        </div>
        {msg && <p style={{ color: "var(--red)", margin: "-8px 0 12px", fontSize: "var(--fs-sm)" }}>{msg}</p>}

        {/* 요약 */}
        <div className="c-sum">
          <div><div className="l">최근 방문일</div><div className="v num">{cu.last_visit_on ?? "-"} {cu.last_visit_on && <small>({ago(cu.last_visit_on)})</small>}</div></div>
          <div><div className="l">방문</div><div className="v num">{visitCount}<small>회</small></div></div>
          <div><div className="l">노쇼 · 예약취소</div>
            <div className="tags"><span className="tag ns">노쇼 {c.counts.noshow}</span><span className="tag cc">취소 {c.counts.cancel}</span></div></div>
          <div><div className="l">다음 예약</div><div className="v num">{c.next ? `${mdw(c.next.day)} ${c.next.time}` : "-"}</div></div>
        </div>

        <div className="c-split">
          <div className="card c-pc-only"><CareCard c={c} /></div>
          <div className="card c-msw"><Memberships c={c} /></div>
        </div>

        {/* 탭 */}
        <nav className="c-ctabs">
          {TABS.map((t) => (
            <button key={t.k} className={`${tab === t.k ? "on" : ""} ${t.m ? "" : "x"}`} onClick={() => go(t.k)}>
              {t.l}{count[t.k] != null && <span className="n num">{count[t.k]}</span>}
            </button>
          ))}
          <div className="more">
            <button className={curMore ? "on" : ""} onClick={() => setMoreTabs(!moreTabs)}>{curMore ? curMore.l : "더보기"} ▾</button>
            {moreTabs && (
              <div className="c-pop">
                {TABS.filter((t) => !t.m).map((t) => <button key={t.k} onClick={() => go(t.k)}>{t.l}{count[t.k] != null ? ` ${count[t.k]}` : ""}</button>)}
              </div>
            )}
          </div>
        </nav>

        {tab === "week" && <WeekTab visits={c.visits} />}
        {tab === "info" && <InfoTab c={c} calls={calls} memos={plainMemos} go={go} />}
        {tab === "call" && <CallTab c={c} hc={hc[0] ?? null} calls={calls} reload={load} />}
        {tab === "visits" && <VisitsTab visits={c.visits} />}
        {tab === "body" && <BodyTab />}
        {tab === "diet" && <div className="card"><div className="c-ph">고객 앱에서 올린 식단·인증이 아직 없어요<span className="c-muted">고객 앱이 연결되면 날짜별로 여기에 쌓여요</span></div></div>}
        {tab === "mem" && <MembershipTab c={c} />}
        {tab === "memo" && <MemoTab c={c} memos={plainMemos} reload={load} />}

        <div className="c-foot num">
          {[cu.registered_on && `최초 등록 ${ymd2(cu.registered_on)}`, [cu.source, cu.referrer && `(${cu.referrer})`].filter(Boolean).join("")].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="c-mbar">
        <button className="btn" disabled={!c.perms.sms} onClick={() => setSms(true)}>문자</button>
        {c.perms.reserve ? <Link className="btn p" href="/schedule">예약 잡기</Link> : <button className="btn p" disabled>예약 잡기</button>}
      </div>
      {sms && <SmsDrawer name={cu.name} onClose={() => setSms(false)} />}
    </div>
  );
}

function CareCard({ c }: { c: Chart }) {
  const flags = (c.health?.flags ?? "").split(/[,·]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <div className="c-cardhd"><h3>담당 · 건강</h3></div>
      <div className="c-kv"><span>담당</span><span><b>{c.customer.manager || "-"}</b></span></div>
      {c.perms.health && (
        <div className="c-kv"><span>건강 특이사항</span>
          <span>{flags.map((f) => <span key={f} className="c-flag">{f}</span>)}{c.health?.note || (flags.length ? "" : "등록된 내용이 없어요")}</span></div>
      )}
      <div className="c-kv"><span>목표</span><span className="c-muted">-</span></div>
      <div className="c-kv"><span>유입</span><span>{[c.customer.source, c.customer.source_detail].filter(Boolean).join(" · ") || "-"}{c.customer.referrer && ` · 소개 ${c.customer.referrer}`}</span></div>
    </>
  );
}

function Memberships({ c }: { c: Chart }) {
  const active = c.memberships.filter((m) => m.status === "사용중");
  const ended = c.memberships.filter((m) => m.status !== "사용중").slice(0, 1);
  const list = [...active, ...ended];
  const t = today();
  const cells = (m: Membership) => {
    const gone = m.status !== "사용중";
    const r = m.kind === "회차" ? remainCount(m) : null;
    const left = m.end_on ? daysBetween(t, m.end_on) : null;
    const soon = !gone && left != null && left <= 7;
    const rem = m.kind === "금액" ? (m.amount_left != null ? `잔액 ${man(m.amount_left)}` : "-")
      : r == null ? "-" : gone ? "-" : r <= 2 ? <span className="c-rem line">잔여 {r}회</span> : `${r}회`;
    const days = gone || left == null ? "-" : <span className={soon ? "red" : ""}>{Math.max(left, 0)}일</span>;
    const exp = !m.end_on ? <span className="c-muted">기한 없음</span>
      : gone ? <span className="c-exp gone">기간만료 {md(m.end_on)}</span>
      : soon ? <span className="c-exp soon">D-{Math.max(left!, 0)} · {md(m.end_on)} 만료</span>
      : <span className="c-exp">{ymd2(m.end_on)} 만료</span>;
    return { gone, rem, days, exp, soon, left };
  };
  return (
    <>
      <div className="c-msh"><h2>보유 회원권</h2><span>잔여 회차 · 남은 일수 따로</span><SellLink /></div>
      {list.length === 0 ? <div className="c-empty">사용 중인 회원권이 없어요</div> : (
        <>
          <table className="c-mst">
            <thead><tr><th>회원권</th><th>잔여 회차</th><th>남은 일수</th><th>만료</th></tr></thead>
            <tbody>
              {list.map((m) => { const x = cells(m); return (
                <tr key={m.id} className={x.gone ? "gone" : ""}><td>{m.name}{m.shared && <span className="badge warn" style={{ marginLeft: 6 }}>공유받음</span>}</td><td>{x.rem}</td><td>{x.days}</td><td>{x.exp}</td></tr>
              ); })}
            </tbody>
          </table>
          <div className="c-msl">
            {list.map((m) => { const x = cells(m); return (
              <div key={m.id} className={x.gone ? "gone" : ""}>
                <b>{m.name}</b>
                {x.gone ? x.exp : <>
                  <span className="m">{x.rem}</span>
                  {x.soon ? x.exp : <span className="m">{x.left != null ? `${Math.max(x.left, 0)}일` : ""}</span>}
                </>}
              </div>
            ); })}
          </div>
        </>
      )}
    </>
  );
}

function InfoTab({ c, calls, memos, go }: { c: Chart; calls: CallRec[]; memos: Memo[]; go: (t: TabK) => void }) {
  const cu = c.customer;
  const lastPay = (c.payments ?? []).find((p) => !p.refund);
  return (
    <>
      <div className="card c-m-only" style={{ marginBottom: "var(--gap)" }}><CareCard c={c} /></div>
      <div className="c-g2">
        <div className="card">
          <div className="c-cardhd"><h3>기본 정보</h3></div>
          <div className="c-kv"><span>고객번호</span><span className="num">{cu.customer_no || "-"}</span></div>
          <div className="c-kv"><span>연락처</span><span className="num">{cu.phone || "-"}</span></div>
          <div className="c-kv"><span>생년월일</span><span className="c-muted">-</span></div>
          <div className="c-kv"><span>등급 · 경로</span><span>{[(cu.tags ?? "").split(/[,#]+/)[0]?.trim(), cu.source].filter(Boolean).join(" · ") || "-"}</span></div>
          <div className="c-kv"><span>최초 등록</span><span className="num">{cu.registered_on || "-"}</span></div>
          <div className="c-kv"><span>동의</span><span>{cu.ad_consent ? `광고 수신 ${cu.ad_consent}` : "-"}</span></div>
        </div>
        <div className="card">
          <div className="c-cardhd"><h3>매출 · 결제</h3>{c.perms.pay && <Link href="/sales">매출 보기</Link>}</div>
          {c.perms.pay && c.pay_sum ? (
            <>
              <div className="c-kv"><span>누적 결제</span><span className="num c-red">{won(c.pay_sum.total)}</span></div>
              <div className="c-kv"><span>최근 결제</span><span className="num">{lastPay ? `${md(lastPay.day)} · ${won(lastPay.amount)}` : c.pay_sum.last_day ?? "-"}</span></div>
              <div className="c-kv"><span>미수금</span><span className="num" style={{ color: c.pay_sum.unpaid > 0 ? "var(--red)" : undefined }}>{won(c.pay_sum.unpaid)}</span></div>
              <div className="c-kv"><span>첫 결제</span><span className="num">{cu.first_payment != null ? `${cu.first_payment_on ? md(cu.first_payment_on) + " · " : ""}${won(cu.first_payment)}` : "-"}</span></div>
            </>
          ) : <div className="c-empty">고객별 매출 권한이 있는 직원만 볼 수 있어요</div>}
        </div>
      </div>
      <div className="c-g3">
        <div className="card">
          <div className="c-cardhd"><h3>최근 관리기록</h3><button onClick={() => go("visits")}>전체</button></div>
          {c.visits.length === 0 && <div className="c-empty">기록이 없어요</div>}
          {c.visits.filter((v) => v.day <= today()).slice(0, 3).map((v, i) => (
            <div key={i} className="c-li">
              <span className="d num">{md(v.day)}</span>
              <span className="c-prg">{(v.program ?? "방문").slice(0, 4)}</span>
              <span className={`t ${v.status === "노쇼" ? "c-ns" : ""}`}>{v.status === "노쇼" || v.status === "취소" ? v.status : v.memo ?? ""}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="c-cardhd"><h3>최근 상담·해피콜</h3><button onClick={() => go("call")}>전체</button></div>
          {calls.length === 0 && <div className="c-empty">기록이 없어요</div>}
          {calls.slice(0, 3).map((r, i) => (
            <div key={i} className="c-li"><span className="d num">{md(r.day)}</span><span className="t">{r.text || r.result}</span></div>
          ))}
        </div>
        <div className="card">
          <div className="c-cardhd"><h3>메모</h3><button onClick={() => go("memo")}>{c.perms.memo ? "쓰기" : "전체"}</button></div>
          {memos.length === 0 && <div className="c-empty">메모가 없어요</div>}
          {memos.slice(0, 3).map((m) => (
            <div key={m.id} className="c-li"><span className="d num">{md(kstDay(m.at))}</span><span className="t">{m.body}</span></div>
          ))}
        </div>
      </div>
    </>
  );
}

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
    // 해피콜 대상이면 해피콜 목록에서도 처리
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
        <div className="card c-form">
          <div className="c-frow"><span>종류</span>
            <div className="seg c-kind">{KINDS.map((k) => <button key={k} className={`${kind === k ? "on" : ""} ${k === "체험 후" ? "x" : ""}`} onClick={() => setKind(k)}>{k}</button>)}</div></div>
          <div className="c-frow"><span>결과</span>
            <div className="c-res">{RESULTS.map((r) => <button key={r} className={`chip ${result === r ? "on" : ""}`} onClick={() => setResult(r)}>{r}</button>)}</div></div>
          <div className="c-frow"><span>고객 말</span>
            <input className="inp" placeholder="고객이 한 말을 그대로 적어요" value={said} onChange={(e) => setSaid(e.target.value)} maxLength={300} /></div>
          <div className="c-frow"><span>다음 행동</span>
            <div className="c-next">
              <input className="inp" placeholder="예: 재등록 혜택 안내 다시 연락" value={next} onChange={(e) => setNext(e.target.value)} maxLength={200} />
              <input className="inp num" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="다음 연락일" />
              <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
            </div></div>
          {(msg || (kind === "해피콜" && hc)) && (
            <div className="c-help" style={{ color: msg ? "var(--red)" : undefined }}>{msg || `해피콜 대상이에요 (${hc!.reason}). 저장하면 해피콜 목록에서도 처리돼요.`}</div>
          )}
        </div>
      ) : <div className="card c-empty">상담 기록은 고객 편집 권한이 있는 직원만 쓸 수 있어요</div>}

      <div className="c-loghd">
        <b>기록</b><span>해피콜 · 상담 한곳에</span>
        <div className="seg">{(["all", "해피콜", "상담"] as const).map((k) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{k === "all" ? "전체" : k}</button>)}</div>
      </div>
      {list.map((r, i) => (
        <div key={i} className="c-log">
          <span className="d">{md(r.day)}</span>
          <span className="kw"><span className="k">{r.kind}</span></span>
          <span>{r.text || "-"}{r.by && <span className="by"> · {r.by}</span>}</span>
          <span className={`r ${resClass(r.result)}`}>{r.result}{r.result === "다시 연락" && r.follow ? ` ${r.follow}` : ""}</span>
        </div>
      ))}
      {list.length === 0 && <div className="c-empty">기록이 아직 없어요</div>}
    </>
  );
}

function WeekTab({ visits }: { visits: Visit[] }) {
  const t = today();
  const mon = addDays(t, -((new Date(t + "T00:00:00Z").getUTCDay() + 6) % 7));
  const [start, setStart] = useState(mon);
  const days = useMemo(() => [...Array(7)].map((_, i) => addDays(start, i)), [start]);
  const ROWS = ["식단 사진", "수분", "수면", "걸음 · 운동", "운동일지", "라인 챌린지", "몸의 변화"];
  const cell = (row: string, d: string) => {
    if (row === "운동일지") {
      const v = visits.filter((x) => x.day === d);
      if (v.length) {
        const x = v[0];
        return <td key={d}><b>{x.status === "예약" ? `예약 ${x.time ?? ""}` : x.status === "완료" || x.status === "방문" ? "센터 방문" : x.status}</b><span>{x.program ?? ""}</span></td>;
      }
    }
    return <td key={d} className="no">{d > t ? "아직" : "-"}</td>;
  };
  return (
    <>
      <div className="c-wk">
        <button className="btn sm" onClick={() => setStart(addDays(start, -7))} aria-label="지난주">‹</button>
        <b className="num">{mdw(days[0])} – {mdw(days[6])}</b>
        <button className="btn sm" onClick={() => setStart(addDays(start, 7))} aria-label="다음 주">›</button>
        {start !== mon && <button className="btn sm" onClick={() => setStart(mon)}>이번 주</button>}
        <span className="note num">오늘 {mdw(t)} · 식단·수면·걸음은 고객 앱 연결 후 보여요</span>
      </div>
      <div className="c-wkg">
        <table>
          <thead><tr><th />{days.map((d) => <th key={d} className={d === t ? "td" : ""}>{Number(d.slice(8))}<small>{DOW[new Date(d + "T00:00:00Z").getUTCDay()]}</small></th>)}</tr></thead>
          <tbody>{ROWS.map((r) => <tr key={r}><td>{r}</td>{days.map((d) => cell(r, d))}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function BodyTab() {
  return (
    <>
      <div className="c-g4">
        {["허리둘레", "체지방량", "골격근량", "체중"].map((k) => (
          <div key={k} className="card c-kpi"><div className="l">{k}</div><div className="v">-</div><div className="s">기록 없음</div></div>
        ))}
      </div>
      <div className="c-body2">
        <div className="card"><div className="c-cardhd"><h3>허리 · 체지방 변화</h3></div>
          <div className="c-ph">측정 기록이 아직 없어요<span className="c-muted">인바디·줄자 기록이 쌓이면 달마다 선으로 보여요</span></div></div>
        <div className="card"><div className="c-cardhd"><h3>눈바디 · 전후 사진</h3><button disabled className="c-muted" title="준비 중이에요">올리기</button></div>
          <div className="c-ph">사진이 아직 없어요<span className="c-muted">본인 · 직원만 볼 수 있게 올릴 수 있어요 (준비 중)</span></div></div>
      </div>
      <p className="c-help" style={{ marginTop: 12 }}>측정: 허리 2주마다 · 인바디 2~4주 · 눈바디 4주</p>
    </>
  );
}

function VisitsTab({ visits }: { visits: Visit[] }) {
  return (
    <div className="c-tbl" style={{ display: "block" }}>
      <table className="t">
        <thead><tr><th>방문일</th><th>시간</th><th>관리</th><th>담당</th><th>상태</th><th>메모</th></tr></thead>
        <tbody>
          {visits.map((v, i) => (
            <tr key={i} style={{ cursor: "default" }}>
              <td className="num">{v.day}</td>
              <td className="num">{v.time ?? "-"}</td>
              <td>{v.program ? <span className="c-prg">{v.program}</span> : (v.src === "import" ? "방문 (이전 기록)" : "-")}</td>
              <td>{v.staff ?? "-"}</td>
              <td><span className={`badge ${STATUS_BADGE[v.status] ?? ""}`}>{v.status}</span></td>
              <td style={{ color: "var(--ink-3)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>{v.cancel_reason ?? v.memo ?? ""}</td>
            </tr>
          ))}
          {visits.length === 0 && <tr><td colSpan={6} className="c-empty">관리기록이 없어요</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function MembershipTab({ c }: { c: Chart }) {
  const [showEnded, setShowEnded] = useState(false);
  const list = c.memberships.filter((m) => showEnded || m.status === "사용중");
  const ended = c.memberships.length - c.memberships.filter((m) => m.status === "사용중").length;
  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button className={`chip ${!showEnded ? "on" : ""}`} onClick={() => setShowEnded(false)}>사용 중</button>
        <button className={`chip ${showEnded ? "on" : ""}`} onClick={() => setShowEnded(true)}>전체 <span className="num">{c.memberships.length}</span></button>
        {ended > 0 && !showEnded && <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)", alignSelf: "center" }}>끝난 회원권 {ended}개</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "var(--gap)" }}>
        {list.map((m) => (
          <div key={m.id} className="card" style={{ opacity: m.status === "사용중" ? 1 : 0.6 }}>
            <div className="hd" style={{ flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "var(--fs-md)" }}>{m.name}</h2>
              <span className={`badge ${m.status === "사용중" ? "ok" : ""}`}>{m.status}</span>
              <span className="badge">{m.kind}</span>
              {m.shared && <span className="badge warn">공유받음</span>}
            </div>
            <div className="num" style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>{remain(m)}</div>
            <div className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", margin: "4px 0 8px" }}>{m.start_on} ~ {m.end_on ?? "기한 없음"}</div>
            {m.items.map((i) => (
              <div key={i.program} className="num" style={{ display: "flex", fontSize: "var(--fs-sm)", padding: "4px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ flex: 1 }}>{i.program}</span>
                <span>{i.used}/{i.total}{i.service ? ` +서비스 ${i.service}` : ""}</span>
              </div>
            ))}
            {c.perms.pay && (m.price || m.paid || m.unpaid) ? (
              <div className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 8 }}>
                판매가 {won(m.price)} · 결제 {won(m.paid)}{m.unpaid ? <span style={{ color: "var(--red)" }}> · 미수 {won(m.unpaid)}</span> : null}
              </div>
            ) : null}
            {m.memo && <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 8 }}>{m.memo}</div>}
          </div>
        ))}
        {list.length === 0 && <p style={{ color: "var(--ink-3)" }}>사용 중인 회원권이 없어요</p>}
      </div>

      <div className="c-tbl" style={{ display: "block", marginTop: "var(--section-gap)" }}>
        <div className="c-cardhd" style={{ padding: "16px 16px 4px" }}><h3>결제 내역</h3></div>
        {!c.perms.pay ? (
          <div className="c-empty">결제 내역은 고객별 매출 권한이 있는 직원만 볼 수 있어요</div>
        ) : (
          <table className="t">
            <thead><tr><th>날짜</th><th>상품</th><th>구분</th><th>결제수단</th><th style={{ textAlign: "right" }}>금액</th><th style={{ textAlign: "right" }}>미수</th><th>입력</th></tr></thead>
            <tbody>
              {(c.payments ?? []).map((p, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  <td className="num">{p.day}</td>
                  <td>{p.product ?? "-"}{p.refund && <span className="badge em" style={{ marginLeft: 6 }}>환불</span>}</td>
                  <td>{[p.type, p.reg].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{p.method ?? "-"}</td>
                  <td className="num" style={{ textAlign: "right", color: p.refund ? "var(--red)" : undefined }}>{won(p.refund ? -Math.abs(p.amount) : p.amount)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{p.unpaid ? won(p.unpaid) : "-"}</td>
                  <td>{p.by ?? "-"}</td>
                </tr>
              ))}
              {(c.payments ?? []).length === 0 && <tr><td colSpan={7} className="c-empty">결제 내역이 아직 없어요 (매출 자료 옮긴 뒤 보여요)</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function MemoTab({ c, memos, reload }: { c: Chart; memos: Memo[]; reload: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr("");
    const { error } = await sb.rpc("customer_memo_add", { p_branch: c.customer.branch, p_key: c.customer.key, p_body: body });
    setBusy(false);
    if (error) return setErr(error.message.includes("FORBIDDEN") ? "메모를 쓸 권한이 없어요" : error.message);
    setBody(""); await reload();
  };
  return (
    <div className="card">
      {c.perms.memo && (
        <div style={{ marginBottom: 16 }}>
          <textarea className="inp" style={{ height: 88, padding: 12, resize: "vertical" }} maxLength={2000}
            placeholder="직원끼리 알아야 할 내용 (연락 선호 시간, 주의할 점 등)" value={body} onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, alignItems: "center" }}>
            {err && <span style={{ color: "var(--red)", fontSize: "var(--fs-sm)" }}>{err}</span>}
            <button className="btn p sm" disabled={busy || !body.trim()} onClick={save}>{busy ? "저장 중…" : "메모 저장"}</button>
          </div>
        </div>
      )}
      {memos.map((m) => (
        <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
          <div className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 4 }}>{dt(m.at)} · {m.author || "-"}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
        </div>
      ))}
      {memos.length === 0 && <div className="c-empty">메모가 없어요</div>}
    </div>
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
