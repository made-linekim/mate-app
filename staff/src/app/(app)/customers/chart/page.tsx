"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
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
  perms: { pay: boolean; health: boolean; memo: boolean; sms: boolean; reserve: boolean };
};

const won = (n: number | null | undefined) => (n == null ? "-" : `${n.toLocaleString()}원`);
const today = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const ago = (d: string | null) => {
  if (!d) return "";
  const n = daysBetween(d, today());
  return n === 0 ? "오늘" : n > 0 ? `${n}일 전` : `${-n}일 후`;
};
const dt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const STATUS_BADGE: Record<string, string> = { 완료: "ok", 방문: "ok", 예약: "", 노쇼: "warn", 취소: "em" };

function remain(m: Membership) {
  if (m.kind === "회차") {
    const t = m.items.reduce((s, i) => s + (i.total ?? 0) + (i.service ?? 0), 0);
    const u = m.items.reduce((s, i) => s + (i.used ?? 0), 0);
    return m.items.length ? `잔여 ${Math.max(t - u, 0)}회 / ${t}회` : "회차 정보 없음";
  }
  if (m.kind === "금액") return m.amount_left != null ? `잔액 ${won(m.amount_left)}` : "금액권";
  return m.end_on ? `남은 ${Math.max(daysBetween(today(), m.end_on), 0)}일` : "기간권";
}

const TABS = [
  { k: "info", l: "회원정보" }, { k: "visits", l: "관리기록" }, { k: "mem", l: "회원권·결제" }, { k: "memo", l: "메모" },
] as const;
type TabK = (typeof TABS)[number]["k"];

function ChartView() {
  const sp = useSearchParams();
  const branch = sp.get("b") ?? "";
  const key = sp.get("k") ?? "";
  const [c, setC] = useState<Chart | null | undefined>(undefined);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabK>("info");
  const [sms, setSms] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("customer_chart", { p_branch: branch, p_key: key });
    if (error) { setErr(error.message.includes("FORBIDDEN") ? "이 고객 차트를 볼 권한이 없어요" : error.message); setC(null); return; }
    setErr(""); setC((data ?? null) as Chart | null);
  }, [branch, key]);
  useEffect(() => { load(); }, [load]);

  if (c === undefined) return <div className="page" style={{ color: "var(--ink-3)" }}>불러오는 중…</div>;
  if (!c) return (
    <>
      <header className="top"><Link href="/customers" className="btn t sm">← 고객 목록</Link></header>
      <div className="page"><p style={{ color: err ? "var(--red)" : "var(--ink-3)" }}>{err || "고객을 찾지 못했어요"}</p></div>
    </>
  );

  const cu = c.customer;
  const active = c.memberships.filter((m) => m.status === "사용중");
  const visitCount = c.visits.filter((v) => v.status === "완료" || v.status === "방문").length;
  const tags = (cu.tags ?? "").split(/[,#\s]+/).filter(Boolean);
  const count: Record<TabK, number | null> = { info: null, visits: c.visits.length, mem: c.memberships.length, memo: c.memos.length };

  return (
    <>
      <header className="top">
        <Link href="/customers" className="btn t sm" style={{ paddingLeft: 0 }}>← 고객 목록</Link>
      </header>
      <div className="page" style={{ maxWidth: "var(--content-w)" }}>
        {/* 머리 */}
        <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 56, height: 56, borderRadius: "var(--r-pill)", background: "var(--red-50)", color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-xl)", fontWeight: 700, flex: "none" }}>
            {cu.name.slice(0, 1)}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--fs-xl)", lineHeight: "var(--lh-xl)", fontWeight: 700 }}>{cu.name}</span>
              {active.length > 0 && <span className="badge ok">회원권 {active.length}</span>}
              {cu.source && <span className="badge">{cu.source}</span>}
              {tags.map((t) => <span key={t} className="badge warn">{t}</span>)}
            </div>
            <div className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 4 }}>
              {[cu.customer_no && `고객번호 ${cu.customer_no}`, cu.phone, cu.branch].filter(Boolean).join(" · ")}
            </div>
          </div>
          {c.next && (
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              다음 예약 <b className="num" style={{ color: "var(--ink)" }}>{c.next.day.slice(5).replace("-", ".")} {c.next.time}</b>
              {c.next.program && ` ${c.next.program}`}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {c.perms.sms && <button className="btn sm" onClick={() => setSms(true)}>문자</button>}
          </div>
        </div>

        {/* 요약 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "var(--gap)", marginTop: "var(--gap)" }}>
          <Stat label="최근 방문일" value={cu.last_visit_on ?? "-"} sub={ago(cu.last_visit_on)} />
          <Stat label="방문" value={`${visitCount}회`} sub={cu.registered_on ? `최초 등록 ${cu.registered_on}` : ""} />
          <Stat label="노쇼 · 예약취소" value={`${c.counts.noshow} · ${c.counts.cancel}`} warn={c.counts.noshow > 0} />
          <Stat label="담당" value={cu.manager || "-"} />
        </div>

        {/* 건강 특이사항: 권한 있는 직원만 */}
        {c.perms.health && (
          <div className="card" style={{ marginTop: "var(--gap)", background: "var(--amb-50)", borderColor: "var(--amb-50)" }}>
            <div className="hd" style={{ marginBottom: 4 }}><h2 style={{ fontSize: "var(--fs-md)" }}>건강 특이사항</h2>
              {c.health?.at && <span className="meta">{c.health.by} · {dt(c.health.at)}</span>}</div>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>
              {[c.health?.flags, c.health?.note].filter(Boolean).join("\n") || "등록된 내용이 없어요"}
            </div>
          </div>
        )}

        {/* 탭 */}
        <div className="seg" style={{ marginTop: "var(--section-gap)", marginBottom: "var(--gap)", maxWidth: "100%", overflowX: "auto" }}>
          {TABS.map((t) => (
            <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}>
              {t.l}{count[t.k] != null && <span className="num" style={{ marginLeft: 4, color: "var(--ink-4)" }}>{count[t.k]}</span>}
            </button>
          ))}
        </div>

        {tab === "info" && <InfoTab c={c} go={setTab} />}
        {tab === "visits" && <VisitsTab visits={c.visits} />}
        {tab === "mem" && <MembershipTab c={c} />}
        {tab === "memo" && <MemoTab c={c} reload={load} />}
      </div>
      {sms && <SmsDrawer name={cu.name} onClose={() => setSms(false)} />}
    </>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: "var(--sp-4)" }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", fontWeight: 600 }}>{label}</div>
      <div className="num" style={{ fontSize: "var(--fs-lg)", lineHeight: "var(--lh-lg)", fontWeight: 700, marginTop: 4, color: warn ? "var(--amb)" : "var(--ink)" }}>{value}</div>
      {sub && <div className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: "var(--fs-md)" }}>
      <span style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>{k}</span><span className="num">{v || "-"}</span>
    </div>
  );
}

function InfoTab({ c, go }: { c: Chart; go: (t: TabK) => void }) {
  const cu = c.customer;
  const active = c.memberships.filter((m) => m.status === "사용중");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "var(--gap)" }}>
      <div className="card">
        <div className="hd"><h2>기본 정보</h2></div>
        <Row k="고객번호" v={cu.customer_no} />
        <Row k="연락처" v={cu.phone} />
        <Row k="지점" v={cu.branch} />
        <Row k="담당" v={cu.manager} />
        <Row k="최초 등록" v={cu.registered_on} />
        <Row k="유입 경로" v={[cu.source, cu.source_detail].filter(Boolean).join(" · ")} />
        <Row k="소개한 분" v={cu.referrer} />
        <Row k="광고 수신" v={cu.ad_consent} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
        <div className="card">
          <div className="hd"><h2>보유 회원권</h2><span className="meta">{active.length}개</span>
            <button className="btn t sm" style={{ marginLeft: "auto" }} onClick={() => go("mem")}>전체</button></div>
          {active.length === 0 && <p style={{ margin: 0, color: "var(--ink-3)" }}>사용 중인 회원권이 없어요</p>}
          {active.slice(0, 4).map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
              <span style={{ fontWeight: 600, flex: 1 }}>{m.name}</span>
              <span className="num" style={{ fontSize: "var(--fs-sm)" }}>{remain(m)}</span>
              {m.end_on && <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{m.end_on.slice(2).replaceAll("-", ".")} 만료</span>}
            </div>
          ))}
        </div>
        {c.perms.pay && c.pay_sum && (
          <div className="card">
            <div className="hd"><h2>매출 · 결제</h2></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <div><div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>누적 결제</div><b className="num">{won(c.pay_sum.total)}</b></div>
              <div><div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>최근 결제</div><b className="num">{c.pay_sum.last_day ?? "-"}</b></div>
              <div><div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>미수금</div><b className="num" style={{ color: c.pay_sum.unpaid > 0 ? "var(--red)" : undefined }}>{won(c.pay_sum.unpaid)}</b></div>
            </div>
          </div>
        )}
      </div>
      <div className="card">
        <div className="hd"><h2>최근 관리기록</h2><button className="btn t sm" style={{ marginLeft: "auto" }} onClick={() => go("visits")}>전체</button></div>
        {c.visits.length === 0 && <p style={{ margin: 0, color: "var(--ink-3)" }}>기록이 없어요</p>}
        {c.visits.slice(0, 5).map((v, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
            <span className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", width: 44 }}>{v.day.slice(5).replace("-", ".")}</span>
            <span style={{ flex: 1 }}>{v.program ?? "방문"}{v.memo && <span style={{ color: "var(--ink-3)" }}> · {v.memo}</span>}</span>
            <span className={`badge ${STATUS_BADGE[v.status] ?? ""}`}>{v.status}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="hd"><h2>메모</h2><button className="btn t sm" style={{ marginLeft: "auto" }} onClick={() => go("memo")}>{c.perms.memo ? "쓰기" : "전체"}</button></div>
        {c.memos.length === 0 && <p style={{ margin: 0, color: "var(--ink-3)" }}>메모가 없어요</p>}
        {c.memos.slice(0, 4).map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", width: 44, flex: "none" }}>{dt(m.at).slice(5, 10).replace("-", ".")}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisitsTab({ visits }: { visits: Visit[] }) {
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="t">
        <thead><tr><th>날짜</th><th>시간</th><th>관리</th><th>담당</th><th>상태</th><th>메모</th></tr></thead>
        <tbody>
          {visits.map((v, i) => (
            <tr key={i}>
              <td className="num">{v.day}</td>
              <td className="num">{v.time ?? "-"}</td>
              <td>{v.program ?? (v.src === "import" ? "방문 (이전 기록)" : "-")}</td>
              <td>{v.staff ?? "-"}</td>
              <td><span className={`badge ${STATUS_BADGE[v.status] ?? ""}`}>{v.status}</span></td>
              <td style={{ color: "var(--ink-3)", maxWidth: 320 }}>{v.cancel_reason ?? v.memo ?? ""}</td>
            </tr>
          ))}
          {visits.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)" }}>관리기록이 없어요</td></tr>}
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
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className={`chip ${!showEnded ? "on" : ""}`} onClick={() => setShowEnded(false)}>사용 중</button>
        <button className={`chip ${showEnded ? "on" : ""}`} onClick={() => setShowEnded(true)}>전체 <span className="num">{c.memberships.length}</span></button>
        {ended > 0 && !showEnded && <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-4)", alignSelf: "center" }}>끝난 회원권 {ended}개</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "var(--gap)" }}>
        {list.map((m) => (
          <div key={m.id} className="card" style={{ opacity: m.status === "사용중" ? 1 : 0.6 }}>
            <div className="hd" style={{ flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "var(--fs-md)" }}>{m.name}</h2>
              <span className={`badge ${m.status === "사용중" ? "ok" : ""}`}>{m.status}</span>
              <span className="badge">{m.kind}</span>
              {m.shared && <span className="badge warn">공유받음</span>}
            </div>
            <div className="num" style={{ fontSize: "var(--fs-lg)", fontWeight: 700 }}>{remain(m)}</div>
            <div className="num" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", margin: "4px 0 8px" }}>
              {m.start_on} ~ {m.end_on ?? "기한 없음"}
            </div>
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

      <div className="card" style={{ marginTop: "var(--section-gap)", padding: 0, overflowX: "auto" }}>
        <div className="hd" style={{ padding: "var(--card-pad) var(--card-pad) 0" }}><h2>결제 내역</h2></div>
        {!c.perms.pay ? (
          <p style={{ padding: "0 var(--card-pad) var(--card-pad)", margin: 0, color: "var(--ink-3)" }}>결제 내역은 고객별 매출 권한이 있는 직원만 볼 수 있어요</p>
        ) : (
          <table className="t">
            <thead><tr><th>날짜</th><th>상품</th><th>구분</th><th>결제수단</th><th style={{ textAlign: "right" }}>금액</th><th style={{ textAlign: "right" }}>미수</th><th>입력</th></tr></thead>
            <tbody>
              {(c.payments ?? []).map((p, i) => (
                <tr key={i}>
                  <td className="num">{p.day}</td>
                  <td>{p.product ?? "-"}{p.refund && <span className="badge em" style={{ marginLeft: 6 }}>환불</span>}</td>
                  <td>{[p.type, p.reg].filter(Boolean).join(" · ") || "-"}</td>
                  <td>{p.method ?? "-"}</td>
                  <td className="num" style={{ textAlign: "right", color: p.refund ? "var(--red)" : undefined }}>{won(p.refund ? -Math.abs(p.amount) : p.amount)}</td>
                  <td className="num" style={{ textAlign: "right" }}>{p.unpaid ? won(p.unpaid) : "-"}</td>
                  <td>{p.by ?? "-"}</td>
                </tr>
              ))}
              {(c.payments ?? []).length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--ink-3)" }}>결제 내역이 아직 없어요 (매출 자료 옮긴 뒤 보여요)</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function MemoTab({ c, reload }: { c: Chart; reload: () => Promise<void> }) {
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
            placeholder="이 고객에 대해 직원끼리 알아야 할 내용 (연락 선호 시간, 주의할 점 등)" value={body} onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, alignItems: "center" }}>
            {err && <span style={{ color: "var(--red)", fontSize: "var(--fs-sm)" }}>{err}</span>}
            <button className="btn p sm" disabled={busy || !body.trim()} onClick={save}>{busy ? "저장 중…" : "메모 저장"}</button>
          </div>
        </div>
      )}
      {c.memos.map((m) => (
        <div key={m.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
          <div className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginBottom: 4 }}>{dt(m.at)} · {m.author || "-"}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
        </div>
      ))}
      {c.memos.length === 0 && <p style={{ margin: 0, color: "var(--ink-3)" }}>메모가 없어요</p>}
    </div>
  );
}

function SmsDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer">
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
