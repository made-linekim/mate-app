"use client";
// 검색조건 만들기 — 뷰티사랑넷 흐름(조건 선택 → 기간설정/잔여회차 → 관리선택 → 선택완료), 메라 톤.
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { Chip, Cond, CondT, DORMANT, Mode, OFFS, TYPES, offLabel, rangeOf, today, typeOf, withDay } from "./cond";
import { searchCustomers } from "./search";

type Prog = { id: string; name: string; grp: string | null; parent_id: string | null };

export default function CondModal({ branch, q, chip, onClose, onApply }: {
  branch: string | null; q: string; chip?: Chip;
  onClose: () => void; onApply: (conds: Cond[], name?: string) => void;
}) {
  const init = chip?.conds[0];
  const initT = init && typeOf(init.t) ? init.t : init?.t === "member" ? "period_hold" : init?.t === "new" ? "first_visit" : "";
  const [t, setT] = useState<CondT | "">(initT);
  const [mode, setMode] = useState<Mode>(init?.from ? "pick" : "day");
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [pf, setPf] = useState(init?.from ?? today());
  const [pt, setPt] = useState(init?.to ?? today());
  const [days, setDays] = useState(init?.days ?? 60);
  const [min, setMin] = useState(init?.min ?? 1);
  const [max, setMax] = useState(init?.max ?? 10);
  const [progs, setProgs] = useState<Prog[]>([]);
  const [sel, setSel] = useState<Set<string> | null>(init?.programs?.length ? new Set(init.programs) : null); // null = 전체
  const [name, setName] = useState(chip && !chip.builtin && chip.id !== "tmp" ? chip.name : "");
  const [cnt, setCnt] = useState<number | null>(null);
  const [err, setErr] = useState("");

  const ty = t ? typeOf(t) : undefined;
  useEffect(() => {
    sb.rpc("rsv_program_list", { p_branch: branch }).then(({ data }) => {
      const seen = new Set<string>();
      setProgs(((data ?? []) as Prog[]).filter((p) => !seen.has(p.name) && seen.add(p.name)));
    });
  }, [branch]);

  const [from, to] = rangeOf(mode, a, b, pf, pt);
  const cond = useMemo<Cond | null>(() => {
    if (!ty || ty.off) return null;
    const c: Cond = { t: ty.t };
    if (ty.kind === "date") { c.from = from; c.to = to; }
    if (ty.kind === "days") c.days = days;
    if (ty.kind === "range") { c.min = Math.min(min, max); c.max = Math.max(min, max); }
    if (ty.progs && sel && sel.size > 0 && sel.size < progs.length) c.programs = [...sel];
    return c;
  }, [ty, from, to, days, min, max, sel, progs.length]);

  const key = JSON.stringify(cond);
  useEffect(() => {
    if (!cond) { setCnt(null); setErr(""); return; }
    let on = true;
    const tm = setTimeout(() => searchCustomers([cond], q, branch, 1, 0).then(({ data, error }) => {
      if (!on) return;
      setErr(error === "NEED_SQL" ? "이 조건은 서버 준비 후에 찾을 수 있어요" : error);
      setCnt(error ? null : data[0]?.total ?? 0);
    }), 250);
    return () => { on = false; clearTimeout(tm); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, q, branch]);

  const allOn = sel == null || sel.size === progs.length;
  const isOn = (id: string) => sel == null || sel.has(id);
  const flip = (id: string) => setSel((s) => {
    const n = new Set(s ?? progs.map((p) => p.id));
    if (n.has(id)) n.delete(id); else n.add(id);
    return n.size === progs.length ? null : n;
  });
  const offs = mode === "pick" ? [] : OFFS[mode];
  const pickMode = (m: Mode) => { setMode(m); setA(0); setB(0); };

  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className="cs" role="dialog" aria-label="검색조건 만들기">
        <div className="cs-hd">검색조건 만들기<button className="c-x" onClick={onClose} aria-label="닫기">×</button></div>
        <div className="cs-bd">
          <section>
            <h3>검색 조건</h3>
            <select className="sel cs-type" value={t} onChange={(e) => { setT(e.target.value as CondT); setSel(null); }}>
              <option value="">- 검색 조건을 선택하세요 -</option>
              {TYPES.map((x) => <option key={x.t} value={x.t} disabled={!!x.off}>{x.l}{x.off ? " (생일 정보 없음)" : ""}</option>)}
            </select>
          </section>

          {ty?.kind === "date" && (
            <section>
              <h3>기간 설정</h3>
              <div className="cs-radio">
                {([["day", "일기준"], ["week", "주기준"], ["month", "월기준"], ["pick", "기간선택"]] as [Mode, string][]).map(([m, l]) => (
                  <label key={m}><input type="radio" name="mode" checked={mode === m} onChange={() => pickMode(m)} />{l}</label>
                ))}
              </div>
              {mode !== "pick" ? (
                <>
                  <p className="cs-help">오늘 날짜를 기준으로 검색돼요</p>
                  <div className="cs-range">
                    <select className="sel" value={a} onChange={(e) => setA(+e.target.value)}>{offs.map((n) => <option key={n} value={n}>{offLabel(mode, n)}</option>)}</select>
                    <span>~</span>
                    <select className="sel" value={b} onChange={(e) => setB(+e.target.value)}>{offs.map((n) => <option key={n} value={n}>{offLabel(mode, n)}</option>)}</select>
                  </div>
                </>
              ) : (
                <div className="cs-range">
                  <input type="date" className="inp" value={pf} onChange={(e) => setPf(e.target.value)} />
                  <span>~</span>
                  <input type="date" className="inp" value={pt} onChange={(e) => setPt(e.target.value)} />
                </div>
              )}
              <p className="cs-period">검색기간 <b className="num">{withDay(from)} ~ {withDay(to)}</b></p>
            </section>
          )}

          {ty?.kind === "days" && (
            <section>
              <h3>마지막 방문 후</h3>
              <select className="sel" value={days} onChange={(e) => setDays(+e.target.value)}>
                {DORMANT.map((d) => <option key={d} value={d}>{d}일 이상 안 온 고객</option>)}
              </select>
            </section>
          )}

          {ty?.kind === "range" && (
            <section>
              <h3>잔여 회차</h3>
              <div className="cs-range">
                <select className="sel" value={min} onChange={(e) => setMin(+e.target.value)}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i}>{i}회 이상</option>)}</select>
                <span>~</span>
                <select className="sel" value={max} onChange={(e) => setMax(+e.target.value)}>{[...Array.from({ length: 30 }, (_, i) => i + 1), 50, 99].map((i) => <option key={i} value={i}>{i}회 이하</option>)}</select>
              </div>
            </section>
          )}

          {ty?.progs && progs.length > 0 && (
            <section>
              <h3>관리 선택 <label className="cs-all"><input type="checkbox" className="c-ck" checked={allOn} onChange={() => setSel(allOn ? new Set() : null)} />전체선택</label></h3>
              <div className="cs-progs">
                {progs.map((p) => (
                  <label key={p.id}><input type="checkbox" className="c-ck" checked={isOn(p.id)} onChange={() => flip(p.id)} />{p.name}</label>
                ))}
              </div>
            </section>
          )}

          {ty && (
            <section>
              <h3>칩으로 저장 <span className="cs-opt">(이름을 넣으면 목록 위 칩으로 남아요)</span></h3>
              <input className="inp" placeholder="예: 이번 달 만료" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            </section>
          )}
          {err && <p className="cs-err">{err}</p>}
        </div>
        <div className="cs-ft">
          <span className="cs-cnt">{cond ? <>조건에 맞는 고객 <b className="num">{cnt == null ? "-" : `${cnt.toLocaleString()}명`}</b></> : "조건을 먼저 골라 주세요"}</span>
          <div className="cs-btns">
            <button className="btn" onClick={onClose}>✕ 취소</button>
            <button className="btn p" disabled={!cond || (sel != null && sel.size === 0)} onClick={() => cond && onApply([cond], name.trim() || undefined)}>✓ 선택완료</button>
          </div>
        </div>
      </div>
    </>
  );
}
