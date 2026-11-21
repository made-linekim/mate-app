"use client";
/* 설정 v3 부품 — 시안(SET_v3) HTML 구조·클래스를 그대로 써요. 모양은 s3.css(시안 CSS 복사본)에서 와요. */
import { useCallback, useEffect, useState } from "react";
import { useTopBranch } from "@/lib/branch";
import { sb, TIER_LABEL, BRANCHES, type Tier } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { friendly } from "../membership/ui";

/* 시안 v3kit.js 의 아이콘 (stroke 1.8, 16px) */
export const IC: Record<string, string> = {
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  off: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M9 14l6 5M15 14l-6 5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  room: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  flag: '<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>',
  pt: '<circle cx="12" cy="12" r="9"/><path d="M9 16V8h4a2.5 2.5 0 0 1 0 5H9"/>',
  star: '<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
};
export function V3i({ n }: { n: string }) {
  return <svg className="v3i" viewBox="0 0 24 24" aria-hidden dangerouslySetInnerHTML={{ __html: IC[n] ?? "" }} />;
}

/* 왼쪽 목록 (시안 SET_v3 · 20개). staff=true 는 직원에게도 보여요 (시안 SET-01_기본_직원). */
export type NavItem = { label: string; href: string; icon: string; staff?: boolean; help: string };
export const LNAV: { g: string; items: NavItem[] }[] = [
  { g: "예약", items: [
    { label: "기본", href: "/settings/basic", icon: "gear", staff: true, help: "지점 정보 · 예약 단위" },
    { label: "예약표", href: "/settings/board", icon: "cal", staff: true, help: "시작 화면 · 만료 임박" },
    { label: "업무시간", href: "/settings/hours", icon: "clock", staff: true, help: "요일별 영업 · 점심" },
    { label: "휴무", href: "/settings/holidays", icon: "off", staff: true, help: "정기 · 임시 · 직원 휴무" },
    { label: "관리실", href: "/settings/rooms", icon: "room", help: "예약 위치 · 동시 인원" },
    { label: "네이버 예약", href: "/settings/naver", icon: "link", help: "연결 · 상품 매칭" },
  ] },
  { g: "사람", items: [
    { label: "직원", href: "/settings/staff", icon: "users", help: "역할 · 직무 · 팀" },
    { label: "권한", href: "/settings/perms", icon: "shield", help: "역할별 기본 권한 · 직원별 권한" },
    { label: "계정", href: "/settings/account", icon: "user", help: "로그인 계정" },
  ] },
  { g: "상품", items: [
    { label: "관리 항목", href: "/settings/programs", icon: "list", help: "시술 항목과 금액" },
    { label: "회원권 상품", href: "/settings/products", icon: "tag", help: "회차권 · 기간권 · 금액권" },
    { label: "포인트", href: "/settings/points", icon: "pt", help: "적립과 사용 규칙" },
    { label: "고객 등급", href: "/settings/grades", icon: "star", help: "조건과 혜택" },
  ] },
  { g: "운영", items: [
    { label: "운영 기준", href: "/settings/ops", icon: "room", staff: true, help: "이탈 위험 · 리포트" },
    { label: "목표", href: "/settings/goals", icon: "target", help: "지점 · 직원별 목표" },
    { label: "결제·수수료", href: "/settings/pay", icon: "card", help: "결제 수단 · 카드 수수료" },
    { label: "마감 기준", href: "/settings/close", icon: "flag", help: "하루 · 월 마감" },
    { label: "카드 단말기", href: "/settings/terminals", icon: "card", help: "연결과 최근 결제" },
    { label: "연결", href: "/settings/links", icon: "link", help: "광고 · 채널 연결" },
  ] },
];
export const navFor = (tier: Tier) => LNAV.map((g) => ({ ...g, items: g.items.filter((i) => tier !== "staff" || i.staff) })).filter((g) => g.items.length);

/* 직급 이름: 시안의 '지점장'은 관리자, '매니저·직원'은 직원 (3단계) */
export const tierName = (t: string) => TIER_LABEL[t as Tier] ?? t;

/* ---------- 화면 틀 ---------- */
export function PageH({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="pageh">
      <b className="ttl">{title}</b>
      <span className="badge staff">직원만</span>
      <span className="sub">{sub}</span>
      <span className="sp" />
      {children}
    </div>
  );
}
export function Card({ title, extra, style, className = "", children }: { title?: React.ReactNode; extra?: React.ReactNode; style?: React.CSSProperties; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`op-card ${className}`} style={style}>
      {title !== undefined && <div className="sech"><h2>{title}</h2>{extra}</div>}
      {children}
    </div>
  );
}
export function ORow({ n, label, children }: { n: number; label: React.ReactNode; children?: React.ReactNode }) {
  return <div className="op-row"><span className="lab il"><span className="v3num">{n}</span>{label}</span>{children}</div>;
}
export function Help({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`help ${className}`}>{children}</span>;
}
export function HelpD({ children }: { children: React.ReactNode }) {
  return <div className="help">{children}</div>;
}
export function Note({ children }: { children: React.ReactNode }) {
  return <div className="note"><V3i n="info" />{children}</div>;
}

/* 회색 바탕 위 2~3개 선택지 (고른 것은 흰 바탕 + 빨간 점) */
export function VRadio<T extends string | number | boolean>({ value, options, onChange, disabled, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; disabled?: boolean; label?: string }) {
  return (
    <span className="v3radio" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <span key={String(o.v)} role="radio" aria-checked={o.v === value} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} className={o.v === value ? "on" : ""}
          onClick={() => !disabled && onChange(o.v)} onKeyDown={(e) => { if (!disabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onChange(o.v); } }}>{o.l}</span>
      ))}
    </span>
  );
}
export function UseR({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return <VRadio value={on} options={[{ v: true, l: "사용" }, { v: false, l: "안 함" }]} onChange={onChange} disabled={disabled} label={label} />;
}
/* 지금 값을 가운데 두고 앞뒤 하나씩 (시안 v3kit STEP 규칙과 같음) */
export function pick3(steps: number[], v: number) {
  const arr = steps.includes(v) ? steps.slice() : [...steps, v].sort((a, b) => a - b);
  const i = arr.indexOf(v);
  let p = arr.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 3);
  if (p.length < 3) p = arr.slice(-3);
  return p;
}
export function Sw({ on, onChange, lock, label }: { on: boolean; onChange?: (v: boolean) => void; lock?: boolean; label?: string }) {
  return <span className={`sw ${on ? "on" : ""} ${lock || !onChange ? "lock" : ""}`} role="switch" aria-checked={on} aria-label={label} tabIndex={lock ? -1 : 0}
    onClick={() => !lock && onChange?.(!on)} onKeyDown={(e) => { if (!lock && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onChange?.(!on); } }}><i /></span>;
}
export function Chip({ on, onClick, children, disabled }: { on?: boolean; onClick?: () => void; children: React.ReactNode; disabled?: boolean }) {
  return <span className={`chip ${on ? "on" : ""}`} role="button" aria-pressed={!!on} tabIndex={0} aria-disabled={disabled}
    onClick={() => !disabled && onClick?.()} onKeyDown={(e) => { if (!disabled && (e.key === " " || e.key === "Enter")) { e.preventDefault(); onClick?.(); } }}>{children}</span>;
}
/* 숫자 입력 (천 단위 쉼표, 오른쪽 정렬) */
export function NumInp({ value, onChange, width, disabled, label, dec }: { value: number | null | undefined; onChange?: (v: number) => void; width?: number; disabled?: boolean; label?: string; dec?: boolean }) {
  const shown = value == null ? "" : dec ? String(value) : Number(value).toLocaleString("ko-KR");
  return <input className={`inp num ${disabled ? "off" : ""}`} style={width ? { width } : undefined} inputMode={dec ? "decimal" : "numeric"} aria-label={label} disabled={disabled} value={shown}
    onChange={(e) => { const t = e.target.value.replace(dec ? /[^\d.]/g : /[^\d]/g, ""); onChange?.(t === "" ? 0 : dec ? parseFloat(t) || 0 : parseInt(t, 10)); }} />;
}
export function Confirm({ title, lines, ok = "저장", onOk, onClose, alt }: { title: string; lines: React.ReactNode[]; ok?: string; onOk: () => void; onClose: () => void; alt?: { label: string; on: () => void } }) {
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {lines.map((l, i) => <p key={i}>{l}</p>)}
        <div className="acts"><button type="button" className="btn" onClick={onClose}>닫기</button>{alt && <button type="button" className="btn" onClick={alt.on}>{alt.label}</button>}<button type="button" className="btn p" onClick={onOk}>{ok}</button></div>
      </div>
    </>
  );
}
/* 대표가 볼 지점 고르기 (시안 연결·운영 대표 화면의 brpick) */
export function BrPick({ value, onChange, all }: { value: string; onChange: (b: string) => void; all?: boolean }) {
  const list = all ? ["all", ...BRANCHES] : BRANCHES;
  return (
    <div className="ltool"><div className="brpick" role="tablist" aria-label="지점">
      {list.map((b) => <span key={b} role="tab" tabIndex={0} aria-selected={value === b} className={`b ${value === b ? "on" : ""}`} onClick={() => onChange(b)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(b); } }}>{b === "all" ? "전체" : b}</span>)}
    </div></div>
  );
}

/* ---------- 데이터: rsv_settings (settings_get / settings_set, 056에서 넓힘) ---------- */
export type Log = { key: string; by_name: string; by_tier: string; at: string; note: string };
export type SetData = { [k: string]: unknown; can_edit?: boolean; is_owner?: boolean; logs?: Log[] };
export function useSettings(branch: string) {
  const [data, setData] = useState<SetData | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const s = await sb.rpc("settings_get", { p_branch: branch });
    if (s.error || !s.data) { setData({}); setErr(s.error ? friendly(s.error.message) : ""); return; }
    setErr(""); setData(s.data as SetData);
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  const save = useCallback(async (key: string, value: unknown, note: string) => {
    const { error } = await sb.rpc("settings_set", { p_branch: branch, p_key: key, p_value: value, p_note: note });
    if (error) {
      // 056 전에는 p_note 가 없어요 → 예전 함수로 한 번 더
      if (/p_note|function .*does not exist|Could not find/i.test(error.message)) {
        const r = await sb.rpc("settings_set", { p_branch: branch, p_key: key, p_value: value });
        if (r.error) return friendly(r.error.message);
      } else return friendly(error.message);
    }
    await load();
    return "";
  }, [branch, load]);
  return { data, err, load, save };
}
export function val<T>(d: SetData | null, key: string, def: T): T {
  const v = d?.[key];
  if (v == null) return def;
  if (typeof def === "object" && !Array.isArray(def) && typeof v === "object") return { ...def, ...(v as object) } as T;
  return v as T;
}
/* 변경 기록 한 줄: 박○○ 관리자 · 11.10 · 포톤 금액을 … 바꿨어요. */
export function logLine(l: Log) {
  const d = new Date(l.at);
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${l.by_name} ${tierName(l.by_tier)} · ${md} · ${l.note}`;
}
export function Logs({ data, k, max = 2 }: { data: SetData | null; k: string | string[]; max?: number }) {
  const keys = Array.isArray(k) ? k : [k];
  const list = (data?.logs ?? []).filter((l) => keys.includes(l.key)).slice(0, max);
  return <>{list.map((l, i) => <div key={i} className="help">{logLine(l)}</div>)}</>;
}

/* 관리자·대표관리자가 고칠 수 있나 */
export function useLead() {
  const me = useMe();
  return { me, owner: me.tier === "owner", lead: me.tier === "owner" || me.tier === "manager" };
}

/* 변경 요청 (070 approval_request · setting_change). 승인되면 대표관리자가 그 화면에서 반영해요. */
export async function requestChange(branch: string, target: string, payload: Record<string, unknown>, reason: string) {
  const { error } = await sb.rpc("approval_request", { p_branch: branch, p_kind: "setting_change", p_target_type: "setting", p_target_id: target, p_payload: payload, p_amount: null, p_reason: reason });
  return error ? friendly(error.message) : "";
}
export const won = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("ko-KR"));
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => { if (!text) return; const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, [text, onDone]);
  if (!text) return null;
  return <div className="toast" role="status">{text}</div>;
}

/* 지점: 대표관리자는 상단바에서 고른 지점(useTopBranch)을 따라가요. 다른 직급은 자기 지점만.
   showPick: 시안에 지점 고르기(brpick)가 있는 화면만 (연결 · 운영 대표). allowAll: '전체'도 고를 수 있음 (연결). */
export function useBranch(allowAll = false, showPick = allowAll) {
  const me = useMe();
  const [top, setTop] = useTopBranch(me);
  const [all, setAll] = useState(false);
  const owner = me.tier === "owner";
  const b = owner ? (allowAll && all ? "all" : top) : me.branch;
  const pick = owner && showPick ? <BrPick value={b} all={allowAll} onChange={(x) => { if (x === "all") setAll(true); else { setAll(false); setTop(x); } }} /> : null;
  return { branch: b, pick, owner, setBranch: setTop };
}
/* 저장 결과 한 줄 (시안에는 없고, 저장이 됐는지 알려 줘요 — 머리 오른쪽 버튼 옆) */
export function Msg({ text }: { text: string }) {
  if (!text) return null;
  return <span className={`msg ${/했어요$/.test(text) ? "ok" : ""}`} role="status">{text}</span>;
}

/* 오른쪽 서랍 (시안 .drawer / .dhd / .dscroll / .dfoot) — 추가·수정 입력용 */
export function Drawer({ title, onClose, onOk, ok = "저장", busy, children }: { title: string; onClose: () => void; onOk?: () => void; ok?: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <>
      <div className="mask" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label={title}>
        <div className="dhd"><b>{title}</b></div>
        <div className="dscroll">{children}</div>
        <div className="dfoot"><div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>닫기</button>
          {onOk && <button type="button" className="btn p" disabled={busy} onClick={onOk}>{ok}</button>}
        </div></div>
      </div>
    </>
  );
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}
/* 11.25 처럼 (올해가 아니면 2027.01.03) */
export function md(d: string) {
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${Number(y) === new Date().getFullYear() ? "" : y + "."}${m}.${dd}`;
}
