"use client";
import "./customers.css";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

import { Cond, Chip, builtinChips, condText } from "./cond";
import CondModal from "./CondModal";
import { searchCustomers, type Row } from "./search";

// 저장한 칩: 서버(cust_filters)에 저장해 지점이 같이 써요. 서버 표가 아직 없으면 이 기기에만 저장.
const SAVE_KEY = "mera.cust.chips2";
const loadLocal = (): Chip[] => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; } };
const storeLocal = (v: Chip[]) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

const PAGE = 20;
const kst = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const ymd2 = (d: string | null) => (d ? d.slice(2).replaceAll("-", ".") : "-");
const ago = (d: string | null) => {
  if (!d) return "";
  const n = Math.round((Date.parse(kst()) - Date.parse(d)) / 864e5);
  return n === 0 ? "오늘" : n > 0 ? `${n}일전` : `${-n}일후`;
};
const old = (d: string) => Math.round((Date.parse(kst()) - Date.parse(d)) / 864e5) > 14;
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
  const [active, setActive] = useState<Chip>(() => builtinChips()[0]);
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
  const [cond, setCond] = useState<null | { chip?: Chip }>(null);
  const [saved, setSaved] = useState<Chip[]>([]);
  const [server, setServer] = useState(true); // cust_filters 표가 있는지
  const [editing, setEditing] = useState(false);
  const builtins = builtinChips();
  const chipBranch = branch ?? me.branch;

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) { setQ(v); setQuery(v); }
  }, []);

  // 저장한 칩 불러오기 (서버 → 없으면 이 기기)
  const loadChips = useCallback(async () => {
    const { data, error } = await sb.rpc("cust_filter_list", { p_branch: chipBranch || null });
    if (error) { setServer(false); setSaved(loadLocal()); return; }
    setServer(true);
    setSaved(((data ?? []) as { id: string; name: string; conds: Cond[] }[]).map((d) => ({ id: d.id, name: d.name, conds: d.conds ?? [] })));
  }, [chipBranch]);
  useEffect(() => { loadChips(); }, [loadChips]);

  const conds = active.conds;
  const condKey = JSON.stringify(conds);
  const showErr = (e: string) => setErr(e === "NEED_SQL" ? "이 조건은 서버 준비(039 SQL 실행) 후에 찾을 수 있어요." : e);

  // 목록 (20명씩, 더보기는 이어 붙임)
  useEffect(() => {
    let on = true;
    setLoading(true); setPicked(new Set());
    searchCustomers(JSON.parse(condKey), query, branch, PAGE, 0).then(({ data, error }) => {
      if (!on) return;
      showErr(error);
      setRows(data); setTotal(data[0]?.total ?? 0); setLoading(false);
    });
    return () => { on = false; };
  }, [query, condKey, branch]);

  // 칩 숫자: 같은 함수로 1명만 받아 total 을 읽어요 (이름·번호는 쓰지 않음)
  const chipsKey = JSON.stringify(saved.map((c) => [c.id, c.conds]));
  useEffect(() => {
    let on = true;
    const all = [...builtinChips(), ...saved];
    Promise.all(all.map((c) => searchCustomers(c.conds, query, branch, 1, 0))).then((res) => {
      if (!on) return;
      const c: Record<string, number | null> = {};
      res.forEach((r, i) => { c[all[i].id] = r.error ? null : r.data[0]?.total ?? 0; });
      setCounts(c);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, branch, chipsKey]);

  // 연락할 고객 = 해피콜 대상 수 (숫자만 셈)
  useEffect(() => {
    sb.rpc("happycall_list", { p_branch: branch ?? (me.tier === "owner" ? null : me.branch) })
      .then(({ data, error }) => setContact(error ? null : (data ?? []).length));
  }, [branch, me.tier, me.branch]);

  const loadMore = async () => {
    setMore(true);
    const { data, error } = await searchCustomers(conds, query, branch, PAGE, rows.length);
    showErr(error);
    setRows((r) => [...r, ...data]); setMore(false);
  };

  const id = (r: Row) => `${r.branch}:${r.key}`;
  const toggle = (r: Row) => setPicked((p) => { const n = new Set(p); if (n.has(id(r))) n.delete(id(r)); else n.add(id(r)); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(id(r)));
  const toggleAll = () => setPicked(allOn ? new Set() : new Set(rows.map(id)));

  const saveChip = async (name: string, cs: Cond[], editId?: string): Promise<Chip | null> => {
    if (server) {
      const { data, error } = await sb.rpc("cust_filter_save", { p_branch: chipBranch || null, p_name: name, p_conds: cs, p_id: editId ?? null });
      if (!error) { await loadChips(); return { id: String(data), name, conds: cs }; }
      if (!/cust_filter|function|schema cache/i.test(error.message)) { alert(error.message); return null; }
      setServer(false);
    }
    const c: Chip = { id: editId ?? `l${Date.now()}`, name, conds: cs };
    const v = editId ? loadLocal().map((x) => (x.id === editId ? c : x)) : [...loadLocal(), c];
    storeLocal(v); setSaved(v); return c;
  };
  const removeChip = async (c: Chip) => {
    if (!confirm(`'${c.name}' 칩을 지울까요?`)) return;
    if (server) await sb.rpc("cust_filter_del", { p_id: c.id }); else storeLocal(loadLocal().filter((x) => x.id !== c.id));
    if (active.id === c.id) setActive(builtins[0]);
    if (server) loadChips(); else setSaved(loadLocal());
  };
  const chipLabel = active.name;
  const branchLabel = branch ?? (me.tier === "owner" ? "전 지점" : me.branch);
  const showBranch = me.tier === "owner" && !branch;
  const n = (k: string) => (counts[k] == null ? "" : counts[k]!.toLocaleString());

  return (
    <>
      <header className="top c-top v3-hd">
        <h1>고객</h1>
        <nav className="c-tabs">
          <button className="on">고객 목록 <span className="n">{n("all")}</span></button>
          <Link href="/happycall">연락할 고객 <span className="n">{contact ?? ""}</span></Link>
          <Link href="/membership">회원권</Link>
        </nav>
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
      <div className="page">
        <div className={`c-chips ${editing ? "editing" : ""}`}>
          {[...builtins, ...saved].map((c) => (
            <span key={c.id} className={`chip ${active.id === c.id ? "on" : ""}`}>
              <button className="c-chip-b" onClick={() => setActive(c)} title={c.conds.map((x) => condText(x)).join(" · ") || "모든 고객"}>
                {c.name} <b>{counts[c.id] == null ? "" : counts[c.id]!.toLocaleString()}</b>
              </button>
              {editing && !c.builtin && (
                <>
                  <button className="c-chip-i" aria-label={`${c.name} 고치기`} onClick={() => setCond({ chip: c })}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /></svg></button>
                  <button className="c-chip-i del" aria-label={`${c.name} 지우기`} onClick={() => removeChip(c)}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg></button>
                </>
              )}
            </span>
          ))}
          {!builtins.some((b) => b.id === active.id) && !saved.some((c) => c.id === active.id) && (
            <span className="chip on"><button className="c-chip-b" onClick={() => setCond({ chip: active })}>{active.name} <b>{total.toLocaleString()}</b></button>
              <button className="c-chip-i" aria-label="조건 지우기" onClick={() => setActive(builtins[0])}>×</button></span>
          )}
          <button className="chip add" onClick={() => setCond({})}>+ 추가</button>
          {saved.length > 0 && <button className={`edit ${editing ? "on" : ""}`} onClick={() => setEditing(!editing)}>{editing ? "✓ 편집완료" : "편집모드"}</button>}
        </div>

        <form className="c-tools" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input className="inp c-q" placeholder="이름 · 뒤 4자리 · 고객번호" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); }}>지우기</button>}
          <button type="button" className="btn" onClick={() => setCond({})}><span className="c-pc-only">검색조건 만들기</span><span className="c-m-only">조건 만들기</span></button>
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
                <th>고객</th><th>연락처</th><th>회원권</th><th>잔여</th><th>담당</th><th>최근 방문</th>
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
                    <td className="nm"><span className="v3-nmc"><span className="v3-av">{r.name.slice(0, 1)}</span><span className="v3-2l"><b>{r.name}</b>{r.customer_no && <small className="num">No. {r.customer_no}</small>}</span></span></td>
                    <td className="num">{r.phone || "-"}</td>
                    <td className="ms">{r.membership ? <span className="v3-2l"><span>{r.membership}</span>{r.ends_on && <small className="num">{ymd2(r.ends_on)} 만료</small>}</span> : <span className="c-muted">—</span>}</td>
                    <td><Rem r={r} sel={on} /></td>
                    <td>{r.manager || "-"}</td>
                    <td className="num">{r.last_visit_on ? <span className="v3-2l"><span>{r.last_visit_on.slice(5).replace("-", ".")}</span><small className={old(r.last_visit_on) ? "v3-old" : ""}>{ago(r.last_visit_on)}</small></span> : <span className="c-muted">—</span>}</td>
                    {showBranch && <td>{r.branch}</td>}
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                      <div className="c-menu">
                        <button className="btn sm t v3-dots" aria-label="관리" title="관리" onClick={() => setMenu(menu === id(r) ? null : id(r))}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg></button>
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
        <CondModal
          branch={branch ?? (me.tier === "owner" ? null : me.branch)} q={query} chip={cond.chip}
          onClose={() => setCond(null)}
          onApply={async (cs, name) => {
            setCond(null); setEditing(false);
            const editId = cond.chip && !cond.chip.builtin && saved.some((x) => x.id === cond.chip!.id) ? cond.chip.id : undefined;
            if (name) { const c = await saveChip(name, cs, editId); if (c) setActive(c); }
            else setActive({ id: "tmp", name: cs.map((x) => condText(x)).join(" · ") || "전체고객", conds: cs });
          }}
        />
      )}
    </>
  );
}

