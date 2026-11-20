"use client";
import "./customers.css";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

type Row = {
  key: string; branch: string; customer_no: string | null; name: string; phone: string | null; manager: string | null;
  registered_on: string | null; last_visit_on: string | null; membership: string | null; has_membership: boolean | null;
  min_remaining: number | null; ends_on: string | null; source: string | null; tags: string | null; total: number;
};
// 서버(customer_list)가 아는 조건만 칩으로 둬요
type Filter = "all" | "member" | "expiring" | "dormant";
const FILTERS: { k: Filter; l: string; help: string }[] = [
  { k: "all", l: "전체", help: "모든 고객" },
  { k: "member", l: "보유 고객", help: "회원권을 가진 고객" },
  { k: "expiring", l: "만료 임박", help: "회원권 잔여 2회 이하이거나 7일 안에 끝나는 고객" },
  { k: "dormant", l: "미방문 60일 이상", help: "60일 넘게 오지 않은 고객" },
];
// 내가 만든 칩: 이 기기에만 저장 (조건 = 서버 칩 하나 + 검색어)
type Saved = { id: string; name: string; filter: Filter; q: string };
const SAVE_KEY = "mera.cust.chips";
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; } };
const storeSaved = (v: Saved[]) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

const PAGE = 20;
const kst = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const ymd2 = (d: string | null) => (d ? d.slice(2).replaceAll("-", ".") : "-");
const ago = (d: string | null) => {
  if (!d) return "";
  const n = Math.round((Date.parse(kst()) - Date.parse(d)) / 864e5);
  return n === 0 ? "오늘" : n > 0 ? `${n}일전` : `${-n}일후`;
};
const chartUrl = (r: Row, tab?: string) => `/customers/chart?b=${encodeURIComponent(r.branch)}&k=${encodeURIComponent(r.key)}${tab ? `&tab=${tab}` : ""}`;

function Rem({ r, sel }: { r: Row; sel?: boolean }) {
  if (r.min_remaining == null) return <span className="c-muted">-</span>;
  const low = r.min_remaining <= 2;
  return <span className={`c-rem ${low ? (sel ? "line" : "") : "plain"}`}>잔여 {r.min_remaining}회</span>;
}

export default function Customers() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [savedOn, setSavedOn] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [contact, setContact] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [cond, setCond] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) { setQ(v); setQuery(v); }
    setSaved(loadSaved());
  }, []);

  // 목록 (20명씩, 더보기는 이어 붙임)
  const fetchPage = useCallback(async (offset: number) => {
    const { data, error } = await sb.rpc("customer_list", { p_q: query || null, p_branch: branch, p_filter: filter, p_limit: PAGE, p_offset: offset });
    setErr(error ? error.message : "");
    const list = (data ?? []) as Row[];
    setTotal(list[0]?.total ?? (offset === 0 ? 0 : total));
    return list;
  }, [query, branch, filter, total]);

  useEffect(() => {
    let on = true;
    setLoading(true); setPicked(new Set());
    sb.rpc("customer_list", { p_q: query || null, p_branch: branch, p_filter: filter, p_limit: PAGE, p_offset: 0 }).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? error.message : "");
      const list = (data ?? []) as Row[];
      setRows(list); setTotal(list[0]?.total ?? 0); setLoading(false);
    });
    return () => { on = false; };
  }, [query, filter, branch]);

  // 칩 숫자: 같은 함수로 1명만 받아 total 을 읽어요 (이름·번호는 쓰지 않음)
  useEffect(() => {
    let on = true;
    const qs: [string, Filter, string][] = [
      ...FILTERS.map((f) => [f.k, f.k, query] as [string, Filter, string]),
      ...saved.map((s) => [s.id, s.filter, s.q] as [string, Filter, string]),
    ];
    Promise.all(qs.map(([, f, qq]) => sb.rpc("customer_list", { p_q: qq || null, p_branch: branch, p_filter: f, p_limit: 1, p_offset: 0 })))
      .then((res) => {
        if (!on) return;
        const c: Record<string, number | null> = {};
        res.forEach((r, i) => { c[qs[i][0]] = r.error ? null : ((r.data ?? []) as Row[])[0]?.total ?? 0; });
        setCounts(c);
      });
    return () => { on = false; };
  }, [query, branch, saved]);

  // 연락할 고객 = 해피콜 대상 수 (숫자만 셈)
  useEffect(() => {
    sb.rpc("happycall_list", { p_branch: branch ?? (me.tier === "owner" ? null : me.branch) })
      .then(({ data, error }) => setContact(error ? null : (data ?? []).length));
  }, [branch, me.tier, me.branch]);

  const loadMore = async () => {
    setMore(true);
    const list = await fetchPage(rows.length);
    setRows((r) => [...r, ...list]); setMore(false);
  };

  const id = (r: Row) => `${r.branch}:${r.key}`;
  const toggle = (r: Row) => setPicked((p) => { const n = new Set(p); if (n.has(id(r))) n.delete(id(r)); else n.add(id(r)); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(id(r)));
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map(id)));
  const pickFilter = (f: Filter) => { setFilter(f); setSavedOn(null); };
  const pickSaved = (s: Saved) => { setFilter(s.filter); setQ(s.q); setQuery(s.q); setSavedOn(s.id); };
  const removeSaved = (sid: string) => { const v = saved.filter((s) => s.id !== sid); setSaved(v); storeSaved(v); if (savedOn === sid) pickFilter("all"); };
  const chipLabel = savedOn ? saved.find((s) => s.id === savedOn)?.name : FILTERS.find((f) => f.k === filter)?.l;
  const branchLabel = branch ?? (me.tier === "owner" ? "전 지점" : me.branch);
  const showBranch = me.tier === "owner" && !branch;
  const n = (k: string) => (counts[k] == null ? "" : counts[k]!.toLocaleString());

  return (
    <>
      <header className="top c-top">
        <h1>고객</h1>
        <span className="sub num">{branchLabel} · {loading ? "…" : `${(counts.all ?? total).toLocaleString()}명`}</span>
        <div className="c-right">
          {me.tier === "owner" ? (
            <select className="sel c-bsel" value={branch ?? ""} onChange={(e) => setBranch(e.target.value || null)} aria-label="지점">
              <option value="">전 지점</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : <span className="btn c-bsel" style={{ cursor: "default" }}>{me.branch}</span>}
        </div>
      </header>
      <nav className="c-tabs">
        <button className="on">고객 목록 <span className="n">{n("all")}</span></button>
        <Link href="/happycall">연락할 고객 <span className="n">{contact ?? ""}</span></Link>
      </nav>
      <div className="page">
        <div className="c-chips">
          {FILTERS.map((f) => (
            <button key={f.k} title={f.help} className={`chip ${!savedOn && filter === f.k ? "on" : ""}`} onClick={() => pickFilter(f.k)}>
              {f.l} <b>{n(f.k)}</b>
            </button>
          ))}
          {saved.map((s) => (
            <button key={s.id} className={`chip ${savedOn === s.id ? "on" : ""}`} onClick={() => pickSaved(s)}>
              {s.name} <b>{n(s.id)}</b>
              {editing && <span className="x" role="button" aria-label="칩 지우기" onClick={(e) => { e.stopPropagation(); removeSaved(s.id); }}>×</span>}
            </button>
          ))}
          <button className="chip add" onClick={() => setCond(true)}>+ 조건 추가</button>
          {saved.length > 0 && <button className="edit" onClick={() => setEditing(!editing)}>{editing ? "완료" : "편집"}</button>}
        </div>

        <form className="c-tools" onSubmit={(e) => { e.preventDefault(); setSavedOn(null); setQuery(q.trim()); }}>
          <input className="inp c-q" placeholder="이름 · 뒤 4자리 · 고객번호" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); setSavedOn(null); }}>지우기</button>}
          <button type="button" className="btn" onClick={() => setCond(true)}><span className="c-pc-only">검색조건 만들기</span><span className="c-m-only">조건 만들기</span></button>
        </form>

        {picked.size > 0 && (
          <div className="c-sel">
            <input type="checkbox" className="c-ck" checked={allOn} onChange={toggleAll} aria-label="모두 선택" />
            <b>{picked.size}명 선택</b>
            <span className="c-sel-sub">· {chipLabel} {total.toLocaleString()}명 중</span>
            <span className="c-m-only c-muted" style={{ fontSize: "var(--fs-sm)" }}>/ {total.toLocaleString()}명</span>
            <div className="c-right">
              <button className="btn sm danger" disabled title="여러 명을 해피콜에 넣는 기능은 준비 중이에요">해피콜에 넣기</button>
              <button className="btn sm hide-m" disabled title="단체 문자는 준비 중이에요">문자 보내기</button>
              <button className="btn sm hide-m" disabled title="담당자 일괄 변경은 준비 중이에요">담당자 변경</button>
              <button className="btn sm" onClick={() => setPicked(new Set())}>선택 해제</button>
            </div>
          </div>
        )}

        {err && <p style={{ color: "var(--red)" }}>{err}</p>}

        <div className="c-tbl">
          <table className="t">
            <thead>
              <tr>
                <th className="ck"><input type="checkbox" className="c-ck" checked={allOn} onChange={toggleAll} aria-label="모두 선택" /></th>
                <th>이름</th><th>휴대전화</th><th>보유 회원권</th><th>잔여</th><th>만료</th><th>담당</th><th>최근 방문일</th>
                {showBranch && <th>지점</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked.has(id(r));
                return (
                  <tr key={id(r)} className={on ? "sel" : ""} onClick={() => router.push(chartUrl(r))}>
                    <td className="ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="c-ck" checked={on} onChange={() => toggle(r)} aria-label={`${r.name} 선택`} /></td>
                    <td className="nm">{r.name}</td>
                    <td className="num">{r.phone || "-"}</td>
                    <td className="ms">{r.membership || <span className="c-muted">-</span>}</td>
                    <td><Rem r={r} sel={on} /></td>
                    <td className="num">{ymd2(r.ends_on)}</td>
                    <td>{r.manager || "-"}</td>
                    <td className="num">{r.last_visit_on ? `${r.last_visit_on} (${ago(r.last_visit_on)})` : "-"}</td>
                    {showBranch && <td>{r.branch}</td>}
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                      <div className="c-menu">
                        <button className="btn sm" onClick={() => setMenu(menu === id(r) ? null : id(r))}>관리 ▾</button>
                        {menu === id(r) && (
                          <div className="c-pop" onMouseLeave={() => setMenu(null)}>
                            <Link href={chartUrl(r)}>고객 차트 보기</Link>
                            <Link href={chartUrl(r, "call")}>상담·해피콜 기록</Link>
                            <Link href={chartUrl(r, "memo")}>메모 쓰기</Link>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && !err && (
                <tr><td colSpan={10} className="c-empty">조건에 맞는 고객이 없어요</td></tr>
              )}
              {loading && rows.length === 0 && <tr><td colSpan={10} className="c-empty">불러오는 중…</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="c-cards">
          {rows.map((r) => {
            const on = picked.has(id(r));
            return (
              <div key={id(r)} className="c-cd-card" onClick={() => router.push(chartUrl(r))}>
                <span className="ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="c-ck" checked={on} onChange={() => toggle(r)} aria-label={`${r.name} 선택`} /></span>
                <span className="nm">{r.name}{showBranch && <span>{r.branch}</span>}</span>
                <Rem r={r} sel={on} />
                <span className="sub num">
                  {[r.membership, r.ends_on && `${ymd2(r.ends_on)} 만료`, r.last_visit_on && `최근 ${r.last_visit_on.slice(5)}`].filter(Boolean).join(" · ") || r.phone || "-"}
                </span>
              </div>
            );
          })}
          {!loading && rows.length === 0 && !err && <div className="c-empty">조건에 맞는 고객이 없어요</div>}
        </div>

        {total > 0 && (
          <div className="c-more num">
            {total.toLocaleString()}명 중 {rows.length.toLocaleString()}명
            {rows.length < total && <>· <button onClick={loadMore} disabled={more}>{more ? "불러오는 중…" : `${PAGE}명씩 더보기`}</button></>}
          </div>
        )}
      </div>

      {cond && (
        <CondDrawer
          branch={branch} initFilter={filter} initQ={query}
          onClose={() => setCond(false)}
          onApply={(f, qq) => { setFilter(f); setQ(qq); setQuery(qq); setSavedOn(null); setCond(false); }}
          onSave={(s) => { const v = [...saved, s]; setSaved(v); storeSaved(v); setFilter(s.filter); setQ(s.q); setQuery(s.q); setSavedOn(s.id); setCond(false); }}
        />
      )}
    </>
  );
}

// 검색조건 만들기 (P11 · M04). 서버가 아는 조건만 고를 수 있어요.
type CondK = "member" | "expiring" | "dormant" | "q";
const COND: Record<CondK, { k: string; v: string }> = {
  member: { k: "회원권 보유고객", v: "사용 중인 회원권이 있는 고객" },
  expiring: { k: "회차회원권 잔여수", v: "잔여 2회 이하 또는 7일 안 만료" },
  dormant: { k: "미방문일", v: "60일 이상" },
  q: { k: "이름 · 연락처", v: "" },
};
const MENU: { g: string; items: { l: string; k?: CondK }[] }[] = [
  { g: "방문 · 예약", items: [{ l: "미방문일 (60일 이상)", k: "dormant" }, { l: "이용관리" }, { l: "예약일" }, { l: "처음방문일" }, { l: "최종방문일" }] },
  { g: "회원권", items: [{ l: "회차회원권 잔여수", k: "expiring" }, { l: "기간회원권 보유고객", k: "member" }, { l: "기간회원권 만료일" }, { l: "기간회원권 판매일" }, { l: "회차회원권 판매일" }] },
  { g: "고객", items: [{ l: "이름 · 연락처 · 고객번호", k: "q" }, { l: "생일" }, { l: "잔여포인트" }, { l: "담당자" }, { l: "고객등급" }] },
];

function CondDrawer({ branch, initFilter, initQ, onClose, onApply, onSave }: {
  branch: string | null; initFilter: Filter; initQ: string;
  onClose: () => void; onApply: (f: Filter, q: string) => void; onSave: (s: Saved) => void;
}) {
  const [conds, setConds] = useState<CondK[]>(() => [...(initFilter !== "all" ? [initFilter] : []), ...(initQ ? ["q" as const] : [])]);
  const [qq, setQq] = useState(initQ);
  const [name, setName] = useState("");
  const [menu, setMenu] = useState(conds.length === 0);
  const [cnt, setCnt] = useState<number | null>(null);
  const f: Filter = (conds.find((c) => c !== "q") as Filter | undefined) ?? "all";
  const qv = conds.includes("q") ? qq.trim() : "";

  useEffect(() => {
    let on = true;
    const t = setTimeout(() => {
      sb.rpc("customer_list", { p_q: qv || null, p_branch: branch, p_filter: f, p_limit: 1, p_offset: 0 })
        .then(({ data, error }) => { if (on) setCnt(error ? null : ((data ?? []) as Row[])[0]?.total ?? 0); });
    }, 250);
    return () => { on = false; clearTimeout(t); };
  }, [f, qv, branch]);

  const hasFilter = conds.some((c) => c !== "q");
  const add = (k: CondK) => { setConds((c) => [...c, k]); setMenu(false); };
  const canAdd = (k?: CondK) => !!k && !conds.includes(k) && (k === "q" || !hasFilter);

  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="drawer lg c-cd" style={{ zIndex: 41 }} role="dialog" aria-label="검색조건 만들기">
        <div className="hd">검색조건 만들기<button className="c-x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="bd">
          <label className="c-cd-row"><span>칩 이름</span>
            <input className="inp" placeholder="예: 잔여 2회 이하" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          </label>
          <div className="c-cd-row"><span>조건 맞추기</span><span className="c-help" style={{ display: "block" }}>모두 만족 · 회원권·방문 조건은 한 번에 하나만 고를 수 있어요</span></div>
          {conds.map((c) => (
            <div key={c} className="c-cond">
              <span className="k">{COND[c].k}</span>
              {c === "q"
                ? <input className="inp" style={{ flex: 1, minWidth: 160 }} placeholder="이름 · 뒤 4자리 · 고객번호" value={qq} onChange={(e) => setQq(e.target.value)} autoFocus />
                : <span className="v">{COND[c].v}</span>}
              <button className="c-x" aria-label="조건 빼기" onClick={() => setConds((x) => x.filter((y) => y !== c))}>×</button>
            </div>
          ))}
          <button className="c-add" onClick={() => setMenu(!menu)}>+ 조건 추가 ▾</button>
          {menu && (
            <div className="c-addmenu">
              {MENU.map((g) => (
                <div key={g.g} className="col">
                  <div className="g">{g.g}</div>
                  {g.items.map((it) => (
                    <button key={it.l} disabled={!canAdd(it.k)} onClick={() => it.k && add(it.k)}>
                      {it.l}{!it.k && <em>준비 중</em>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p className="c-help" style={{ margin: 0 }}>‘준비 중’ 조건은 서버 검색이 생기면 열려요. 칩은 이 기기에만 저장돼요.</p>
        </div>
        <div className="ft">
          <span className="cnt">조건에 맞는 고객<b className="num">{cnt == null ? "-" : `${cnt.toLocaleString()}명`}</b></span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => onApply(f, qv)}>
              <span className="c-pc-only">조회만</span><span className="c-m-only">조회 {cnt == null ? "" : `${cnt.toLocaleString()}명`}</span>
            </button>
            <button className="btn p" disabled={!name.trim() || conds.length === 0}
              onClick={() => onSave({ id: `s${Date.now()}`, name: name.trim(), filter: f, q: qv })}>칩으로 저장</button>
          </div>
        </div>
      </div>
    </>
  );
}
