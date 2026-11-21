"use client";
import { useFollowTop } from "@/lib/branch";
import "./customers.css";
import "./list.css";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { has } from "@/lib/perm";
import { Ico } from "@/lib/ico";

import { Cond, Chip, builtinChips, condText, INITIALS } from "./cond";
import CondModal from "./CondModal";
import ColsDrawer, { ColPrefs, DEFAULT_COLS } from "./ColsDrawer";
import { searchCustomers, sexAge, type Row } from "./search";

// 저장한 칩: 서버(cust_filters)에 저장해 지점이 같이 써요. 서버 표가 아직 없으면 이 기기에만 저장.
const SAVE_KEY = "mera.cust.chips2";
const HIDE_KEY = "mera.cust.hide"; // 지운 기본 칩 (이 기기)
const loadHide = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"); } catch { return []; } };
const loadLocal = (): Chip[] => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "[]"); } catch { return []; } };
const storeLocal = (v: Chip[]) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } };

const PAGE = 20;
const COL_KEY = "mera.cust.cols";
const kst = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
const days = (d: string) => Math.round((Date.parse(kst()) - Date.parse(d.slice(0, 10))) / 864e5);
const ymd2 = (d: string | null) => (d ? d.slice(2, 10).replaceAll("-", ".") : "");
const ago = (d: string) => { const n = days(d); return n === 0 ? "오늘" : n > 0 ? `${n}일 전` : `${-n}일 후`; };
const md = (d: string) => d.slice(5, 10).replace("-", ".");
const chartUrl = (r: Row, tab?: string) => `/customers/chart?b=${encodeURIComponent(r.branch)}&k=${encodeURIComponent(r.key)}${tab ? `&tab=${tab}` : ""}`;
const remText = (r: Row) => (r.min_remaining == null ? null : `잔여 ${r.min_remaining}회`);

export default function Customers() {
  const me = useMe();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [deleted, setDeleted] = useState(false); // 삭제 고객 탭
  const [active, setActive] = useState<Chip>(() => builtinChips()[0]);
  const [branch, setBranch] = useState<string | null>(me.branch || null);
  useFollowTop(me, setBranch);
  const [mgr, setMgr] = useState("");
  const [mgrs, setMgrs] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [contact, setContact] = useState<number | null>(null);
  const [delCnt, setDelCnt] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Map<string, Row>>(new Map());
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
  const [mgrPick, setMgrPick] = useState(false);
  const [mMore, setMMore] = useState(false);
  const [cols, setCols] = useState<ColPrefs>(DEFAULT_COLS);
  const [branchCols, setBranchCols] = useState<ColPrefs>(DEFAULT_COLS);
  const [undoCols, setUndoCols] = useState<ColPrefs | null>(null);
  const [tick, setTick] = useState(0);
  // 목록 칸: 나만 보는 칸(이 기기) → 없으면 지점 기본값(서버, 050) → 없으면 시안 기본
  useEffect(() => {
    let mine: ColPrefs | null = null;
    try { const x = JSON.parse(localStorage.getItem(COL_KEY) || "null"); if (x?.pc && x?.m) mine = x; } catch { /* 기본 */ }
    sb.rpc("customer_cols_get", { p_branch: me.branch }).then(({ data, error }) => {
      const bd = !error && data?.pc ? (data as ColPrefs) : DEFAULT_COLS;
      setBranchCols(bd); setCols(mine ?? bd);
    });
  }, [me.branch]);
  const saveCols = (v: ColPrefs) => {
    setUndoCols(cols); setCols(v); setColsOpen(false);
    try { localStorage.setItem(COL_KEY, JSON.stringify(v)); } catch { /* 이 기기만 */ }
    setToast("목록 칸을 저장했어요.");
  };
  const saveBranchCols = async (v: ColPrefs) => {
    const { error } = await sb.rpc("customer_cols_set", { p_branch: me.branch, p_cols: v });
    if (error) return setToast(/function|schema cache/i.test(error.message) ? "지점 기본값은 서버 준비(050 SQL 실행) 후에 저장돼요" : "권한이 없어요");
    setBranchCols(v); try { localStorage.removeItem(COL_KEY); } catch { /* */ }
    setUndoCols(cols); setCols(v); setColsOpen(false); setToast("지점 기본값으로 저장했어요.");
  };
  const builtins = builtinChips().filter((b) => b.id === "b-all" || !hidden.includes(b.id));
  useEffect(() => { setHidden(loadHide()); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  const chipBranch = branch ?? me.branch;
  const canEdit = has(me, "customer.edit", false);
  const canDel = me.tier !== "staff" && canEdit;
  const canExcel = has(me, "export.excel");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("q"); if (v) { setQ(v); setQuery(v); }
    if (p.get("tab") === "deleted") setDeleted(true);
  }, []);

  // 저장한 칩 불러오기 (서버 → 없으면 이 기기)
  const loadChips = useCallback(async () => {
    const { data, error } = await sb.rpc("cust_filter_list", { p_branch: chipBranch || null });
    if (error) { setServer(false); setSaved(loadLocal()); return; }
    setServer(true);
    setSaved(((data ?? []) as { id: string; name: string; conds: Cond[] }[]).map((d) => ({ id: d.id, name: d.name, conds: d.conds ?? [] })));
  }, [chipBranch]);
  useEffect(() => { loadChips(); }, [loadChips]);

  // 담당자 목록 (담당자 전체 ▾ · 담당자 변경)
  useEffect(() => {
    sb.rpc("customer_manager_names", { p_branch: branch }).then(({ data, error }) => {
      if (!error) setMgrs(((data ?? []) as { name: string }[]).map((x) => x.name));
    });
  }, [branch, tick]);

  const extra: Cond[] = [...(ini ? [{ t: "initial", v: ini } as Cond] : []), ...(mgr ? [{ t: "manager", v: mgr } as Cond] : []), ...(deleted ? [{ t: "deleted" } as Cond] : [])];
  const conds: Cond[] = deleted ? extra : [...active.conds, ...extra];
  const condKey = JSON.stringify(conds);
  const showErr = (e: string) => setErr(
    e === "NEED_SQL" ? "이 조건은 서버 준비(039 SQL 실행) 후에 찾을 수 있어요."
      : /BAD_COND initial/.test(e) ? "초성 찾기는 서버 준비(047 SQL 실행) 후에 돼요."
      : /BAD_COND (manager|deleted)/.test(e) ? "담당자로 찾기 · 삭제 고객은 서버 준비(050 SQL 실행) 후에 돼요."
      : /BAD_COND (report_unsent|lounge_idle)/.test(e) ? "리포트 · 라운지 조건은 고객 앱 기록이 생기면 찾을 수 있어요."
      : e);
  useEffect(() => { setPage(0); }, [condKey, query, branch]);

  // 목록 (한 쪽 20명)
  useEffect(() => {
    let on = true;
    setLoading(true); setPicked(new Map()); setErr("");
    searchCustomers(JSON.parse(condKey), query, branch, PAGE, page * PAGE).then(({ data, error }) => {
      if (!on) return;
      showErr(error);
      setRows(data); if (data.length || page === 0) setTotal(data[0]?.total ?? 0); setLoading(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, condKey, branch, page, tick]);

  // 칩 숫자: 같은 함수로 1명만 받아 total 을 읽어요 (이름·번호는 쓰지 않음)
  const chipsKey = JSON.stringify(saved.map((c) => [c.id, c.conds]));
  useEffect(() => {
    let on = true;
    const all = [...builtinChips(), ...saved];
    Promise.all([...all.map((c) => searchCustomers(c.conds, query, branch, 1, 0)), searchCustomers([{ t: "deleted" }], "", branch, 1, 0)]).then((res) => {
      if (!on) return;
      const c: Record<string, number | null> = {};
      res.slice(0, all.length).forEach((r, i) => { c[all[i].id] = r.error ? null : r.data[0]?.total ?? 0; });
      setCounts(c);
      const d = res[all.length]; setDelCnt(d.error ? null : d.data[0]?.total ?? 0);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, branch, chipsKey, tick]);

  // 연락할 고객 = 해피콜 대상 수 (숫자만 셈)
  useEffect(() => {
    sb.rpc("happycall_list", { p_branch: branch ?? (me.tier === "owner" ? null : me.branch) })
      .then(({ data, error }) => setContact(error ? null : (data ?? []).length));
  }, [branch, me.tier, me.branch]);

  const id = (r: Row) => `${r.branch}:${r.key}`;
  const toggle = (r: Row) => setPicked((p) => { const n = new Map(p); if (n.has(id(r))) n.delete(id(r)); else n.set(id(r), r); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(id(r)));
  const someOn = picked.size > 0 && !allOn;
  const toggleAll = () => setPicked(allOn ? new Map() : new Map(rows.map((r) => [id(r), r])));
  const items = () => [...picked.values()].map((r) => ({ b: r.branch, k: r.key }));

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
    if (!confirm(`'${c.name}' 조건을 지울까요?`)) return;
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
  // 줄마다 통화·문자: 번호는 누를 때만 서버에서 받아요 (열람 기록 남음)
  const reach = async (r: Row, how: "call" | "sms") => {
    const { data, error } = await sb.rpc("customer_phone_reveal", { p_branch: r.branch, p_key: r.key, p_purpose: how });
    if (error) return setToast(error.message.includes("DAILY_LIMIT") ? "오늘 볼 수 있는 연락처 수를 넘었어요" : how === "call" ? "전화 걸 권한이 없어요" : "문자 보낼 권한이 없어요");
    const num = String(data ?? "").replace(/\D/g, "");
    if (!num) return setToast("연락처가 없어요");
    window.location.href = `${how === "call" ? "tel" : "sms"}:${num}`;
  };
  const bulk = async (fn: string, args: Record<string, unknown>, done: string) => {
    const { data, error } = await sb.rpc(fn, { p_items: items(), ...args });
    if (error) return setToast(/function|schema cache/i.test(error.message) ? "서버 준비(050 SQL 실행) 후에 돼요" : /NO_PERMISSION/.test(error.message) ? "권한이 없어요" : error.message);
    setToast(`${Number(data ?? 0)}명 ${done}`); setPicked(new Map()); setMgrPick(false); setMMore(false); setTick((x) => x + 1);
  };
  const delPicked = () => { if (confirm(`${picked.size}명을 삭제할까요? 삭제 고객 탭에서 되살릴 수 있어요.`)) bulk("customer_bulk_delete", {}, "삭제했어요"); };
  const restorePicked = () => bulk("customer_bulk_restore", {}, "되살렸어요");
  const soon = (w: string) => setToast(`${w}는 준비 중이에요`);

  // 엑셀 다운: 지금 조건 그대로 (연락처는 가린 채), 최대 5,000명
  const excel = async () => {
    const all: Row[] = [];
    for (let off = 0; off < 5000; off += 200) {
      const { data, error } = await searchCustomers(conds, query, branch, 200, off);
      if (error) { showErr(error); return; }
      all.push(...data); if (data.length < 200) break;
    }
    const head = ["고객", "성별·나이", "연락처", "회원권", "만료", "잔여", "담당", "최근 방문", "다음 예약", "지점"];
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [head, ...all.map((r) => [r.name, sexAge(r), r.phone, r.membership, r.ends_on, r.min_remaining, r.manager, r.last_visit_on, r.next_rsv, r.branch])].map((l) => l.map(esc).join(","));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `고객목록_${kst()}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const showBranch = me.tier === "owner" && !branch;
  const n = (k: string) => (counts[k] == null ? "" : counts[k]!.toLocaleString());
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const pageNums = Array.from({ length: Math.min(5, pages) }, (_, i) => Math.min(Math.max(0, page - 2), Math.max(0, pages - 5)) + i);
  const chipList = [...builtins, ...saved];
  const isTmp = !builtinChips().some((b) => b.id === active.id) && !saved.some((c) => c.id === active.id);
  const nCols = 3 + cols.pc.length + (showBranch ? 1 : 0);

  const resetAll = () => { setActive(builtinChips()[0]); setIni(null); setMgr(""); setQ(""); setQuery(""); };
  const emptyParts = [...(deleted ? ["삭제 고객"] : active.id === "b-all" ? [] : [active.name]), ...(mgr ? [`담당 ${mgr}`] : []), ...(ini ? [`초성 ${ini}`] : []), ...(query ? [query] : [])];
  const emptyDrop: Drop | undefined = mgr ? { label: "담당 조건 빼기", run: () => setMgr("") } : ini ? { label: "초성 조건 빼기", run: () => setIni(null) } : query ? { label: "검색어 지우기", run: () => { setQ(""); setQuery(""); } } : undefined;

  const Bar = ({ m }: { m?: boolean }) => (
    <div className={`cl-selbar ${m ? "m" : ""}`}>
      <button className={`cl-cb ${allOn ? "on" : someOn ? "mix" : ""}`} onClick={toggleAll} aria-label="모두 선택">{allOn && <Ico n="check" s={12} />}</button>
      <b>{picked.size}명 선택</b>
      {m && <span className="cl-of">/ {total.toLocaleString()}명</span>}
      <div className="cl-r">
        {deleted ? (
          <button className="btn sm" onClick={restorePicked} disabled={!canDel}><Ico n="undo" />되살리기</button>
        ) : (
          <>
            <button className="btn sm cl-red" onClick={() => soon("해피콜에 넣기")}>{!m && <Ico n="call" />}해피콜에 넣기</button>
            {m ? (
              <div className="cl-menu">
                <button className="btn sm cl-sq" aria-label="더보기" onClick={() => setMMore(!mMore)}>⋯</button>
                {mMore && (
                  <div className="cl-pop">
                    <button onClick={() => soon("문자 보내기")}>문자 보내기</button>
                    <button disabled={!canEdit} onClick={() => { setMMore(false); setMgrPick(true); }}>담당자 변경</button>
                    {canDel && <button onClick={delPicked}>삭제</button>}
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="btn sm" onClick={() => soon("문자 보내기")}><Ico n="sms" />문자 보내기</button>
                <div className="cl-menu">
                  <button className="btn sm" disabled={!canEdit} onClick={() => setMgrPick(!mgrPick)}><Ico n="user" />담당자 변경</button>
                  {mgrPick && !m && <MgrPop />}
                </div>
                {canDel && <button className="btn sm" onClick={delPicked}>삭제</button>}
              </>
            )}
          </>
        )}
      </div>
      {mgrPick && m && <MgrPop />}
    </div>
  );
  const MgrPop = () => (
    <div className="cl-pop cl-mgr" onMouseLeave={() => setMgrPick(false)}>
      <div className="cl-pop-h">{picked.size}명 담당자를</div>
      {mgrs.map((x) => <button key={x} onClick={() => bulk("customer_bulk_manager", { p_manager: x }, `담당자를 ${x}(으)로 바꿨어요`)}>{x}</button>)}
      {mgrs.length === 0 && <span className="cl-pop-e">담당자 목록이 없어요</span>}
    </div>
  );

  return (
    <div className="cl">
      <header className="cl-sub">
        <h1>고객</h1>
        <span className="cl-mcnt">{counts["b-all"] == null ? "" : `${counts["b-all"]!.toLocaleString()}명`}</span>
        <nav className="cl-seg">
          <button className={deleted ? "" : "on"} onClick={() => { setDeleted(false); }}>고객 목록 <span className="c">{n("b-all")}</span></button>
          <Link href="/happycall">연락할 고객 <span className="c">{contact ?? ""}</span></Link>
          <button className={deleted ? "on" : ""} onClick={() => { setDeleted(true); }}>삭제 고객 <span className="c">{delCnt ?? ""}</span></button>
          <Link href="/membership">회원권</Link>
        </nav>
        <div className="cl-r">
          <button className="btn cl-pc" onClick={() => setColsOpen(true)}><Ico n="cols" />항목 편집</button>
          <button className="btn cl-pc" onClick={() => (canExcel ? excel() : setToast("엑셀 다운은 대표관리자가 허락한 직원만 돼요"))}><Ico n="down" />엑셀 다운</button>
          <button className="btn dk cl-pc" onClick={() => setNewCust(true)}><Ico n="plus" />신규 고객</button>
        </div>
      </header>

      <div className="cl-page">
        {!deleted && (
          <div className={`cl-chips ${chipsOpen ? "open" : ""}`}>
            <span className="cl-lab">저장된 조건</span>
            {chipList.map((c) => (
              <span key={c.id} className={`fchip ${active.id === c.id ? "on" : ""}`}>
                <button className="fb" onClick={() => (c.app ? (setActive(c), showErr("BAD_COND report_unsent")) : setActive(c))} title={c.conds.map((x) => condText(x)).join(" · ") || "모든 고객"}>
                  {c.name}<span className="n">{c.app ? "—" : n(c.id)}</span>
                </button>
                {c.id !== "b-all" && (
                  <span className="ed">
                    <button aria-label={`${c.name} 고치기`} title="고치기" onClick={() => setCond({ chip: c })}><Ico n="pen" /></button>
                    <button aria-label={`${c.name} 지우기`} title="지우기" onClick={() => removeChip(c)}><Ico n="x" /></button>
                  </span>
                )}
              </span>
            ))}
            {isTmp && (
              <span className="fchip on">
                <button className="fb" onClick={() => setCond({ chip: active })}>{active.name}<span className="n">{total.toLocaleString()}</span></button>
                <span className="ed"><button aria-label="조건 지우기" onClick={() => setActive(builtinChips()[0])}><Ico n="x" /></button></span>
              </span>
            )}
            <button className="fchip more cl-m" onClick={() => setChipsOpen(!chipsOpen)}>{chipsOpen ? "접기 ▴" : "더보기 ▾"}</button>
            <button className="fchip dash" onClick={() => setCond({})}><span className="cl-pc"><Ico n="plus" />추가</span><span className="cl-m">+ 조건</span></button>
            <button className="cl-link cl-pc" onClick={() => setCond({ chip: active })}><Ico n="pen" />조건 편집</button>
          </div>
        )}

        <div className="cl-cho" role="group" aria-label="초성으로 찾기">
          <span className="lb">초성</span>
          <button className={ini ? "" : "on"} onClick={() => setIni(null)}>전체</button>
          {INITIALS.map((k) => <button key={k} className={ini === k ? "on" : ""} onClick={() => setIni(ini === k ? null : k)}>{k}</button>)}
        </div>

        <form className="cl-tb" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
          <label className="cl-search"><Ico n="search" />
            <input placeholder="이름 · 뒤 4자리 · 비고" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
            {query && <button type="button" aria-label="지우기" onClick={() => { setQ(""); setQuery(""); }}><Ico n="x" /></button>}
          </label>
          <button type="button" className="btn" onClick={() => setCond({})}><Ico n="filter" className="cl-pc" /><span className="cl-pc">검색조건 만들기</span><span className="cl-m">조건 만들기</span></button>
          <label className="cl-msel cl-pc">
            <select value={mgr} onChange={(e) => setMgr(e.target.value)} aria-label="담당자">
              <option value="">담당자 전체</option>
              {mgrs.map((x) => <option key={x} value={x}>{x}</option>)}
            </select><Ico n="chev" />
          </label>
          <span className="cl-tot cl-pc">{deleted ? "삭제 고객" : active.name}{ini ? ` · ${ini}` : ""}{mgr ? ` · ${mgr}` : ""} · <b>{loading ? "…" : `${total.toLocaleString()}명`}</b></span>
        </form>

        {err && <p className="cl-err">{err}</p>}

        <div className="cl-card">
          {picked.size > 0 && <div className="cl-pc"><Bar /></div>}
          <table className="cl-t">
            <thead>
              <tr>
                <th className="ctr" style={{ width: 48 }}>{picked.size === 0 && rows.length > 0 && <button className="cl-cb" onClick={toggleAll} aria-label="모두 선택" />}</th>
                <th>고객</th>
                {cols.pc.map((k) => <Th key={k} k={k} />)}
                {showBranch && <th>지점</th>}
                <th className="ctr">바로 실행</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked.has(id(r));
                const sa = sexAge(r);
                return (
                  <tr key={id(r)} className={on ? "pick" : ""} onClick={() => router.push(chartUrl(r))}>
                    <td className="ctr" onClick={(e) => e.stopPropagation()}><button className={`cl-cb ${on ? "on" : ""}`} onClick={() => toggle(r)} aria-label={`${r.name} 선택`}>{on && <Ico n="check" s={12} />}</button></td>
                    <td><div className="nm"><div className="av">{r.name.slice(0, 1)}</div><div><div className="t">{r.name}</div><div className="s">{sa || (r.customer_no ? `No. ${r.customer_no}` : "")}</div></div></div></td>
                    {cols.pc.map((k) => <Td key={k} k={k} r={r} />)}
                    {showBranch && <td>{r.branch}</td>}
                    <td className="ctr" onClick={(e) => e.stopPropagation()}>
                      <div className="cl-act">
                        <button className="btn sm" onClick={() => reach(r, "call")}><Ico n="call" />통화</button>
                        <button className="btn sm" onClick={() => reach(r, "sms")}><Ico n="sms" />문자</button>
                        <div className="cl-menu">
                          <button className="btn sm t" aria-label="관리" onClick={() => setMenu(menu === id(r) ? null : id(r))}><Ico n="dots" /></button>
                          {menu === id(r) && (
                            <div className="cl-pop" onMouseLeave={() => setMenu(null)}>
                              <Link href={chartUrl(r)}>고객 차트 보기</Link>
                              <Link href={chartUrl(r, "call")}>상담·해피콜 기록</Link>
                              <Link href={chartUrl(r, "memo")}>메모 쓰기</Link>
                              <Link href={`/schedule?new=1`} onClick={() => { try { sessionStorage.setItem("rsv:prefill", JSON.stringify({ branch: r.branch, key: r.key, name: r.name })); } catch { /* 없어도 새 예약은 열림 */ } }}>예약 잡기</Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && !err && <tr className="empty"><td colSpan={nCols}><Empty parts={emptyParts} drop={emptyDrop} onReset={resetAll} /></td></tr>}
              {loading && rows.length === 0 && <tr className="empty"><td colSpan={nCols} className="cl-loading">불러오는 중…</td></tr>}
            </tbody>
          </table>
          {total > 0 && (
            <div className="cl-pager">
              <span className="cap">{total.toLocaleString()}명 중 {(page * PAGE + 1).toLocaleString()}–{Math.min(total, page * PAGE + rows.length).toLocaleString()}명</span>
              <div className="pg">
                <button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="이전"><Ico n="left" /></button>
                {pageNums.map((p) => <button key={p} className={`btn sm ${p === page ? "cur" : ""}`} onClick={() => setPage(p)}>{p + 1}</button>)}
                <button className="btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="다음"><Ico n="right" /></button>
              </div>
            </div>
          )}
        </div>

        {/* 모바일 (M03 v3b): 선택 띠 → 카드 */}
        <div className="cl-mlist">
          {picked.size > 0 && <Bar m />}
          {rows.map((r) => {
            const on = picked.has(id(r));
            const sa = sexAge(r);
            return (
              <div key={id(r)} className="mcard" onClick={() => router.push(chartUrl(r))}>
                <button className={`cbx ${on ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); toggle(r); }} aria-label={`${r.name} 선택`}>{on && <Ico n="check" s={14} />}</button>
                <div className="mc-b">
                  <div className="l1"><b>{r.name}</b>{sa && <span className="sa">{sa}</span>}{showBranch && <span className="sa">{r.branch}</span>}<span className="sp" />{cols.m.includes("rem") && remText(r) && <span className={`bdg ${r.min_remaining! <= 2 ? "red" : ""}`}>{remText(r)}</span>}</div>
                  <div className="l2">{cols.m.filter((k) => k !== "rem").map((k) => mText(k, r)).filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </div>
            );
          })}
          {!loading && rows.length === 0 && !err && <Empty m parts={emptyParts} drop={emptyDrop} onReset={resetAll} />}
          {rows.length > 0 && rows.length < total && (
            <div className="cl-mpg num">
              <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>이전</button>
              <span>{page + 1} / {pages}</span>
              <button className="btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>다음</button>
            </div>
          )}
        </div>
      </div>

      {newCust && <NewCustomer branch={branch ?? me.branch} owner={me.tier === "owner"} onClose={() => setNewCust(false)} onDone={(b, k) => router.push(`/customers/chart?b=${encodeURIComponent(b)}&k=${encodeURIComponent(k)}`)} />}
      {colsOpen && <ColsDrawer value={cols} branchDefault={branchCols} canBranch={me.tier !== "staff"} onClose={() => setColsOpen(false)} onSave={saveCols} onSaveBranch={saveBranchCols} />}
      {toast && <div className="c-toast" role="status">{toast}{undoCols && /칸을|기본값으로/.test(toast) && <button className="cl-undo" onClick={() => { setCols(undoCols); try { localStorage.setItem(COL_KEY, JSON.stringify(undoCols)); } catch { /* */ } setUndoCols(null); setToast(""); }}>되돌리기</button>}</div>}
      {cond && (
        <CondModal
          branch={branch ?? (me.tier === "owner" ? null : me.branch)} q={query} chip={cond.chip}
          onClose={() => setCond(null)}
          onApply={async (cs, name) => {
            setCond(null); setDeleted(false);
            const editId = cond.chip && !cond.chip.builtin && saved.some((x) => x.id === cond.chip!.id) ? cond.chip.id : undefined;
            if (name) { const c = await saveChip(name, cs, editId); if (c) setActive(c); }
            else setActive({ id: "tmp", name: cs.map((x) => condText(x)).join(" · ") || "전체", conds: cs });
          }}
        />
      )}
    </div>
  );
}


// 표 칸 (항목 편집 순서대로)
function Th({ k }: { k: string }) {
  const L: Record<string, React.ReactNode> = { phone: "연락처", ms: "회원권", rem: "잔여", st: "상태", mgr: "담당", reg: "등록일", visit: "최근 방문", next: "다음 예약", src: "등록 경로" };
  if (k === "lounge") return <th className="num" style={{ paddingRight: 24 }}>라운지 <span style={{ fontWeight: 400 }}>미라클·명상·응원</span></th>;
  return <th>{L[k] ?? k}</th>;
}
function Td({ k, r }: { k: string; r: Row }) {
  switch (k) {
    case "phone": return <td className="muted">{r.phone || "—"}</td>;
    case "ms": return <td>{r.membership ? <><div className="t" style={{ fontWeight: 600 }}>{r.membership}</div>{r.ends_on && <div className="cap">{ymd2(r.ends_on)} 만료</div>}</> : <span className="cap">—</span>}</td>;
    case "rem": return <td>{remText(r) ? <span className={`bdg ${r.min_remaining! <= 2 ? "red" : r.min_remaining! <= 3 ? "amb" : ""}`}>{remText(r)}</span> : <span className="cap">—</span>}</td>;
    case "st": return <td><div style={{ display: "flex", gap: 4 }}>{(r.status_tags ?? []).length ? r.status_tags!.map((t) => <span key={t} className={`bdg ${/리포트/.test(t) ? "red" : "amb"}`}>{t}</span>) : <span className="cap">—</span>}</div></td>;
    case "lounge": return <td className="num" style={{ paddingRight: 24 }}>{r.lounge ? r.lounge.split("·").map((v, i) => <span key={i}>{i > 0 && " · "}<span style={v.trim() === "0" ? { color: "var(--ink-4)" } : undefined}>{v.trim()}</span></span>) : <span className="cap">—</span>}</td>;
    case "mgr": return <td>{r.manager || <span className="cap">—</span>}</td>;
    case "reg": return <td>{r.registered_on ? ymd2(r.registered_on) : <span className="cap">—</span>}</td>;
    case "src": return <td>{r.source || <span className="cap">—</span>}</td>;
    case "visit": return <td>{r.last_visit_on ? <><div>{md(r.last_visit_on)}</div><div className="cap" style={days(r.last_visit_on) > 14 ? { color: "var(--amb)", fontWeight: 600 } : undefined}>{ago(r.last_visit_on)}</div></> : <span className="cap">—</span>}</td>;
    case "next": return <td>{r.next_rsv ? <span className="bdg grn"><Ico n="cal" s={12} />{md(r.next_rsv)} {r.next_rsv.slice(11, 16)}</span> : <span className="cap">없음</span>}</td>;
  }
  return <td />;
}
// 모바일 카드 둘째 줄
function mText(k: string, r: Row): string {
  switch (k) {
    case "ms": return [r.membership, r.ends_on && `${ymd2(r.ends_on)} 만료`].filter(Boolean).join(" · ");
    case "visit": return r.last_visit_on ? `최근 ${r.last_visit_on.slice(5, 10)}` : "";
    case "mgr": return r.manager ? `담당 ${r.manager}` : "";
    case "next": return r.next_rsv ? `다음 ${md(r.next_rsv)} ${r.next_rsv.slice(11, 16)}` : "";
    case "phone": return r.phone ?? "";
    case "reg": return r.registered_on ? `등록 ${ymd2(r.registered_on)}` : "";
    case "src": return r.source ?? "";
    case "st": return (r.status_tags ?? []).join(" · ");
    case "lounge": return r.lounge ? `라운지 ${r.lounge}` : "";
  }
  return "";
}

// 결과 없음 (P34 · U-MO-CUS-7): 지금 걸린 조건을 보여 주고 하나 빼거나 모두 지우기
type Drop = { label: string; run: () => void };
function Empty({ m, parts, drop, onReset }: { m?: boolean; parts: string[]; drop?: Drop; onReset: () => void }) {
  return (
    <div className={`cl-empty ${m ? "m" : ""}`}>
      <b>이 조건에 맞는 고객이 없어요</b>
      {parts.length > 0 && <span className="d">{parts.map((p) => `'${p}'`).join(" + ")} 조건이에요. 조건을 하나 빼거나 {drop?.label.startsWith("담당") ? "담당자를 바꿔" : "다시 찾아"} 보세요.</span>}
      <div className="bt">
        {drop && <button className="btn sm" onClick={drop.run}>{drop.label}</button>}
        <button className="btn sm t" onClick={onReset}>조건 모두 지우기</button>
      </div>
    </div>
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
