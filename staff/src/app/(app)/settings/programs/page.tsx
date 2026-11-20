"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won } from "@/lib/sales";
import { friendly } from "../../membership/ui";
import { Head, Ico, IconBtn, Msg, Switch } from "../ui";

type G = { id: string; name: string; short: string; grp: string; color: string; minutes: number; unit_price: number; capacity: number; branches: string[]; sort: number; active: boolean };
const GRPS = ["시술", "체험", "상담", "업무", "행사"];
const EMPTY: G = { id: "", name: "", short: "", grp: "시술", color: "#5F7FA8", minutes: 60, unit_price: 0, capacity: 1, branches: [...BRANCHES], sort: 0, active: true };
const MINS = Array.from({ length: 24 }, (_, i) => (i + 1) * 10);
const branchText = (b: string[]) => (b?.length === BRANCHES.length ? "전 지점" : b?.join(", ") || "-");

export default function Programs() {
  const me = useMe();
  const owner = me.tier === "owner";
  const [rows, setRows] = useState<G[]>([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<G | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("program_admin_list");
    if (error) return setMsg(friendly(error.message));
    setRows((data ?? []) as G[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const k = q.trim();
    const list = rows.filter((g) => !k || g.name.includes(k) || g.short?.includes(k));
    const m = new Map<string, G[]>();
    list.forEach((g) => m.set(g.grp || "기타", [...(m.get(g.grp || "기타") ?? []), g]));
    return [...m.entries()].sort((a, b) => (GRPS.indexOf(a[0]) + 99) % 99 - (GRPS.indexOf(b[0]) + 99) % 99);
  }, [rows, q]);

  async function save(g: G, close = true) {
    if (!g.name.trim()) return setMsg("이름을 적어 주세요");
    const { error } = await sb.rpc("program_save", { p: g });
    if (error) return setMsg(friendly(error.message));
    if (close) setEdit(null);
    setMsg("저장했어요"); load();
  }

  return (
    <>
      <Head title="프로그램 설정"><Msg text={msg} /></Head>
      <div className="st-note">금액·시간을 바꾸면 앞으로 잡는 예약부터 반영돼요. 이미 잡힌 예약은 그대로예요.{owner ? "" : " 수정은 대표관리자만 할 수 있어요."}</div>
      <div className="st-bar">
        <label className="st-q"><Ico n="search" /><input className="inp" placeholder="프로그램 이름" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {owner && <div className="st-right"><button className="btn p" onClick={() => setEdit({ ...EMPTY })}><Ico n="plus" />프로그램 추가</button></div>}
      </div>

      <div className="st-tbl st-pc">
        <table className="t">
          <thead><tr><th>프로그램</th><th className="r">소요 시간</th><th className="r">같은 시간 최대</th><th className="r">금액</th><th>지점</th><th>사용</th><th style={{ width: 64 }}>{owner ? "관리" : ""}</th></tr></thead>
          <tbody>
            {groups.map(([grp, list]) => [
              <tr key={grp} className="grp"><td colSpan={7}>{grp}</td></tr>,
              ...list.map((g) => (
                <tr key={g.id} className={`kid ${g.active ? "" : "mute"}`}>
                  <td><span className="ln" /><span className="st-dot" style={{ background: g.color }} /><span className="nm">{g.name}</span>{g.short && g.short !== g.name && <span className="sub">{g.short}</span>}</td>
                  <td className="r num">{g.minutes}분</td>
                  <td className="r num">{g.capacity}건</td>
                  <td className="r num">{won(g.unit_price)}</td>
                  <td>{branchText(g.branches)}</td>
                  <td><Switch on={g.active} disabled={!owner} label={`${g.name} 사용`} onChange={(v) => save({ ...g, active: v }, false)} /></td>
                  <td>{owner && <IconBtn n="edit" label="고치기" onClick={() => setEdit({ ...g })} />}</td>
                </tr>
              )),
            ])}
            {groups.length === 0 && <tr><td colSpan={7} className="none">{q ? "찾는 프로그램이 없어요" : "프로그램이 없어요"}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 모바일 (8차 M26) */}
      <div className="st-m">
        <p className="st-foot" style={{ margin: "0 0 8px" }}>예약할 때 시간은 고르지 않고 여기 값이 자동으로 들어가요.</p>
        <div className="st-list">
          {groups.flatMap(([, list]) => list).map((g) => (
            <button key={g.id} disabled={!owner} onClick={() => setEdit({ ...g })} style={{ opacity: g.active ? 1 : 0.5 }}>
              <span className="sq" style={{ background: g.color }} />
              <span className="tx"><b>{g.name}{!g.active && <span className="badge">숨김</span>}</b><span className="num">{g.minutes}분 · 같은 시간 {g.capacity}건까지 · {won(g.unit_price)}원</span></span>
              {owner && <span className="ch"><Ico n="chev" /></span>}
            </button>
          ))}
        </div>
      </div>

      {edit && (
        <>
          <div className="dim" onClick={() => setEdit(null)} />
          <div className="drawer" role="dialog" aria-label="프로그램">
            <div className="hd">{edit.id ? "프로그램 고치기" : "프로그램 추가"}</div>
            <div className="bd st-form">
              <div className="field"><label>이름</label><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="two">
                <div className="field"><label>줄임 이름 (예약표 칸)</label><input className="inp" value={edit.short ?? ""} onChange={(e) => setEdit({ ...edit, short: e.target.value })} /></div>
                <div className="field"><label>분류</label><select className="sel" value={edit.grp} onChange={(e) => setEdit({ ...edit, grp: e.target.value })}>{GRPS.map((g) => <option key={g}>{g}</option>)}</select></div>
              </div>
              <div className="two">
                <div className="field"><label>소요 시간</label>
                  <select className="sel" value={edit.minutes} onChange={(e) => setEdit({ ...edit, minutes: +e.target.value })}>
                    {(MINS.includes(edit.minutes) ? MINS : [edit.minutes, ...MINS]).map((m) => <option key={m} value={m}>{m}분</option>)}
                  </select>
                </div>
                <div className="field"><label>금액</label><input className="inp num" type="number" min={0} step={1000} value={edit.unit_price} onChange={(e) => setEdit({ ...edit, unit_price: +e.target.value })} /></div>
              </div>
              <div className="field"><label>같은 시간 최대 예약</label>
                <div className="st-step">
                  <button type="button" aria-label="줄이기" onClick={() => setEdit({ ...edit, capacity: Math.max(1, edit.capacity - 1) })}>−</button>
                  <b>{edit.capacity}</b>
                  <button type="button" aria-label="늘리기" onClick={() => setEdit({ ...edit, capacity: Math.min(50, edit.capacity + 1) })}>+</button>
                </div>
              </div>
              <div className="field"><label>예약표 색</label><input className="inp" type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value.toUpperCase() })} style={{ width: 80, padding: 4 }} /></div>
              <div className="field"><label>지점</label>
                <div className="row">
                  {BRANCHES.map((b) => {
                    const on = edit.branches.includes(b);
                    return <button key={b} type="button" className={`chip ${on ? "on" : ""}`} onClick={() => setEdit({ ...edit, branches: on ? edit.branches.filter((x) => x !== b) : [...edit.branches, b] })}>{b}</button>;
                  })}
                </div>
              </div>
              <div className="field"><label>사용</label>
                <div className="row"><Switch on={edit.active} label="사용" onChange={(v) => setEdit({ ...edit, active: v })} /><span className="st-ro">{edit.active ? "새 예약에서 골라요" : "숨김 · 새 예약에서 안 보여요"}</span></div>
              </div>
              <p className="help">지난 예약·매출 기록은 그대로 남아요. 숨기면 새 예약에서만 안 보여요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setEdit(null)}>닫기</button><button className="btn p" onClick={() => save(edit)}>저장</button></div>
          </div>
        </>
      )}
    </>
  );
}
