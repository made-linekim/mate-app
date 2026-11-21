"use client";
import "./customers.css";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

import { Cond, Chip, builtinChips, condText, INITIALS } from "./cond";
import CondModal from "./CondModal";
import { searchCustomers, type Row } from "./search";

// 저장한 칩: 서버(cust_filters)에 저장해 지점이 같이 써요. 서버 표가 아직 없으면 이 기기에만 저장.
const SAVE_KEY = "mera.cust.chips2";
const HIDE_KEY = "mera.cust.hide"; // 지운 기본 칩 (이 기기)
const loadHide = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"); } catch { return []; } };
const loadLocal = (): Chip[] => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; } };
const storeLocal = (v: Chip[]) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

const PAGE = 20;
const COL_KEY = "mera.cust.cols";
const COLS = [{ k: "phone", l: "연락처" }, { k: "ms", l: "회원권" }, { k: "rem", l: "잔여" }, { k: "mgr", l: "담당" }, { k: "visit", l: "최근 방문" }];
const svg = (d: string) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const ICO_CALL = svg("M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2");
const ICO_SMS = svg("M4 5h16v11H8l-4 4z");
const ICO_COLS = svg("M4 5h16v14H4zM9.5 5v14M14.5 5v14");
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
  const [ini, setIni] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [newCust, setNewCust] = useState(false);
  const [colsOpen, setColsOpen] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [hideCols, setHideCols] = useState<string[]>([]);
  useEffect(() => { try { setHideCols(JSON.parse(localStorage.getItem(COL_KEY) || "[]")); } catch { /* 기본 항목 */ } }, []);
  const col = (k: string) => !hideCols.includes(k);
  const toggleCol = (k: string) => {
    const v = col(k) ? [...hideCols, k] : hideCols.filter((x) => x !== k);
    setHideCols(v); try { localStorage.setItem(COL_KEY, JSON.stringify(v)); } catch { /* 이 기기만 */ }
  };
  const builtins = builtinChips().filter((b) => b.id === "b-all" || !hidden.includes(b.id));
  useEffect(() => { setHidden(loadHide()); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
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

  const conds: Cond[] = ini ? [...active.conds, { t: "initial", v: ini }] : active.conds;
  const condKey = JSON.stringify(conds);
  const showErr = (e: string) => setErr(e === "NEED_SQL" ? "이 조건은 서버 준비(039 SQL 실행) 후에 찾을 수 있어요." : /BAD_COND initial/.test(e) ? "초성 찾기는 서버 준비(047 SQL 실행) 후에 돼요." : e);

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
    if (c.builtin) {
      const h = [...hidden, c.id]; setHidden(h);
      try { localStorage.setItem(HIDE_KEY, JSON.stringify(h)); } catch { /* 이 기기에 못 남겨도 지금 화면은 바뀜 */ }
      if (active.id === c.id) setActive(builtinChips()[0]);
      return;
    }
    if (server) await sb.rpc("cust_filter_del", { p_id: c.id }); else storeLocal(loadLocal().filter((x) => x.id !== c.id));
    if (active.id === c.id) setActive(builtins[0]);
    if (server) loadChips(); else setSaved(loadLocal());
  };
  const chipLabel = active.name;
  // 줄마다 통화·문자: 번호는 누를 때만 서버에서 받아요 (열람 기록 남음)
  const reach = async (r: Row, how: "call" | "sms") => {
    const { data, error } = await sb.rpc("customer_phone_reveal", { p_branch: r.branch, p_key: r.key, p_purpose: how });
    if (error) return setToast(error.message.includes("DAILY_LIMIT") ? "오늘 볼 수 있는 연락처 수를 넘었어요" : how === "call" ? "전화 걸 권한이 없어요" : "문자 보낼 권한이 없어요");
    const num = String(data ?? "").replace(/\D/g, "");
    if (!num) return setToast("연락처가 없어요");
    window.location.href = `${how === "call" ? "tel" : "sms"}:${num}`;
  };

  const showBranch = me.tier === "owner" && !branch;
  const n = (k: string) => (counts[k] == null ? "" : counts[k]!.toLocaleString());

  return (
    <>
      <header className="top c-top v3-hd">
        <h1>고객</h1>
        <span className="sub num c-m-only">{counts.all == null ? "" : `${counts.all.toLocaleString()}명`}</span>
        <nav className="c-tabs">
          <button className="on">고객 목록 <span className="n">{n("all")}</span></button>
          <Link href="/happycall">연락할 고객 <span className="n">{contact ?? ""}</span></Link>
          <Link href="/membership">회원권</Link>
        </nav>
        <div className="c-right">
          {me.tier === "owner" ? (
            <select className="sel c-bsel" value={branch ?? ""} onChange={(e) => setBranch(e.target.value || null)} aria-label="지점">
              <option value="">전 지점</option>
              {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : null}
          <div className="c-menu">
            <button className="btn" onClick={() => setColsOpen(!colsOpen)}>{ICO_COLS}항목 편집</button>
            {colsOpen && (
              <div className="c-pop c-cols" onMouseLeave={() => setColsOpen(false)}>
                {COLS.map((c) => (
                  <label key={c.k}><input type="checkbox" checked={col(c.k)} onChange={() => toggleCol(c.k)} /> {c.l}</label>
                ))}
              </div>
            )}
          </div>
          <button className="btn ink" onClick={() => setNewCust(true)}>+ 신규 고객</button>
        </div>
      </header>
      <div className="page c-page">
        <div className={`c-chips ${chipsOpen ? "open" : ""}`}>
          <span className="c-lab">저장된 조건</span>
          {[...builtins, ...saved].map((c) => (
            <span key={c.id} className={`chip ${active.id === c.id ? "on" : ""}`}>
              <button className="c-chip-b" onClick={() => setActive(c)} title={c.conds.map((x) => condText(x)).join(" · ") || "모든 고객"}>
                {c.name} <b>{counts[c.id] == null ? "" : counts[c.id]!.toLocaleString()}</b>
              </button>
              {c.id !== "b-all" && (
                <>
                  <button className="c-chip-i" aria-label={`${c.name} 고치기`} title="고치기" onClick={() => setCond({ chip: c })}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /></svg></button>
                  <button className="c-chip-i del" aria-label={`${c.name} 지우기`} title="지우기" onClick={() => removeChip(c)}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg></button>
                </>
              )}
            </span>
          ))}
          {!builtinChips().some((b) => b.id === active.id) && !saved.some((c) => c.id === active.id) && (
            <span className="chip on"><button className="c-chip-b" onClick={() => setCond({ chip: active })}>{active.name} <b>{total.toLocaleString()}</b></button>
              <button className="c-chip-i del" aria-label="조건 지우기" onClick={() => setActive(builtinChips()[0])}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg></button></span>
          )}
          <button className="chip c-mchip-more c-m-only" onClick={() => setChipsOpen(!chipsOpen)}>{chipsOpen ? "접기" : "더보기"}</button>
          <button className="chip add" onClick={() => setCond({})}><span className="c-pc-only">+ 추가</span><span className="c-m-only">+ 조건</span></button>
          <button className="edit" onClick={() => setCond({ chip: active })}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16z" /></svg> 조건 편집</button>
        </div>

        <div className="c-ini" role="group" aria-label="초성으로 찾기">
          <span className="c-lab">초성</span>
          <button className={ini ? "" : "on"} onClick={() => setIni(null)}>전체</button>
          {INITIALS.map((k) => <button key={k} className={ini === k ? "on" : ""} onClick={() => setIni(ini === k ? null : k)}>{k}</button>)}
        </div>

        <form className="c-tools" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <input className="inp c-q" placeholder="이름 · 뒤 4자리 · 고객번호" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {query && <button type="button" className="btn t" onClick={() => { setQ(""); setQuery(""); }}>지우기</button>}
          <button type="button" className="btn" onClick={() => setCond({})}><span className="c-pc-only">검색조건 만들기</span><span className="c-m-only">조건 만들기</span></button>
          <span className="c-right c-tot num">{chipLabel}{ini ? ` · ${ini}` : ""} · <b>{loading ? "…" : total.toLocaleString()}</b></span>
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
                <th>고객</th>{col("phone") && <th>연락처</th>}{col("ms") && <th>회원권</th>}{col("rem") && <th>잔여</th>}{col("mgr") && <th>담당</th>}{col("visit") && <th>최근 방문</th>}
                {showBranch && <th>지점</th>}
                <th className="c-act-h">바로 실행</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked.has(id(r));
                return (
                  <tr key={id(r)} className={on ? "sel" : ""} onClick={() => router.push(chartUrl(r))}>
                    <td className="ck" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="c-ck" checked={on} onChange={() => toggle(r)} aria-label={`${r.name} 선택`} /></td>
                    <td className="nm"><span className="v3-nmc"><span className="v3-av">{r.name.slice(0, 1)}</span><span className="v3-2l"><b>{r.name}</b>{r.customer_no && <small className="num">No. {r.customer_no}</small>}</span></span></td>
                    {col("phone") && <td className="num">{r.phone || "-"}</td>}
                    {col("ms") && <td className="ms">{r.membership ? <span className="v3-2l"><span>{r.membership}</span>{r.ends_on && <small className="num">{ymd2(r.ends_on)} 만료</small>}</span> : <span className="c-muted">—</span>}</td>}
                    {col("rem") && <td><Rem r={r} sel={on} /></td>}
                    {col("mgr") && <td>{r.manager || "-"}</td>}
                    {col("visit") && <td className="num">{r.last_visit_on ? <span className="v3-2l"><span>{r.last_visit_on.slice(5).replace("-", ".")}</span><small className={old(r.last_visit_on) ? "v3-old" : ""}>{ago(r.last_visit_on)}</small></span> : <span className="c-muted">—</span>}</td>}
                    {showBranch && <td>{r.branch}</td>}
                    <td onClick={(e) => e.stopPropagation()} className="c-act">
                      <button className="btn sm" onClick={() => reach(r, "call")}>{ICO_CALL}통화</button>
                      <button className="btn sm" onClick={() => reach(r, "sms")}>{ICO_SMS}문자</button>
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
                <span className="c-cd-act" onClick={(e) => e.stopPropagation()}>
                  <button className="btn sm" onClick={() => reach(r, "call")}>{ICO_CALL}통화</button>
                  <button className="btn sm" onClick={() => reach(r, "sms")}>{ICO_SMS}문자</button>
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

      {newCust && <NewCustomer branch={branch ?? me.branch} owner={me.tier === "owner"} onClose={() => setNewCust(false)} onDone={(b, k) => router.push(`/customers/chart?b=${encodeURIComponent(b)}&k=${encodeURIComponent(k)}`)} />}
      {toast && <div className="c-toast" role="status">{toast}</div>}
      {cond && (
        <CondModal
          branch={branch ?? (me.tier === "owner" ? null : me.branch)} q={query} chip={cond.chip}
          onClose={() => setCond(null)}
          onApply={async (cs, name) => {
            setCond(null);
            const editId = cond.chip && !cond.chip.builtin && saved.some((x) => x.id === cond.chip!.id) ? cond.chip.id : undefined;
            if (name) { const c = await saveChip(name, cs, editId); if (c) setActive(c); }
            else setActive({ id: "tmp", name: cs.map((x) => condText(x)).join(" · ") || "전체고객", conds: cs });
          }}
        />
      )}
    </>
  );
}


// 신규 고객: 이름 + 연락처만 받고 바로 고객 차트로 가요 (나머지는 차트에서)
function NewCustomer({ branch, owner, onClose, onDone }: { branch: string | null; owner: boolean; onClose: () => void; onDone: (b: string, k: string) => void }) {
  const [b, setB] = useState(branch || BRANCHES[0]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || phone.replace(/\D/g, "").length < 10) return setErr("이름과 연락처(10자리 이상)를 넣어 주세요.");
    setBusy(true);
    const { data, error } = await sb.rpc("customer_create", { p_branch: b, p_name: name.trim(), p_phone: phone.replace(/\D/g, "") });
    setBusy(false);
    if (error) return setErr(/customer_create|function/i.test(error.message) ? "신규 고객 등록은 서버 준비 중이에요." : error.message);
    onDone(b, String(data));
  };
  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="c-new" role="dialog" aria-label="신규 고객" style={{ zIndex: 41 }}>
        <h2>신규 고객</h2>
        {owner && (
          <div className="v3-seg c-new-b">{BRANCHES.map((x) => <button key={x} className={x === b ? "on" : ""} onClick={() => setB(x)}>{x}</button>)}</div>
        )}
        <label>이름<input className="inp" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label>연락처<input className="inp num" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" /></label>
        {err && <p className="c-new-err">{err}</p>}
        <div className="c-new-ft">
          <button className="btn" onClick={onClose}>닫기</button>
          <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중…" : "등록하고 차트 열기"}</button>
        </div>
      </div>
    </>
  );
}
