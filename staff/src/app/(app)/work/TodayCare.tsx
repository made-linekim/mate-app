"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";

// 오늘 할 일 › 오늘 케어 (대표님 11/21): 들어가면 오늘 챙길 고객·일이 한 화면에.
// 해피콜 · 식단 케어 · 운동 케어 · 운동일지 미작성 · 업무 요청 · 제휴 업체 — 이미 있는 데이터를 그대로 읽어서 묶기만 해요.
// 서버: happycall_board(038) · care_board(080) · work_exlog_today(094) · work_req_list(055) · mkt_partners(045)
// 다이어트 미션은 데이터(미션·챌린지 기록)가 아직 없어서 숨겨요.

type Item = { key: string; name: string; why: string; meta?: string; href?: string };
type Sec = { k: string; title: string; hint: string; items: Item[] | null; more: string; moreL: string; tone?: "red" };
type Hc = { kind: string; customer_key: string; branch: string; name: string | null; why_a: string; why_n: string; why_b: string; assignee: string | null; done: boolean; result: string | null };
type Care = { customer_key: string; branch: string; name: string | null; grp: string; done_today: boolean; days7: number; last_day: string | null; manager: string | null };
type Ex = { customer_key: string; name: string | null; start_time: string; program: string | null; staff_name: string | null; status: string };
type Req = { id: string; title: string; assignee: string | null; requester: string; status: string; due_day: string | null };
type Partner = { id: string; name: string; industry: string | null; owner: string | null; last: string | null };

const GRP: Record<string, string> = { norsv: "다음 예약 없음", todo: "다음 예약 없음", consult: "상담 후 미등록", new: "신규 등록", low: "회원권 곧 끝남" };
const md = (d: string) => `${Number(d.slice(5, 7))}.${d.slice(8, 10)}`;
const chart = (b: string, k: string, tab: string) => `/customers/chart?b=${encodeURIComponent(b)}&k=${encodeURIComponent(k)}&tab=${tab}`;

export default function TodayCare({ branch, today, onTotal }: { branch: string; today: string; onTotal?: (n: number) => void }) {
  const me = useMe();
  const lead = me.tier === "owner" || me.tier === "manager";
  const [hc, setHc] = useState<Item[] | null>(null);
  const [diet, setDiet] = useState<Item[] | null>(null);
  const [ex, setEx] = useState<Item[] | null>(null);
  const [log, setLog] = useState<Item[] | null>(null);
  const [req, setReq] = useState<Item[] | null>(null);
  const [ptn, setPtn] = useState<Item[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set()); // 서버 준비 전·권한 없음 → 숨김

  useEffect(() => {
    let on = true;
    const hide = (k: string) => on && setOff((s) => new Set(s).add(k));
    setHc(null); setDiet(null); setEx(null); setLog(null); setReq(null); setPtn(null); setOff(new Set());
    sb.rpc("happycall_board", { p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      if (error || !Array.isArray(data)) return hide("hc");
      setHc((data as Hc[]).filter((r) => !r.done).map((r) => ({
        key: `${r.branch}|${r.customer_key}`, name: r.name ?? "-", why: GRP[r.kind] ?? "해피콜",
        meta: `${r.why_a}${r.why_n}${r.why_b}`.trim() + (r.assignee ? ` · ${r.assignee}` : ""), href: chart(r.branch, r.customer_key, "call"),
      })));
    });
    (["diet", "ex"] as const).forEach((k) => {
      sb.rpc("care_board", { p_branch: branch, p_kind: k }).then(({ data, error }) => {
        if (!on) return;
        if (error || !Array.isArray(data)) return hide(k);
        const xs = (data as Care[]).filter((r) => r.grp === "linked" && !r.done_today).map((r) => ({
          key: `${r.branch}|${r.customer_key}`, name: r.name ?? "-", why: r.last_day ? `최근 기록 ${md(r.last_day)}` : "기록 확인",
          meta: `7일 중 ${r.days7}일 기록${r.manager ? ` · ${r.manager}` : ""}`, href: chart(r.branch, r.customer_key, k === "diet" ? "diet" : "ex"),
        }));
        (k === "diet" ? setDiet : setEx)(xs);
      });
    });
    sb.rpc("work_exlog_today", { p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      if (error || !Array.isArray(data)) return hide("log");
      setLog((data as Ex[]).map((r) => ({
        key: r.customer_key, name: r.name ?? "-", why: `${r.start_time}${r.program ? ` ${r.program}` : ""}`,
        meta: `${r.status === "완료" ? "방문 완료 · " : ""}${r.staff_name ?? "담당 미정"}`, href: chart(branch, r.customer_key, "ex"),
      })));
    });
    sb.rpc("work_req_list", { p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      if (error || !Array.isArray(data)) return hide("req");
      setReq((data as Req[]).filter((r) => r.status === "진행중" && (lead || r.assignee === me.name || r.requester === me.name)).map((r) => ({
        key: r.id, name: r.title, why: `${r.requester} → ${r.assignee ?? "담당 미정"}`,
        meta: r.due_day ? `${md(r.due_day)}까지${r.due_day < today ? " · 지남" : ""}` : undefined, href: "/work?tab=remaining",
      })));
    });
    sb.rpc("mkt_partners", { p_branch: branch }).then(({ data, error }) => {
      if (!on) return;
      const list = (data as { list?: Partner[] | null } | null)?.list;
      if (error || !data) return hide("ptn");
      const cut = new Date(Date.parse(today) - 30 * 864e5).toISOString().slice(0, 10);
      setPtn((list ?? []).filter((p) => !p.last || p.last < cut).map((p) => ({
        key: p.id, name: p.name, why: p.last ? `마지막 연락 ${md(p.last)}` : "아직 연락 기록 없음",
        meta: [p.industry, p.owner].filter(Boolean).join(" · ") || undefined, href: "/marketing/partners",
      })));
    });
    return () => { on = false; };
  }, [branch, today, lead, me.name]);

  const secs: Sec[] = [
    { k: "hc", title: "해피콜", hint: "전화로 안부 · 재방문 안내", items: hc, more: "/work?tab=happycall", moreL: "해피콜 열기", tone: "red" },
    { k: "diet", title: "식단 케어", hint: "올린 식단에 오늘 한마디", items: diet, more: "/work?tab=happycall&care=diet", moreL: "식단 케어 열기" },
    { k: "ex", title: "운동 케어", hint: "걸음 · 운동 기록에 오늘 한마디", items: ex, more: "/work?tab=happycall&care=ex", moreL: "운동 케어 열기" },
    { k: "log", title: "운동일지 쓸 고객", hint: "오늘 수업 회원 중 아직 안 쓴 고객", items: log, more: "/schedule", moreL: "예약표 열기" },
    { k: "req", title: "업무 요청", hint: lead ? "진행 중인 요청" : "내가 맡았거나 요청한 일", items: req, more: "/work?tab=remaining", moreL: "남은 업무 열기" },
    { k: "ptn", title: "제휴 업체 연락", hint: "30일 넘게 연락 안 한 업체", items: ptn, more: "/marketing/partners", moreL: "제휴 열기" },
  ];
  const shown = secs.filter((s) => !off.has(s.k));
  const custN = new Set([...(hc ?? []), ...(diet ?? []), ...(ex ?? []), ...(log ?? []).map((x) => ({ ...x, key: `${branch}|${x.key}` }))].map((x) => x.key)).size;
  const loading = shown.some((s) => s.items === null);
  useEffect(() => { if (!loading) onTotal?.(custN); }, [loading, custN, onTotal]);

  return (
    <div className="tc">
      <div className="tc-kpi">
        <a className="card tc-k main" href="#tc-hc">
          <span className="l">오늘 케어할 고객</span>
          <b className="num">{loading ? "…" : custN}<small>명</small></b>
          <span className="s">겹치는 고객은 한 번만 셌어요</span>
        </a>
        {shown.map((s) => (
          <a key={s.k} className="card tc-k" href={`#tc-${s.k}`}>
            <span className="l">{s.title}</span>
            <b className={`num${s.tone === "red" && (s.items?.length ?? 0) > 0 ? " red" : ""}`}>{s.items === null ? "…" : s.items.length}<small>{s.k === "req" || s.k === "ptn" ? "건" : "명"}</small></b>
          </a>
        ))}
      </div>
      <div className="tc-grid">
        {shown.map((s) => (
          <section key={s.k} id={`tc-${s.k}`} className="card tc-sec">
            <div className="h"><h2>{s.title}</h2><span className="n num">{s.items?.length ?? ""}</span><span className="hint">{s.hint}</span>
              <Link className="go" href={s.more}>{s.moreL} ›</Link></div>
            {s.items === null ? <p className="tc-empty">불러오는 중이에요.</p>
              : s.items.length === 0 ? <p className="tc-empty">오늘은 없어요.</p>
              : (
                <ul>
                  {s.items.slice(0, 6).map((it) => (
                    <li key={it.key}>
                      {it.href ? <Link href={it.href}><b>{it.name}</b><span className="w">{it.why}</span>{it.meta && <span className="m">{it.meta}</span>}</Link>
                        : <div><b>{it.name}</b><span className="w">{it.why}</span>{it.meta && <span className="m">{it.meta}</span>}</div>}
                    </li>
                  ))}
                  {s.items.length > 6 && <li className="more"><Link href={s.more}>나머지 {s.items.length - 6}{s.k === "req" || s.k === "ptn" ? "건" : "명"} 더 보기 ›</Link></li>}
                </ul>
              )}
          </section>
        ))}
      </div>
    </div>
  );
}
