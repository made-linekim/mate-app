"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { InfoIco, Lock } from "@/lib/v3";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { todayKST } from "@/lib/sales";

/* ── 기간: 이번 주(월~일) · 지난 주 · 이번 달 · 지난 달 ─────────────── */
export type PeriodKey = "week" | "lastweek" | "month" | "lastmonth";
export const PERIODS: { k: PeriodKey; l: string }[] = [
  { k: "week", l: "이번 주" }, { k: "lastweek", l: "지난 주" }, { k: "month", l: "이번 달" }, { k: "lastmonth", l: "지난 달" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
export function periodRange(k: PeriodKey, today = todayKST()) {
  const t = new Date(today + "T00:00:00Z");
  if (k === "week" || k === "lastweek") {
    const mon = new Date(t); mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) - (k === "lastweek" ? 7 : 0));
    const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
    return { from: iso(mon), to: iso(sun) };
  }
  const y = t.getUTCFullYear(), m = t.getUTCMonth() - (k === "lastmonth" ? 1 : 0);
  return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
}
export const md = (d: string) => `${+d.slice(5, 7)}.${d.slice(8, 10)}`;
const dw = (d: string) => DOW[new Date(d + "T00:00:00Z").getUTCDay()];
export function periodText(k: PeriodKey) {
  const r = periodRange(k);
  const l = PERIODS.find((p) => p.k === k)!.l;
  return `${l} ${md(r.from)} (${dw(r.from)}) – ${md(r.to)} (${dw(r.to)})`;
}

export function periodShort(k: PeriodKey) {
  const r = periodRange(k);
  return `${PERIODS.find((p) => p.k === k)!.l} · ${md(r.from)} – ${md(r.to)}`;
}

/* ── 숫자 ─────────────────────────────────────────────── */
export const n0 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
export function man(v: number | null | undefined) { // 228만 · 7.4만
  if (!v) return "0";
  if (v >= 10000) { const x = v / 10000; return `${x >= 100 ? Math.round(x) : Math.round(x * 10) / 10}만`; }
  return v.toLocaleString();
}
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

/* ── RPC: 오류 문구를 직원이 알아듣게 ─────────────────────── */
const ERR: Record<string, string> = {
  NO_PERMISSION: "권한이 없어요. 대표관리자에게 요청해 주세요.",
  NO_PERMISSION_SPEND: "광고비는 대표관리자만 입력할 수 있어요.",
  NO_BRANCH: "이 지점은 볼 수 없어요.",
  BAD_INPUT: "입력한 값을 다시 확인해 주세요.",
  NOT_FOUND: "이미 지워졌거나 없는 항목이에요.",
  NOT_SIGNED_IN: "다시 로그인해 주세요.",
};
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) throw new Error("NEED_SQL");
    const k = Object.keys(ERR).find((x) => error.message.includes(x));
    throw new Error(k ? ERR[k] : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
  return data as T;
}
export function useRpc<T>(fn: string, args: Record<string, unknown>) {
  const key = JSON.stringify(args);
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setErr(null); setData(await rpc<T>(fn, JSON.parse(key))); }
    catch (e) { setErr((e as Error).message); }
  }, [fn, key]);
  useEffect(() => { load(); }, [load]);
  return { data, err, reload: load };
}

/* ── 마케팅 공용 상태: 지점 · 기간 ───────────────────────── */
type Ctx = { branch: string; setBranch: (b: string) => void; period: PeriodKey; setPeriod: (p: PeriodKey) => void; toast: (s: string) => void };
export const MkCtx = createContext<Ctx | null>(null);
export const useMk = () => useContext(MkCtx)!;

export function useMkState() {
  const me = useMe();
  const [branch, setBranch] = useState(me.branch || BRANCHES[0]);
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2400); return () => clearTimeout(t); }, [msg]);
  return { ctx: { branch, setBranch, period, setPeriod, toast: setMsg } as Ctx, msg };
}

export const canEdit = (me: ReturnType<typeof useMe>) => me.tier !== "staff" || !!me.perms?.["marketing.edit"];
export const canBudget = (me: ReturnType<typeof useMe>) => me.tier === "owner";

/* ── 화면 머리: 제목 · 직원만 · 기간 설명 · 오른쪽 버튼 ─────────── */
export function Head({ title, meta, children, period = true }: { title: string; meta: string; children?: React.ReactNode; period?: boolean }) {
  const me = useMe();
  const { branch, setBranch, period: p, setPeriod } = useMk();
  return (
    <div className="mk-head">
      <h1>{title}</h1>
      <span className="mk-only">직원만</span>
      <span className="meta">{meta} · {branch}</span>
      <div className="act">
        {me.tier === "owner" && (
          <select className="sel" aria-label="지점" value={branch} onChange={(e) => setBranch(e.target.value)}>
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        )}
        {period && (
          <select className="sel" aria-label="기간" value={p} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map((x) => <option key={x.k} value={x.k}>{x.l}</option>)}
          </select>
        )}
        {children}
      </div>
    </div>
  );
}

/* 한 줄 안내 (디자인 v3). '확정' 띠는 없애고, 권한 표시는 잠금 칩으로. 모바일에서는 ⓘ 를 눌러야 펼쳐져요 */
export function Info({ tag = "확정", children }: { tag?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="mk-ibtn" aria-expanded={open} onClick={() => setOpen(!open)}>ⓘ 안내 {open ? "접기" : "보기"}</button>
      <div className={`mk-info v3-info ${open ? "open" : ""}`}>
        <InfoIco />
        {tag !== "확정" && <Lock>{tag}</Lock>}
        <span>{children}</span>
      </div>
    </>
  );
}

/* SQL 아직 안 돌렸을 때 */
export function Blocked({ err }: { err: string }) {
  if (err === "NEED_SQL") {
    return <div className="mk-empty card">마케팅 자료를 불러오는 기능이 아직 서버에 없어요. 대표관리자가 045 마케팅 SQL을 실행하면 바로 보여요.</div>;
  }
  return <div className="mk-empty card">{err}</div>;
}

/* 확인 창 */
export function Modal({ title, children, onClose, foot }: { title: string; children: React.ReactNode; onClose: () => void; foot: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="dim mk-dim" onClick={onClose} />
      <div className="mk-modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
        <div className="ft">{foot}</div>
      </div>
    </>
  );
}

/* 수집 루틴 상태 줄 */
export type Job = { job: string; result: string; reason: string | null; at: string | null };
const JOB_NAME: Record<string, string> = {
  "ads-meta": "메타 광고 성과", "ads-naver": "네이버 검색광고", "ads-daangn-api": "당근 광고",
  "blog-count": "네이버 블로그 글 수", "insta-count": "인스타그램 게시물", "keyword-rank": "키워드 순위",
};
export function when(at: string | null) {
  if (!at) return "기록 없음";
  const d = new Date(new Date(at).getTime() + 9 * 3600e3).toISOString();
  const day = d.slice(0, 10) === todayKST() ? "오늘" : md(d.slice(0, 10));
  return `${day} ${d.slice(11, 16)}`;
}
export function JobRow({ j }: { j: Job }) {
  const bad = j.result !== "성공" && j.result !== "건너뜀";
  return (
    <div className="row">
      <b>{JOB_NAME[j.job] ?? j.job}</b>
      <span className={bad ? "bad" : ""}>매일 자동 · 마지막 실행 {when(j.at)} · {j.result === "성공" ? "정상" : j.result}{j.reason ? ` · ${j.reason}` : ""}</span>
      <span />
    </div>
  );
}
