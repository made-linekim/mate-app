"use client";
// 검색조건 만들기 — v3 확정 시안 P11(PC 오른쪽 640 서랍) · M04(모바일 전체 화면).
// 조건을 여러 개 쌓고(모두 만족), 칩 이름을 넣어 칩으로 저장하거나 조회만 해요.
import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/sb";
import { Chip, Cond, CondT, Mode, OFFS, offLabel, rangeOf, today, typeOf } from "./cond";
import { searchCustomers } from "./search";
import "./cond-v3.css";

type Prog = { id: string; name: string; grp: string | null; parent_id: string | null };
type Row = { id: number; t: CondT; mode: Mode; a: number; b: number; pf: string; pt: string; days: number; min: number; max: number; sel: string[] | null; v: string };

// 조건 추가 메뉴 (시안 그대로 세 묶음). off = 아직 기록이 없어 못 찾는 조건
const MENU: { g: string; items: { t: CondT | "visits" | "points" | "grade"; l: string; off?: string }[] }[] = [
  { g: "방문 · 예약", items: [{ t: "usage", l: "이용관리" }, { t: "rsv", l: "예약일" }, { t: "first_visit", l: "처음방문일" }, { t: "last_visit", l: "최종방문일" }, { t: "dormant", l: "미방문일 (N일 이상)" }, { t: "visits", l: "방문수", off: "준비 중" }] },
  { g: "회원권", items: [{ t: "period_end", l: "기간회원권 만료일" }, { t: "period_sold", l: "기간회원권 판매일" }, { t: "period_hold", l: "기간회원권 보유고객" }, { t: "count_left", l: "회차회원권 잔여수" }, { t: "count_sold", l: "회차회원권 판매일" }, { t: "count_used", l: "회차회원권 사용일" }] },
  { g: "고객", items: [{ t: "birthday", l: "생일", off: "생일 정보 없음" }, { t: "points", l: "잔여포인트", off: "준비 중" }, { t: "manager", l: "담당자" }, { t: "grade", l: "고객등급", off: "준비 중" }] },
];
const LABEL = (t: CondT) => (t === "manager" ? "담당자" : t === "usage" ? "이용권 · 관리" : typeOf(t)?.l ?? t);
const short = (d: string) => d.slice(2).replace(/-/g, ".");

let seq = 1;
const toRow = (c: Cond): Row => ({
  id: seq++, t: c.t === "member" ? "period_hold" : c.t === "new" ? "first_visit" : c.t,
  mode: c.from ? "pick" : "day", a: 0, b: 0, pf: c.from ?? today(), pt: c.to ?? today(),
  days: c.days ?? 30, min: c.min ?? 0, max: c.max ?? 2, sel: c.programs?.length ? c.programs : null, v: c.v ?? "",
});
const blank = (t: CondT): Row => ({ id: seq++, t, mode: "day", a: 0, b: 0, pf: today(), pt: today(), days: 30, min: 0, max: 2, sel: null, v: "" });

export default function CondModal({ branch, q, chip, onClose, onApply }: {
  branch: string | null; q: string; chip?: Chip;
  onClose: () => void; onApply: (conds: Cond[], name?: string) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => (chip?.conds ?? []).filter((c) => c.t !== "initial" && c.t !== "deleted").map(toRow));
  const [name, setName] = useState(chip && !chip.builtin && chip.id !== "tmp" ? chip.name : chip?.builtin && chip.id !== "b-all" ? chip.name : "");
  const [menu, setMenu] = useState(rows.length === 0);
  const [progs, setProgs] = useState<Prog[]>([]);
  const [mgrs, setMgrs] = useState<string[]>([]);
  const [cnt, setCnt] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sb.rpc("rsv_program_list", { p_branch: branch }).then(({ data }) => {
      const seen = new Set<string>();
      setProgs(((data ?? []) as Prog[]).filter((p) => p.grp !== "업무" && p.grp !== "행사" && !seen.has(p.name) && seen.add(p.name)));
    });
    sb.rpc("customer_manager_names", { p_branch: branch }).then(({ data, error }) => { if (!error) setMgrs(((data ?? []) as { name: string }[]).map((x) => x.name)); });
  }, [branch]);

  const conds = useMemo<Cond[]>(() => rows.map((r) => {
    const ty = typeOf(r.t);
    const c: Cond = { t: r.t };
    if (r.t === "manager") { c.v = r.v; return c; }
    if (ty?.kind === "date" && r.t !== "usage") { const [f, t] = rangeOf(r.mode, r.a, r.b, r.pf, r.pt); c.from = f; c.to = t; }
    if (ty?.kind === "days") c.days = r.days;
    if (ty?.kind === "range") { c.min = Math.min(r.min, r.max); c.max = Math.max(r.min, r.max); }
    if (r.t === "usage" && r.sel && r.sel.length > 0 && r.sel.length < progs.length) c.programs = r.sel;
    return c;
  }), [rows, progs.length]);
  const bad = rows.some((r) => (r.t === "usage" && r.sel?.length === 0) || (r.t === "manager" && !r.v));

  const key = JSON.stringify(conds);
  useEffect(() => {
    if (!conds.length || bad) { setCnt(null); setErr(""); return; }
    let on = true;
    const tm = setTimeout(() => searchCustomers(conds, q, branch, 1, 0).then(({ data, error }) => {
      if (!on) return;
      setErr(error === "NEED_SQL" ? "이 조건은 서버 준비(SQL 실행) 후에 찾을 수 있어요" : error);
      setCnt(error ? null : data[0]?.total ?? 0);
    }), 250);
    return () => { on = false; clearTimeout(tm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, q, branch, bad]);

  const set = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = (t: CondT) => { setRows((rs) => [...rs, blank(t)]); setMenu(false); };
  const flip = (r: Row, id: string) => {
    const cur = new Set(r.sel ?? progs.map((p) => p.id));
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    set(r.id, { sel: cur.size === progs.length ? null : [...cur] });
  };
  const saveChip = () => { if (!name.trim()) { nameRef.current?.focus(); setErr("칩 이름을 넣어 주세요"); return; } onApply(conds, name.trim()); };
  const can = conds.length > 0 && !bad;

  const typeSel = (r: Row) => (
    <span className="cq-sel">
      <select value={r.t} aria-label="조건 종류" onChange={(e) => set(r.id, { ...blank(e.target.value as CondT), id: r.id })}>
        {MENU.flatMap((m) => m.items).filter((x) => !x.off).map((x) => <option key={x.t} value={x.t}>{LABEL(x.t as CondT)}</option>)}
      </select>
      <b>{LABEL(r.t)}</b>
    </span>
  );

  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="cq" role="dialog" aria-label="검색조건 만들기">
        <div className="cq-hd"><b>검색조건 만들기</b><span className="sp" /><button className="cq-x" onClick={onClose} aria-label="닫기">✕</button></div>
        <div className="cq-bd">
          <div className="cq-frm">
            <label className="pc">칩 이름</label>
            <input ref={nameRef} className="inp" placeholder="예: 잔여 2회 이하" value={name} maxLength={20} onChange={(e) => { setName(e.target.value); setErr(""); }} />
            <label className="pc">조건 맞추기</label>
            <div className="seg sm cq-mode">
              <button className="on">모두 만족</button>
              <button disabled title="여러 조건 중 하나만 맞아도 찾기는 서버 준비 후에 돼요">하나라도</button>
            </div>
          </div>

          {rows.map((r) => {
            const ty = typeOf(r.t);
            const offs = r.mode === "pick" ? [] : OFFS[r.mode];
            const [f, t] = ty?.kind === "date" ? rangeOf(r.mode, r.a, r.b, r.pf, r.pt) : ["", ""];
            return (
              <div key={r.id} className={`cq-c k-${r.t === "manager" ? "mgr" : ty?.kind ?? "none"}`}>
                {typeSel(r)}
                {r.t === "manager" && (
                  <select className="sel" value={r.v} onChange={(e) => set(r.id, { v: e.target.value })}>
                    <option value="">담당자 고르기</option>
                    {mgrs.map((m) => <option key={m}>{m}</option>)}
                  </select>
                )}
                {ty?.kind === "range" && <>
                  <input className="inp num cq-n" inputMode="numeric" value={r.min} onChange={(e) => set(r.id, { min: Math.min(99, +e.target.value.replace(/\D/g, "") || 0) })} />회 ~
                  <input className="inp num cq-n" inputMode="numeric" value={r.max} onChange={(e) => set(r.id, { max: Math.min(99, +e.target.value.replace(/\D/g, "") || 0) })} />회
                </>}
                {ty?.kind === "days" && <><input className="inp num cq-n" inputMode="numeric" value={r.days} onChange={(e) => set(r.id, { days: Math.min(999, +e.target.value.replace(/\D/g, "") || 0) })} />일 이상</>}
                {r.t === "usage" && progs.length > 0 && <span className="d">{r.sel ? r.sel.length : progs.length}개 선택</span>}
                {ty?.kind === "date" && r.t !== "usage" && <>
                  <div className="seg sm cq-per">
                    {([["day", "일"], ["week", "주"], ["month", "월"], ["pick", "기간 선택"]] as [Mode, string][]).map(([m, l]) => (
                      <button key={m} className={r.mode === m ? "on" : ""} onClick={() => set(r.id, { mode: m, a: 0, b: 0, pf: f || today(), pt: t || today() })}>{l}</button>
                    ))}
                  </div>
                  {r.mode === "pick" ? <span className="cq-dates">
                    <input type="date" className="inp num cq-d" aria-label="시작일" value={r.pf} onChange={(e) => e.target.value && set(r.id, { pf: e.target.value })} />~
                    <input type="date" className="inp num cq-d" aria-label="종료일" value={r.pt} onChange={(e) => e.target.value && set(r.id, { pt: e.target.value })} />
                  </span> : <span className="cq-dates">
                    <select className="sel cq-o" value={r.a} onChange={(e) => set(r.id, { a: +e.target.value })}>{offs.map((n) => <option key={n} value={n}>{offLabel(r.mode, n)}</option>)}</select>~
                    <select className="sel cq-o" value={r.b} onChange={(e) => set(r.id, { b: +e.target.value })}>{offs.map((n) => <option key={n} value={n}>{offLabel(r.mode, n)}</option>)}</select>
                    <span className="d num">{short(f)} ~ {short(t)}</span>
                  </span>}
                </>}
                <button className="cq-del" onClick={() => setRows(rows.filter((x) => x.id !== r.id))} aria-label="조건 빼기">✕</button>
                {r.t === "usage" && progs.length > 0 && (
                  <div className="cq-ms">
                    <label><input type="checkbox" checked={r.sel == null} onChange={() => set(r.id, { sel: r.sel == null ? [] : null })} />전체 선택</label>
                    {progs.map((p) => <label key={p.id}><input type="checkbox" checked={r.sel == null || r.sel.includes(p.id)} onChange={() => flip(r, p.id)} />{p.name}</label>)}
                  </div>
                )}
              </div>
            );
          })}

          <div className="cq-addw">
            <button className="btn sm cq-add" onClick={() => setMenu((v) => !v)}>+ 조건 추가 ▾</button>
            {menu && (
              <div className="cq-menu" role="menu">
                {MENU.map((m) => (
                  <div key={m.g}>
                    <div className="g">{m.g}</div>
                    {m.items.map((x) => (
                      <button key={x.t} role="menuitem" disabled={!!x.off} title={x.off} onClick={() => add(x.t as CondT)}>{x.l}{x.off ? <span className="d"> · {x.off}</span> : null}</button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {err && <p className="cq-err" role="alert">{err}</p>}
        </div>
        <div className="cq-ft">
          <span className="cq-cnt pc">{can ? <>조건에 맞는 고객 <b className="num">{cnt == null ? "-" : `${cnt.toLocaleString()}명`}</b></> : "조건을 하나 이상 넣어 주세요"}</span>
          <span className="sp pc" />
          <button className="btn" disabled={!can} onClick={() => onApply(conds)}><span className="pc">조회만</span><span className="mo">조회 {cnt == null ? "" : `${cnt.toLocaleString()}명`}</span></button>
          <button className="btn p" disabled={!can} onClick={saveChip}>칩으로 저장</button>
        </div>
      </div>
    </>
  );
}
