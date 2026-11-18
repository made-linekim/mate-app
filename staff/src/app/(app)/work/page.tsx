"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

// 업무 탭: 오늘 할 일 (기획서 "오늘 할 일" = 해피콜 · 지난 마감 · 승인 대기(수동 인증 포함) · 남은 업무)
// 데이터는 RPC work_today 한 번으로 받음 (security definer, 지점·권한 검사는 서버에서).

type Item = {
  id: string; kind: string; title: string | null; note: string | null; status: string;
  assignee: string | null; due_at: string | null; follow_day: string | null; mine: boolean;
};
type Check = { id: string; title: string; cycle: string; checked: boolean; checked_by: string | null; checked_at: string | null };
type Today = {
  day: string; branch: string;
  happycall: { today_left: number; today_done: number; overdue: number };
  overdue: Item[];
  approvals: { can: boolean; items: Item[]; manual_certs: number };
  remaining: Item[];
  checklist: Check[];
};

const HAPPYCALL_HREF = "/happycall"; // 해피콜 화면(별도 작업)과 같은 주소

const fmtDue = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const errText = (m: string) =>
  /Could not find the function|does not exist|PGRST202/.test(m) ? "업무 서버 기능을 준비하고 있어요. 곧 열려요."
  : /FORBIDDEN_BRANCH/.test(m) ? "이 지점 업무는 볼 수 없어요."
  : /USE_HAPPYCALL_SCREEN/.test(m) ? "해피콜은 해피콜 화면에서 결과를 남겨 주세요."
  : /FORBIDDEN/.test(m) ? "권한이 없어요."
  : "불러오지 못했어요. 잠시 뒤 다시 해 주세요.";

export default function Work() {
  const me = useMe();
  const [branch, setBranch] = useState<string>(me.branch);
  const [mineOnly, setMineOnly] = useState(false);
  const [data, setData] = useState<Today | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // 해피콜 화면과 같은 숫자: happycall_list(고객 데이터로 계산한 대상 포함)를 세기만 함. 이름·번호는 쓰지 않음.
  const [hcList, setHcList] = useState<{ total: number; late: number } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("work_today", { p_branch: branch });
    if (error) { setErr(errText(error.message)); setData(null); return; }
    setErr(""); setData(data as Today);
    const hl = await sb.rpc("happycall_list", { p_branch: branch });
    if (hl.error || !Array.isArray(hl.data)) { setHcList(null); return; }
    const td = (data as Today).day;
    const rows = hl.data as { due_day: string | null }[];
    setHcList({ total: rows.length, late: rows.filter((r) => !!r.due_day && r.due_day < td).length });
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const done = async (it: Item) => {
    setBusy(it.id);
    const { error } = await sb.rpc("work_item_done", { p_id: it.id });
    setBusy(null);
    if (error) return setErr(errText(error.message));
    load();
  };
  const toggle = async (c: Check) => {
    setBusy(c.id);
    setData((d) => d && { ...d, checklist: d.checklist.map((x) => (x.id === c.id ? { ...x, checked: !c.checked } : x)) });
    const { error } = await sb.rpc("task_check_set", { p_template: c.id, p_done: !c.checked, p_branch: branch });
    setBusy(null);
    if (error) setErr(errText(error.message));
    load();
  };

  const pick = (xs: Item[]) => (mineOnly ? xs.filter((x) => x.mine) : xs);
  const hc0 = data?.happycall;
  const hc = hc0 && (hcList
    ? { today_left: hcList.total - hcList.late, today_done: hc0.today_done, overdue: hcList.late }
    : hc0);
  const overdue = pick(data?.overdue ?? []);
  const approvals = pick(data?.approvals.items ?? []);
  const remaining = pick(data?.remaining ?? []);
  const checks = data?.checklist ?? [];
  const checksLeft = checks.filter((c) => !c.checked).length;
  const certN = data?.approvals.manual_certs ?? 0;

  const kpis = [
    { k: "해피콜", n: (hc?.today_left ?? 0) + (hc?.overdue ?? 0), sub: `오늘 완료 ${hc?.today_done ?? 0}`, em: (hc?.overdue ?? 0) > 0 },
    { k: "지난 마감", n: overdue.length + (hc?.overdue ?? 0), sub: "기한이 지난 업무", em: overdue.length + (hc?.overdue ?? 0) > 0 },
    ...(data?.approvals.can ? [{ k: "승인 대기", n: approvals.length + certN, sub: `수동 인증 ${certN}`, em: false }] : []),
    { k: "남은 업무", n: remaining.length + checksLeft, sub: `체크리스트 ${checksLeft}`, em: false },
  ];

  const itemTable = (rows: Item[], empty: string, late = false) =>
    rows.length === 0 ? <p style={{ color: "var(--ink-3)", margin: 0 }}>{empty}</p> : (
      <div style={{ overflowX: "auto", margin: "0 calc(-1 * var(--card-pad))" }}>
        <table className="t">
          <thead><tr><th>종류</th><th>내용</th><th>담당</th><th>기한</th><th></th></tr></thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id}>
                <td><span className={`badge ${late ? "em" : ""}`}>{it.kind}</span></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{it.title ?? "-"}</div>
                  {it.note && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{it.note}</div>}
                </td>
                <td>{it.assignee ?? <span style={{ color: "var(--ink-4)" }}>미배정</span>}</td>
                <td className="num" style={{ color: late ? "var(--red)" : "var(--ink-2)", whiteSpace: "nowrap" }}>{fmtDue(it.due_at)}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn sm" disabled={busy === it.id} onClick={() => done(it)}>완료</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <header className="top">
        <h1>업무</h1>
        <span className="sub num">{data ? `${data.day} · ${data.branch}` : ""}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {me.tier === "owner" && (
            <div className="seg">
              {BRANCHES.map((b) => <button key={b} className={branch === b ? "on" : ""} onClick={() => setBranch(b)}>{b}</button>)}
            </div>
          )}
          <button className={`chip ${mineOnly ? "on" : ""}`} onClick={() => setMineOnly((v) => !v)}>내 업무만</button>
          <button className="btn sm" onClick={load}>새로 고침</button>
        </div>
      </header>
      <div className="page" style={{ display: "grid", gap: "var(--section-gap)", maxWidth: "var(--content-w)" }}>
        {err && <p style={{ color: "var(--red)", margin: 0 }}>{err}</p>}

        <div style={{ display: "grid", gap: "var(--gap)", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {kpis.map((x) => (
            <div key={x.k} className="card" style={{ minHeight: "var(--kpi-h)", borderColor: x.em ? "var(--red-200)" : undefined }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-3)" }}>{x.k}</div>
              <div className="num" style={{ fontSize: "var(--fs-2xl)", lineHeight: "var(--lh-2xl)", fontWeight: 700, color: x.em ? "var(--red)" : "var(--ink)" }}>{data ? x.n : "-"}</div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{x.sub}</div>
            </div>
          ))}
        </div>

        <section className="card">
          <div className="hd">
            <h2>해피콜</h2>
            <span className="meta num">오늘 남음 {hc?.today_left ?? 0} · 완료 {hc?.today_done ?? 0}{hc?.overdue ? ` · 기한 지남 ${hc.overdue}` : ""}</span>
            <Link href={HAPPYCALL_HREF} className="btn p sm" style={{ marginLeft: "auto" }}>해피콜 하러 가기</Link>
          </div>
          <p style={{ color: "var(--ink-3)", margin: 0 }}>
            {(hc?.today_left ?? 0) + (hc?.overdue ?? 0) === 0 ? "오늘 남은 해피콜이 없어요." : "대상 고객과 결과 기록은 해피콜 화면에서 해요."}
          </p>
        </section>

        <section className="card">
          <div className="hd"><h2>지난 마감</h2><span className="meta">기한이 지났는데 아직 끝나지 않은 업무</span></div>
          {itemTable(overdue, hc?.overdue ? "해피콜 말고는 지난 업무가 없어요." : "지난 업무가 없어요.", true)}
        </section>

        {data?.approvals.can && (
          <section className="card">
            <div className="hd"><h2>승인 대기</h2><span className="meta num">수동 인증 {certN}건 (최근 7일)</span></div>
            {itemTable(approvals, certN ? "다른 승인 요청은 없어요." : "승인할 것이 없어요.")}
            {certN > 0 && <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", margin: "12px 0 0" }}>수동 인증 확인 화면은 고객 앱 연결 뒤 열려요.</p>}
          </section>
        )}

        <section className="card">
          <div className="hd"><h2>남은 업무</h2><span className="meta">오늘 기한인 업무와 체크리스트</span></div>
          {itemTable(remaining, "오늘 남은 업무가 없어요.")}
          <div style={{ marginTop: "var(--sp-5)" }}>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--ink-2)", marginBottom: 8 }}>체크리스트</div>
            {checks.length === 0 ? <p style={{ color: "var(--ink-3)", margin: 0 }}>등록된 체크리스트가 없어요.</p> : (
              <div style={{ display: "grid", gap: 4 }}>
                {checks.map((c) => (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: "var(--tr-h-dense)", borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: c.checked ? "var(--st-done-opacity)" : 1 }}>
                    <input type="checkbox" checked={c.checked} disabled={busy === c.id} onChange={() => toggle(c)} style={{ width: 18, height: 18, accentColor: "var(--red)" }} />
                    <span className="badge">{c.cycle}</span>
                    <span style={{ flex: 1, textDecoration: c.checked ? "line-through" : "none" }}>{c.title}</span>
                    {c.checked && c.checked_by && <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>{c.checked_by}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
