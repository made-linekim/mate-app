"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { PhoneReveal } from "@/lib/phone";

// 해피콜 대상: 뷰티사랑넷에서 가져온 할 일(todo) + MERA가 고객 데이터로 계산한 대상
type Kind = "todo" | "expiring" | "lapsed" | "new";
type Row = {
  kind: Kind; item_id: string | null; customer_key: string; branch: string; name: string | null; phone: string | null;
  manager: string | null; reason: string; status: string; due_day: string | null; follow_day: string | null; assignee: string | null;
  membership: string | null; min_remaining: number | null; ends_on: string | null; last_visit_on: string | null; registered_on: string | null;
  last_result: string | null; last_note: string | null; last_called_at: string | null; last_handler: string | null;
};

const TABS: { k: Kind | "all"; l: string; help: string }[] = [
  { k: "all", l: "전체", help: "" },
  { k: "todo", l: "오늘 할 일", help: "뷰티사랑넷 예약표에서 가져온 해피콜(다음 예약 없음·상담 후 미등록)" },
  { k: "expiring", l: "만료 임박", help: "회원권 잔여 2회 이하이거나 14일 안에 끝나는 고객" },
  { k: "lapsed", l: "미방문", help: "회원권이 남았는데 22~120일 동안 오지 않은 고객" },
  { k: "new", l: "신규 케어", help: "등록 14일 안의 신규 고객, 첫 방문 다음 날부터" },
];
const KIND_LABEL: Record<Kind, string> = { todo: "할 일", expiring: "만료 임박", lapsed: "미방문", new: "신규" };
const RESULTS = [
  { k: "예약완료", help: "통화하고 예약까지 잡았어요" },
  { k: "통화완료", help: "통화했지만 예약은 아직이에요" },
  { k: "부재", help: "안 받았어요. 다음 연락일에 다시 떠요" },
  { k: "거절", help: "연락을 원하지 않아요" },
  { k: "해당없음", help: "이미 예약했거나 대상이 아니에요" },
];
const kst = (d = new Date()) => new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);
const md = (s: string | null) => (s ? s.slice(5).replace("-", "/") : "-");

export default function HappyCall() {
  const me = useMe();
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<Kind | "all">("all");
  const [branch, setBranch] = useState<string | null>(me.tier === "owner" ? null : me.branch);
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("happycall_list", { p_branch: branch });
    setErr(error ? (error.message.includes("happycall_list") ? "해피콜 기능을 준비 중이에요 (서버 함수 적용 전)" : error.message) : "");
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const today = kst();
  const base = useMemo(() => rows.filter((r) =>
    (!mine || r.assignee === me.name || r.manager === me.name) &&
    (!q || (r.name ?? "").includes(q) || (r.phone ?? "").replace(/\D/g, "").endsWith(q.replace(/\D/g, "")) && q.replace(/\D/g, "").length >= 4)
  ), [rows, mine, q, me.name]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const r of base) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [base]);
  const list = useMemo(() => {
    const order: Record<string, number> = { 기한지남: 0, 진행: 1, 대기: 2 };
    return base.filter((r) => tab === "all" || r.kind === tab).sort((a, b) =>
      (order[a.status] ?? 3) - (order[b.status] ?? 3) || (a.kind === "todo" ? 0 : 1) - (b.kind === "todo" ? 0 : 1) ||
      (a.last_visit_on ?? "").localeCompare(b.last_visit_on ?? ""));
  }, [base, tab]);
  const overdue = base.filter((r) => r.status === "기한지남").length;

  return (
    <>
      <header className="top">
        <h1>해피콜</h1>
        <span className="sub num">{loading ? "" : `오늘 연락할 고객 ${base.length.toLocaleString()}명${overdue ? ` · 기한 지남 ${overdue}` : ""}`}</span>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={load} disabled={loading}>새로고침</button>
      </header>
      <div className="page">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          {TABS.map((t) => (
            <button key={t.k} className={`chip ${tab === t.k ? "on" : ""}`} title={t.help} onClick={() => setTab(t.k)}>
              {t.l} <span className="num">{counts[t.k] ?? 0}</span>
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <div className="seg">
              <button className={!mine ? "on" : ""} onClick={() => setMine(false)}>전체 담당</button>
              <button className={mine ? "on" : ""} onClick={() => setMine(true)}>내 담당</button>
            </div>
            {me.tier === "owner" && (
              <div className="seg">
                {[null, ...BRANCHES].map((b) => (
                  <button key={b ?? "all"} className={branch === b ? "on" : ""} onClick={() => setBranch(b)}>{b ?? "전 지점"}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" style={{ maxWidth: 280 }} placeholder="이름, 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value.trim())} />
          {tab !== "all" && <span style={{ fontSize: 13, color: "var(--ink-3)" }}>{TABS.find((t) => t.k === tab)?.help}</span>}
        </div>
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr><th>고객</th><th>연락처</th><th>구분</th><th>사유</th><th>담당</th><th>회원권</th><th className="n">잔여</th><th>최근 방문</th><th>지난 통화</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.kind}:${r.item_id ?? r.branch + r.customer_key}`}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {r.name ?? "-"}
                    {me.tier === "owner" && !branch && <span style={{ fontWeight: 400, color: "var(--ink-4)", fontSize: 12, marginLeft: 6 }}>{r.branch}</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}><PhoneReveal branch={r.branch} customerKey={r.customer_key} masked={r.phone} view={false} /></td>
                  <td>
                    <span className={`badge ${r.kind === "expiring" ? "em" : r.kind === "lapsed" ? "warn" : r.kind === "new" ? "ok" : ""}`}>{KIND_LABEL[r.kind]}</span>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.reason}
                    {r.status === "기한지남" && <span className="badge em" style={{ marginLeft: 6 }}>기한 지남</span>}
                    {r.status === "진행" && <span className="badge warn" style={{ marginLeft: 6 }}>재통화 {md(r.follow_day)}</span>}
                  </td>
                  <td>{r.assignee || r.manager || "-"}</td>
                  <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.membership || "-"}</td>
                  <td className="n num">{r.min_remaining ?? "-"}</td>
                  <td className="num">{md(r.last_visit_on)}</td>
                  <td style={{ fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                    {r.last_called_at ? `${md(kst(new Date(r.last_called_at)))} ${r.last_result}` : "-"}
                  </td>
                  <td><button className="btn sm" onClick={() => setOpen(r)}>결과 기록</button></td>
                </tr>
              ))}
              {!loading && list.length === 0 && !err && (
                <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--ink-3)" }}>오늘 연락할 고객이 없어요</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 12 }}>
          기준일 {today} · 할 일은 뷰티사랑넷 예약표에서 매일 가져오고, 나머지는 MERA 고객 데이터로 계산해요. 결과를 기록하면 목록에서 빠지고, 부재는 다음 연락일에 다시 떠요.
        </p>
      </div>
      {open && <LogDrawer row={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </>
  );
}

function LogDrawer({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState("");
  const [note, setNote] = useState("");
  const tomorrow = kst(new Date(Date.now() + 864e5));
  const [follow, setFollow] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    if (!result) return setMsg("통화 결과를 골라 주세요");
    setBusy(true); setMsg("");
    const { error } = await sb.rpc("happycall_log", {
      p_item: row.item_id, p_customer_key: row.customer_key, p_branch: row.branch, p_kind: row.kind,
      p_result: result, p_note: note.trim(), p_follow_day: result === "부재" || result === "통화완료" ? follow || null : null,
    });
    setBusy(false);
    if (error) return setMsg(error.message.includes("NO_PERMISSION") ? "해피콜 기록 권한이 없어요" : error.message);
    onDone();
  }

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="해피콜 결과 기록">
        <div className="hd">해피콜 결과</div>
        <div className="bd">
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{row.name ?? "-"} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-3)" }}>{row.branch}</span></div>
            <div style={{ marginTop: 4 }}>{row.phone ? <PhoneReveal branch={row.branch} customerKey={row.customer_key} masked={row.phone} /> : "연락처 없음"}</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
              {KIND_LABEL[row.kind]} · {row.reason}<br />
              회원권 {row.membership || "-"}{row.min_remaining != null ? ` (잔여 ${row.min_remaining})` : ""} · 최근 방문 {row.last_visit_on ?? "-"}
            </div>
            {row.last_called_at && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>
                지난 통화 {kst(new Date(row.last_called_at))} {row.last_result} · {row.last_handler}{row.last_note ? ` · ${row.last_note}` : ""}
              </div>
            )}
          </div>
          <div className="field">
            <label>통화 결과 *</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RESULTS.map((r) => (
                <button key={r.k} type="button" className={`chip ${result === r.k ? "on" : ""}`} title={r.help} onClick={() => setResult(r.k)}>{r.k}</button>
              ))}
            </div>
            {result && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{RESULTS.find((r) => r.k === result)?.help}</div>}
          </div>
          {(result === "부재" || result === "통화완료") && (
            <div className="field">
              <label>다음 연락일</label>
              <input className="inp" type="date" value={follow} min={tomorrow} onChange={(e) => setFollow(e.target.value)} style={{ maxWidth: 200 }} />
            </div>
          )}
          <div className="field">
            <label>메모</label>
            <textarea className="inp" style={{ height: 96, padding: 12, resize: "vertical" }} placeholder="고객이 한 말, 다음에 챙길 것" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {msg && <p style={{ color: "var(--red)", fontSize: 13 }}>{msg}</p>}
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn p" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </>
  );
}
