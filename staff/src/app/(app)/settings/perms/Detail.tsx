"use client";
import { useMemo, useState } from "react";
import { sb, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { isOn, sameVal, type PermMap, type PermOpts, type PermVal } from "@/lib/perm";
import { CARDS, TABS, onValue, type Opt } from "./config";
import { Info, Switch } from "../ui";

/* 세부설정 (헬보 v148 r10 · C15 직급 / C15c 사람)
   PC 오른쪽 창 · 휴대폰 전체 시트. [직급 | 사람] + 대상 → 메뉴 탭 → 기능 카드 켜기·끄기(켜면 아래 선택)
   → 사람이 직급과 다르면 '예외' · [직급 기본값으로] → 아래 '선택한 설정을 다음에도 똑같이 적용' → [설정 저장].
   MERA 3단계: 대표관리자는 대상 아님(모든 권한) · 관리자는 '대표관리자만' 카드만 켜고 끔 · 직원은 직급마다. */

export type Preset = { name: string; perms: PermMap; sort: number };
export const MANAGER = "@manager";
export const titleLabel = (n: string) => (n === MANAGER ? "관리자" : n);
export const titleOf = (s: Staff) => (s.tier === "manager" ? MANAGER : s.tier === "staff" ? s.title || "직원" : null);
export const membersOf = (list: Staff[], name: string) =>
  list.filter((s) => s.status !== "resigned" && titleOf(s) === name);

type Mode = "title" | "person";
type Props = {
  mode: Mode; target: string; list: Staff[]; perms: Perm[]; presets: Preset[]; titles: string[];
  onClose: () => void; onDone: (msg: string) => void;
};

export default function Detail(p: Props) {
  const me = useMe();
  const isOwner = me.tier === "owner";
  const [mode, setMode] = useState<Mode>(p.mode);
  const [target, setTarget] = useState(p.target);
  const presetOf = (name: string) => p.presets.find((x) => x.name === name)?.perms ?? {};

  // 내가 고칠 수 있는 대상
  const titleChoices = p.titles.filter((t) => isOwner || t !== MANAGER);
  const people = p.list.filter((s) => s.status !== "resigned" && s.id !== me.id &&
    (isOwner ? s.tier !== "owner" : s.tier === "staff" && s.branch === me.branch));

  const person = mode === "person" ? p.list.find((s) => s.id === target) : undefined;
  const baseName = mode === "title" ? target : person ? titleOf(person) ?? "직원" : "직원";
  const forManager = baseName === MANAGER;
  const base = presetOf(baseName);
  const source: PermMap = mode === "title" ? base : person?.perms ?? {};

  const [draft, setDraft] = useState<PermMap>({ ...source });
  const [loadedFor, setLoadedFor] = useState(`${mode}:${target}`);
  if (loadedFor !== `${mode}:${target}`) { setLoadedFor(`${mode}:${target}`); setDraft({ ...source }); }

  const [tab, setTab] = useState<string>(TABS[0]);
  const [scope, setScope] = useState<"tab" | "all">("tab");
  const [pickT, setPickT] = useState<string[]>([]);
  const [pickP, setPickP] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const tabOf = (x: Perm) => CARDS[x.key]?.tab ?? x.menu;
  const tabs = useMemo(() => {
    const extra = [...new Set(p.perms.map(tabOf).filter((t) => !(TABS as readonly string[]).includes(t)))];
    return [...TABS, ...extra].filter((t) => p.perms.some((x) => tabOf(x) === t));
  }, [p.perms]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = p.perms.filter((x) => tabOf(x) === tab);

  const lockOwner = (x: Perm) => x.owner_only && !isOwner;     // 관리자는 '대표관리자만' 못 바꿈
  const fixedOn = (x: Perm) => forManager && !x.owner_only;      // 관리자는 늘 켜짐
  const editable = (x: Perm) => !lockOwner(x) && !fixedOn(x);
  const valOf = (x: Perm): PermVal | undefined => (fixedOn(x) ? true : draft[x.key]);
  const isExc = (x: Perm) => mode === "person" && !fixedOn(x) && !sameVal(draft[x.key], base[x.key]);
  const excCount = mode === "person" ? p.perms.filter(isExc).length : 0;

  const setVal = (key: string, v: PermVal | undefined) => {
    const n = { ...draft };
    if (v === undefined || v === false) delete n[key]; else n[key] = v;
    setDraft(n);
  };
  const setOpt = (x: Perm, k: keyof PermOpts, v: string | string[]) => {
    const cur = draft[x.key];
    const o: PermOpts = typeof cur === "object" && cur ? { ...cur } : { ...(onValue(x.key) as PermOpts) };
    (o as Record<string, unknown>)[k] = v;
    setVal(x.key, o);
  };
  const setAll = (v: boolean) => {
    const n = { ...draft };
    cards.filter(editable).forEach((x) => { if (v) { if (!isOn(n[x.key])) n[x.key] = onValue(x.key); } else delete n[x.key]; });
    setDraft(n);
  };
  const resetToTitle = () => {
    const n: PermMap = {};
    p.perms.forEach((x) => { const src = lockOwner(x) ? draft[x.key] : base[x.key]; if (isOn(src)) n[x.key] = src!; });
    setDraft(n);
  };

  const onCount = cards.filter((x) => isOn(valOf(x))).length;
  const targetName = mode === "title" ? titleLabel(target) : person?.name ?? "";
  const nPeople = mode === "title" ? membersOf(p.list, target).length : 0;

  // 같이 적용할 대상 (지금 대상은 빼요)
  const copyTitles = titleChoices.filter((t) => !(mode === "title" && t === target));
  const copyPeople = people.filter((s) => !(mode === "person" && s.id === target));
  const shownPeople = copyPeople.filter((s) => !q.trim() || s.name.includes(q.trim()));
  const allPicked = copyTitles.length + copyPeople.length > 0 && pickT.length === copyTitles.length && pickP.length === copyPeople.length;

  /** 바꿀 키: 내가 고칠 수 있는 것만 */
  const keysFor = (onlyTab: boolean) => p.perms.filter((x) => !lockOwner(x) && (!onlyTab || tabOf(x) === tab)).map((x) => x.key);
  const apply = (into: PermMap, from: PermMap, keys: string[]) => {
    const n = { ...into };
    keys.forEach((k) => { if (isOn(from[k])) n[k] = from[k]; else delete n[k]; });
    return n;
  };

  async function saveTitle(name: string, next: PermMap) {
    const old = presetOf(name);
    const sort = p.presets.find((x) => x.name === name)?.sort ?? 100;
    const { error } = await sb.from("staff_title_perms").upsert({ name, perms: next, sort });
    if (error) throw new Error(/staff_title_perms/.test(error.message) ? "직급 저장 표가 아직 없어요. 044 SQL을 먼저 실행해 주세요" : error.message);
    // 직급을 따르는 사람에게 바로 적용 (예외로 바꿔 둔 칸은 그대로)
    for (const s of membersOf(p.list, name)) {
      if (!isOwner && s.tier !== "staff") continue;
      const n = { ...(s.perms ?? {}) }; let changed = false;
      p.perms.forEach((x) => {
        if (lockOwner(x) || sameVal(old[x.key], next[x.key]) || !sameVal(n[x.key], old[x.key])) return;
        if (isOn(next[x.key])) n[x.key] = next[x.key]; else delete n[x.key];
        changed = true;
      });
      if (changed) {
        const { error: e2 } = await sb.from("staff_accounts").update({ perms: n }).eq("id", s.id);
        if (e2) throw new Error(`${s.name}: ${e2.message}`);
      }
    }
  }
  async function savePerson(s: Staff, next: PermMap) {
    const { error } = await sb.from("staff_accounts").update({ perms: next }).eq("id", s.id);
    if (error) throw new Error(`${s.name}: ${error.message}`);
  }

  async function save() {
    setMsg(""); setBusy(true);
    try {
      if (mode === "title") await saveTitle(target, apply(presetOf(target), draft, keysFor(false)));
      else if (person) await savePerson(person, apply(person.perms ?? {}, draft, keysFor(false)));
      const keys = keysFor(scope === "tab");
      for (const t of pickT) await saveTitle(t, apply(presetOf(t), draft, keys));
      for (const id of pickP) { const s = p.list.find((x) => x.id === id); if (s) await savePerson(s, apply(s.perms ?? {}, draft, keys)); }
      const n = pickT.length + pickP.length;
      p.onDone(n ? `저장했어요 · ${n}곳에 똑같이 적용했어요` : "저장했어요");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="dim" onClick={p.onClose} />
      <div className="drawer pd" role="dialog" aria-label={`세부설정 ${targetName}`}>
        <div className="pd-hd">
          <h2>세부설정 · {targetName}</h2>
          <button className="pd-x" aria-label="닫기" onClick={p.onClose}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="pd-bd">
          <div className="pd-who">
            <div className="pd-seg" role="tablist">
              <button className={mode === "title" ? "on" : ""} onClick={() => { setMode("title"); setTarget(person ? titleOf(person) ?? titleChoices[0] : titleChoices[0]); }}>직급</button>
              <button className={mode === "person" ? "on" : ""} disabled={people.length === 0}
                onClick={() => { setMode("person"); setTarget((people.find((s) => titleOf(s) === target) ?? people[0])?.id ?? ""); }}>사람</button>
            </div>
            <select className="sel pd-pick" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="대상 고르기">
              {mode === "title"
                ? titleChoices.map((t) => <option key={t} value={t}>{titleLabel(t)}</option>)
                : people.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {mode === "person" && <button className="pd-reset" disabled={excCount === 0} onClick={resetToTitle}>직급 기본값으로</button>}
          </div>
          <p className="pd-sub">
            {mode === "title"
              ? `${titleLabel(target)} · ${nPeople}명 · 켠 것만 보여요`
              : `${person?.name ?? ""} · 직급 ${titleLabel(baseName)} · 켠 것만 보여요`}
          </p>
          {mode === "person" && excCount > 0 && (
            <p className="pd-sub">{person?.name} 한 사람만 다르게 · 직급 {titleLabel(baseName)}와 다른 카드에 <span className="pd-exc">예외</span> · [직급 기본값으로]를 누르면 모두 되돌려요</p>
          )}
          {forManager && <p className="pd-sub">관리자는 &lsquo;대표관리자만&rsquo; 카드만 켜고 꺼요. 나머지는 늘 켜져 있어요.</p>}

          <div className="pd-tabs" role="tablist">
            {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          <div className="pd-cnt">
            <span>{tab} · 기능 {cards.length}개 · 켬 {onCount}</span>
            <button className="pd-pill" onClick={() => setAll(true)} disabled={!cards.some(editable)}>전체 켜기</button>
            <button className="pd-pill" onClick={() => setAll(false)} disabled={!cards.some(editable)}>전체 끄기</button>
          </div>

          {cards.map((x) => {
            const d = CARDS[x.key]; const v = valOf(x); const on = isOn(v);
            const o = (typeof v === "object" && v ? v : {}) as PermOpts;
            return (
              <div key={x.key} className={`pd-card ${on ? "" : "off"}`}>
                <div className="pd-ch">
                  <b>{d?.label ?? x.label}</b>
                  {isExc(x) && <span className="pd-exc">예외</span>}
                  {x.owner_only && <span className="pd-own">대표관리자만</span>}
                  <Switch on={on} disabled={!editable(x)} label={d?.label ?? x.label} onChange={(nv) => setVal(x.key, nv ? onValue(x.key) : undefined)} />
                </div>
                {!on && <p className="pd-off">{lockOwner(x) ? "꺼짐 · 대표관리자만 켤 수 있어요" : d?.off ?? (d?.opts ? "꺼짐 · 켜면 아래 선택이 나와요" : "꺼짐 · 할 수 없어요")}</p>}
                {on && fixedOn(x) && <p className="pd-off">관리자는 늘 켜져요</p>}
                {on && !fixedOn(x) && d?.opts?.map((op) => <OptRow key={op.k} op={op} o={o} disabled={!editable(x)} onChange={(k, nv) => setOpt(x, k, nv)} />)}
              </div>
            );
          })}

          <Info label="켜고 끄는 규칙"><ul className="pd-notes">
            <li>켜면 보이고 · 끄면 안 보여요 · 켜면 아래 선택 (권한 · 조회 범위 · 조회 기간)이 나와요</li>
            <li>요청 보내기 = 버튼 대신 [요청 보내기] → 그 기능을 켠 사람이 확인 · 거절</li>
            <li>메뉴를 꺼도 남은 메뉴 순서는 그대로 · 대표관리자는 늘 모든 권한</li>
            <li>저장하면 바로 적용 · 바뀐 내용은 권한 변경 기록에 이전 → 이후로 남아요</li>
          </ul></Info>

          {(copyTitles.length > 0 || copyPeople.length > 0) && (
            <section className="pd-copy">
              <h3>선택한 설정을 다음에도 똑같이 적용</h3>
              <div className="pd-row">
                <span className="k">적용 범위</span>
                <div className="v">
                  <label className="pd-rd"><input type="radio" checked={scope === "tab"} onChange={() => setScope("tab")} />이 메뉴 ({tab})만</label>
                  <label className="pd-rd"><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} />모든 메뉴</label>
                </div>
              </div>
              <div className="pd-row pd-allrow">
                <label className="pd-cb"><input type="checkbox" checked={allPicked}
                  onChange={(e) => { setPickT(e.target.checked ? copyTitles : []); setPickP(e.target.checked ? copyPeople.map((s) => s.id) : []); }} />전체 선택</label>
                <span className="pd-n">직급 {pickT.length} · 사람 {pickP.length} 선택됨</span>
              </div>
              {copyTitles.length > 0 && (
                <div className="pd-row">
                  <span className="k">직급</span>
                  <div className="v">
                    {copyTitles.map((t) => (
                      <label key={t} className="pd-cb"><input type="checkbox" checked={pickT.includes(t)}
                        onChange={(e) => setPickT(e.target.checked ? [...pickT, t] : pickT.filter((y) => y !== t))} />{titleLabel(t)}</label>
                    ))}
                  </div>
                </div>
              )}
              {copyPeople.length > 0 && (
                <div className="pd-row">
                  <span className="k">사람</span>
                  <div className="v">
                    <input className="inp pd-q" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
                    <div className="pd-ppl">
                      {shownPeople.map((s) => (
                        <label key={s.id} className="pd-cb"><input type="checkbox" checked={pickP.includes(s.id)}
                          onChange={(e) => setPickP(e.target.checked ? [...pickP, s.id] : pickP.filter((y) => y !== s.id))} />{s.name} ({titleLabel(titleOf(s) ?? "")})</label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
          {msg && <p className="st-msg">{msg}</p>}
        </div>
        <div className="pd-ft">
          <button className="btn pd-cancel" onClick={p.onClose}>취소</button>
          <button className="btn p" disabled={busy} onClick={save}>{busy ? "저장 중…" : "설정 저장"}</button>
        </div>
      </div>
    </>
  );
}

function OptRow({ op, o, disabled, onChange }: { op: Opt; o: PermOpts; disabled: boolean; onChange: (k: keyof PermOpts, v: string | string[]) => void }) {
  return (
    <div className="pd-opt">
      <span className="k">{op.label}</span>
      <div className="v">
        {"select" in op ? (
          <select className="sel pd-sel" disabled={disabled} value={o.period ?? op.select[0][0]} onChange={(e) => onChange("period", e.target.value)}>
            {op.select.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ) : "multi" in op ? (
          op.choices.map(([v, l]) => {
            const cur = o.scope ?? [];
            return (
              <label key={v} className="pd-cb"><input type="checkbox" disabled={disabled} checked={cur.includes(v)}
                onChange={(e) => onChange("scope", e.target.checked ? [...cur, v] : cur.filter((y) => y !== v))} />{l}</label>
            );
          })
        ) : (
          op.choices.map(([v, l]) => (
            <label key={v} className="pd-rd"><input type="radio" disabled={disabled} checked={(o[op.k] ?? op.choices[0][0]) === v}
              onChange={() => onChange(op.k, v)} />{l}</label>
          ))
        )}
      </div>
    </div>
  );
}
