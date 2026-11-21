"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { isOn } from "@/lib/perm";
import { Ico, Info, Msg, useSetBranch } from "../ui";
import { PageH, HelpD } from "../kit";
import { CARDS } from "./config";
import Detail, { MANAGER, membersOf, titleLabel, type Preset } from "./Detail";

/* 직급 · 권한 (헬보 v148 r10 · C14b 직급 목록 · C14c 추가 · C14d 삭제·사람 옮기기)
   큰 요약 표 대신 직급 줄마다 [세부설정]. 대표관리자는 늘 모든 권한이라 대상이 아니에요. */
export default function PermsPage() {
  const me = useMe();
  const isOwner = me.tier === "owner";
  const isAdmin = isOwner || me.tier === "manager";
  const branch = useSetBranch(true);
  const [list, setList] = useState<Staff[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [noTable, setNoTable] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<{ mode: "title" | "person"; target: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: p }, tp] = await Promise.all([
      sb.from("staff_accounts").select("*").order("tier").order("name"),
      sb.from("perm_catalog").select("*").order("sort"),
      sb.from("staff_title_perms").select("name,perms,sort").order("sort"),
    ]);
    if (error) setMsg(error.message);
    setList((s ?? []) as Staff[]); setPerms((p ?? []) as Perm[]);
    setNoTable(!!tp.error);
    setPresets((tp.data ?? []) as Preset[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  // 직급 = 저장된 직급 + 사람에게 붙어 있는 직급 이름 (관리자는 맨 위)
  const titles = useMemo(() => {
    const saved = presets.filter((x) => x.name !== MANAGER).map((x) => x.name);
    const used = list.filter((s) => s.tier === "staff" && s.status !== "resigned").map((s) => s.title || "직원");
    return [MANAGER, ...saved, ...[...new Set(used)].filter((t) => !saved.includes(t))];
  }, [presets, list]);
  const inBranch = (s: Staff) => branch === "all" || s.branch === branch;
  const nPeople = list.filter((s) => s.status !== "resigned" && inBranch(s)).length;

  const summary = (name: string) => {
    const pm = presets.find((x) => x.name === name)?.perms ?? {};
    const on = perms.filter((x) => (name === MANAGER ? x.owner_only && isOn(pm[x.key]) : isOn(pm[x.key])));
    const menus = new Set(on.map((x) => CARDS[x.key]?.tab ?? x.menu)).size;
    if (name === MANAGER) return `기본 기능 전부 · 대표관리자만 ${on.length}개 켬`;
    return `메뉴 ${menus} · 기능 ${on.length}개 켬`;
  };
  const branchesOf = (name: string) => {
    const b = [...new Set(membersOf(list, name).map((s) => s.branch))];
    return b.length === 0 ? "—" : b.length > 1 ? "전체 지점" : b[0];
  };
  const canOpen = (name: string) => isAdmin && (isOwner || name !== MANAGER);

  async function saveOrder(next: string[]) {
    const rows = next.filter((t) => t !== MANAGER).map((name, i) => ({ name, perms: presets.find((x) => x.name === name)?.perms ?? {}, sort: (i + 1) * 10 }));
    const { error } = await sb.from("staff_title_perms").upsert(rows);
    setMsg(error ? error.message : "순서를 바꿨어요"); load();
  }
  const onDrop = (to: string) => {
    if (!drag || drag === to || to === MANAGER) return;
    const arr = titles.filter((t) => t !== drag);
    arr.splice(arr.indexOf(to), 0, drag);
    setDrag(null); saveOrder(arr);
  };
  const move = (t: string, d: -1 | 1) => {
    const arr = [...titles]; const i = arr.indexOf(t); const j = i + d;
    if (j < 1 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]]; saveOrder(arr);
  };

  if (!isAdmin) return (<div className="ct"><PageH title="권한" sub="직급마다 쓰는 기능" /><div className="body"><HelpD>대표관리자 · 관리자만 볼 수 있어요.</HelpD></div></div>);

  return (
    <div className="ct">
      <PageH title="권한" sub={`${branch === "all" ? "전 지점" : branch} · 직급마다 쓰는 기능`}>
        <Msg text={msg} />
        <button className="btn p sm" disabled={noTable} onClick={() => setAdding(true)}>직급 추가</button>
      </PageH>
      <div className="body">
      {noTable && <p className="st-msg">직급 저장 표가 아직 없어요. 044 SQL을 실행하면 직급 추가 · 세부설정 저장이 돼요.</p>}
      <p className="pl-cnt">직급 {titles.length + 1}개 · 사람 {nPeople}명</p>

      <div className="card pl-card">
        <div className="pl-h"><b>직급</b><span className="pl-badge">{titles.length + 1}</span></div>
        <div className="pl-thead" aria-hidden><span /><span>직급 이름</span><span>사람</span><span>볼 수 있는 지점</span><span>세부설정 (메뉴 · 기능)</span><span /></div>

        <div className="pl-row fixed">
          <span className="pl-hd" />
          <b className="pl-nm">대표관리자</b>
          <span className="pl-n">{list.filter((s) => s.tier === "owner").length}명</span>
          <span className="pl-br">전체 지점</span>
          <span className="pl-sum"><span className="pl-all">모든 권한</span>바꿀 수 없어요</span>
          <span />
        </div>
        {titles.map((t) => {
          const n = membersOf(list, t).length;
          const fixed = t === MANAGER;
          return (
            <div key={t} className={`pl-row ${drag === t ? "drag" : ""}`}
              draggable={!fixed && !noTable} onDragStart={() => setDrag(t)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(t)}>
              <span className="pl-hd" title={fixed ? "" : "끌어서 순서 바꾸기"}>{fixed ? "" : "⠿"}</span>
              <b className="pl-nm">{titleLabel(t)}</b>
              <span className="pl-n">{n}명</span>
              <span className="pl-br">{branchesOf(t)}</span>
              <span className="pl-sum">
                <button className="pl-det" disabled={!canOpen(t)} onClick={() => setOpen({ mode: "title", target: t })}>세부설정</button>
                <span>{summary(t)}</span>
              </span>
              <span className="pl-act">
                {!fixed && (
                  <>
                    <button className="pl-mv" aria-label="위로" onClick={() => move(t, -1)} disabled={noTable}>↑</button>
                    <button className="pl-mv" aria-label="아래로" onClick={() => move(t, 1)} disabled={noTable}>↓</button>
                    <button className="pl-txt" disabled={noTable} onClick={() => setRenaming(t)}>이름 바꾸기</button>
                    <button className="pl-txt red" disabled={noTable} onClick={() => setRemoving(t)}>삭제</button>
                  </>
                )}
              </span>
            </div>
          );
        })}
        <div className="pl-foot"><Info label="직급 · 권한 쓰는 법">세부설정에서 켠 메뉴 · 기능만 그 직급 사람에게 보여요 · 줄을 끌어 순서 바꾸기 · 지우면 그 직급 사람을 다른 직급으로 옮겨요 · 한 사람만 다르게 하려면 설정 › 직원의 [세부설정]</Info></div>
      </div>

      {open && (
        <Detail mode={open.mode} target={open.target} list={list} perms={perms} presets={presets} titles={titles}
          onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); setMsg(m); load(); }} />
      )}
      {adding && <NameModal title="직급 추가" titles={titles} presets={presets} perms={perms} list={list}
        onClose={() => setAdding(false)} onDone={(name, openNext) => { setAdding(false); load(); if (openNext) setOpen({ mode: "title", target: name }); }} />}
      {renaming && <NameModal title={`이름 바꾸기 · ${renaming}`} from={renaming} titles={titles} presets={presets} perms={perms} list={list}
        onClose={() => setRenaming(null)} onDone={() => { setRenaming(null); setMsg("이름을 바꿨어요"); load(); }} />}
      {removing && <RemoveModal name={removing} titles={titles} list={list}
        onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); setMsg("직급을 지웠어요"); load(); }} />}
      </div>
    </div>
  );
}

/* C14c 직급 추가 · 이름 바꾸기 */
function NameModal({ title, from, titles, presets, perms, list, onClose, onDone }:
  { title: string; from?: string; titles: string[]; presets: Preset[]; perms: Perm[]; list: Staff[]; onClose: () => void; onDone: (name: string, openNext: boolean) => void }) {
  const me = useMe();
  const [name, setName] = useState(from ?? "");
  const [copy, setCopy] = useState("");
  const [openNext, setOpenNext] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    const n = name.trim(); setErr("");
    if (!n) return setErr("이름을 넣어 주세요");
    if (n.startsWith("@") || n === "관리자" || n === "대표관리자") return setErr("이 이름은 쓸 수 없어요");
    if (n !== from && titles.includes(n)) return setErr("같은 이름이 있어요");
    setBusy(true);
    try {
      if (from) {
        const old = presets.find((x) => x.name === from);
        const { error } = await sb.from("staff_title_perms").upsert({ name: n, perms: old?.perms ?? {}, sort: old?.sort ?? 100 });
        if (error) throw error;
        for (const s of membersOf(list, from)) {
          const { error: e2 } = await sb.from("staff_accounts").update({ title: n }).eq("id", s.id);
          if (e2) throw new Error(`${s.name}: ${e2.message}`);
        }
        if (old) { const { error: e3 } = await sb.from("staff_title_perms").delete().eq("name", from); if (e3) throw e3; }
      } else {
        const src = presets.find((x) => x.name === copy)?.perms ?? {};
        // 관리자가 만들 땐 '대표관리자만' 권한은 빼고 복사
        const pm = Object.fromEntries(Object.entries(src).filter(([k]) => me.tier === "owner" || !perms.find((x) => x.key === k)?.owner_only));
        const sort = Math.max(0, ...presets.map((x) => x.sort)) + 10;
        const { error } = await sb.from("staff_title_perms").insert({ name: n, perms: copy === MANAGER ? {} : pm, sort });
        if (error) throw error;
      }
      onDone(n, !from && openNext);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="pl-modal" role="dialog" aria-label={title}>
        <div className="pl-mh"><b>{title}</b><button className="pd-x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <label className="pl-f"><span>직급 이름 (자유롭게)</span>
          <input className="inp" autoFocus value={name} placeholder="예: 실장, 트레이너, 필라테스 강사" onChange={(e) => setName(e.target.value)} /></label>
        {!from && (
          <>
            <label className="pl-f"><span>세부설정 처음 값</span>
              <select className="sel" value={copy} onChange={(e) => setCopy(e.target.value)}>
                <option value="">모두 꺼진 상태</option>
                {titles.filter((t) => t !== MANAGER).map((t) => <option key={t} value={t}>{t}와 똑같이</option>)}
              </select></label>
            <label className="pd-cb"><input type="checkbox" checked={openNext} onChange={(e) => setOpenNext(e.target.checked)} />만들고 나서 세부설정 열기</label>
          </>
        )}
        {from && <p className="pl-note">이 직급 사람 {membersOf(list, from).length}명의 직급 이름도 같이 바뀌어요.</p>}
        {err && <p className="st-msg">{err}</p>}
        <div className="pl-mf"><button className="btn" onClick={onClose}>취소</button><button className="btn p" disabled={busy} onClick={go}>{from ? "바꾸기" : "만들기"}</button></div>
      </div>
    </>
  );
}

/* C14d 직급 삭제 · 사람 옮기기 */
function RemoveModal({ name, titles, list, onClose, onDone }: { name: string; titles: string[]; list: Staff[]; onClose: () => void; onDone: () => void }) {
  const others = titles.filter((t) => t !== MANAGER && t !== name);
  const members = membersOf(list, name);
  const [to, setTo] = useState<Record<string, string>>(Object.fromEntries(members.map((s) => [s.id, others[0] ?? ""])));
  const [all, setAll] = useState(others[0] ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setErr("");
    if (members.length && members.some((s) => !to[s.id])) return setErr("옮길 직급을 골라 주세요");
    setBusy(true);
    try {
      for (const s of members) {
        const { error } = await sb.from("staff_accounts").update({ title: to[s.id] }).eq("id", s.id);
        if (error) throw new Error(`${s.name}: ${error.message}`);
      }
      const { error } = await sb.from("staff_title_perms").delete().eq("name", name);
      if (error) throw error;
      onDone();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="pl-modal" role="dialog" aria-label={`직급 삭제 ${name}`}>
        <div className="pl-mh"><b>직급 삭제 · {name}</b><button className="pd-x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <p className="pl-warn">{name} 직급 사람 {members.length}명을 다른 직급으로 옮겨야 지울 수 있어요. 옮긴 사람의 세부설정은 그대로예요.</p>
        {members.length > 0 && (
          <>
            <label className="pl-f"><span>모두 한 번에 옮기기</span>
              <select className="sel" value={all} onChange={(e) => { setAll(e.target.value); setTo(Object.fromEntries(members.map((s) => [s.id, e.target.value]))); }}>
                {others.map((t) => <option key={t}>{t}</option>)}
              </select></label>
            <div className="pl-mvlist">
              <div className="pl-mvh"><span>이름</span><span>지점</span><span>옮길 직급</span></div>
              {members.map((s) => (
                <div key={s.id} className="pl-mvr"><span>{s.name}</span><span>{s.branch}</span>
                  <select className="sel" value={to[s.id]} onChange={(e) => setTo({ ...to, [s.id]: e.target.value })}>
                    {others.map((t) => <option key={t}>{t}</option>)}
                  </select></div>
              ))}
            </div>
          </>
        )}
        {members.length > 0 && others.length === 0 && <p className="st-msg">옮길 직급이 없어요. 직급을 먼저 하나 더 만들어 주세요.</p>}
        {err && <p className="st-msg">{err}</p>}
        <div className="pl-mf"><button className="btn" onClick={onClose}>취소</button>
          <button className="btn danger" disabled={busy || (members.length > 0 && others.length === 0)} onClick={go}>옮기고 삭제</button></div>
      </div>
    </>
  );
}

