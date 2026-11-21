"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { friendly } from "../../membership/ui";
import { Head, Ico, IconBtn, Msg, dayLabel, useSetBranch } from "../ui";

type Hol = { day: string; reason: string };
type Edit = { orig: string | null; day: string; reason: string };
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export default function HolidaysPage() {
  const branch = useSetBranch();
  const [hols, setHols] = useState<Hol[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [ready, setReady] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    // rsv_holiday_list 는 한 번에 42일까지만 돌려줘요 → 오늘부터 1년을 나눠서 불러요
    const from = todayKST();
    const chunks = Array.from({ length: 9 }, (_, i) => addDays(from, i * 42));
    const [s, ...hs] = await Promise.all([
      sb.rpc("settings_get", { p_branch: branch }),
      ...chunks.map((f) => sb.rpc("rsv_holiday_list", { p_branch: branch, p_from: f, p_to: addDays(f, 41) })),
    ]);
    if (s.error || !s.data) { setMsg(s.error ? friendly(s.error.message) : "이 화면을 볼 권한이 없어요"); setHols([]); return; }
    setCanEdit(!!s.data.can_edit); setReady(true);
    const map = new Map<string, Hol>();
    hs.forEach((h) => ((h.data ?? []) as Hol[]).forEach((x) => map.set(x.day, x)));
    setHols([...map.values()].sort((a, b) => a.day.localeCompare(b.day)));
  }, [branch]);
  useEffect(() => { setMsg(""); load(); }, [load]);

  async function save() {
    if (!edit?.day) return setMsg("날짜를 골라 주세요");
    setBusy(true);
    const { error } = await sb.rpc("holiday_add", { p_branch: branch, p_day: edit.day, p_reason: edit.reason.trim() });
    if (!error && edit.orig && edit.orig !== edit.day) {
      const r = await sb.rpc("holiday_del", { p_branch: branch, p_day: edit.orig });
      if (r.error) { setBusy(false); return setMsg(friendly(r.error.message)); }
    }
    setBusy(false);
    if (error) return setMsg(friendly(error.message));
    setEdit(null); setMsg("저장했어요"); load();
  }
  async function del(h: Hol) {
    if (!window.confirm(`${dayLabel(h.day)} 휴무를 지울까요?`)) return;
    const { error } = await sb.rpc("holiday_del", { p_branch: branch, p_day: h.day });
    if (error) return setMsg(friendly(error.message));
    setMsg("지웠어요"); load();
  }

  return (
    <>
      <Head title="휴무" meta="지점 휴무일"><Msg text={msg} />{ready && !canEdit && <span className="st-ro">보기만 할 수 있어요</span>}</Head>
      <div className="st-bar">
        <div className="seg">
          <button className="on">지점 휴무</button>
          <button disabled title="준비 중이에요">직원 휴무</button>
        </div>
        {canEdit && (
          <div className="st-right">
            <button className="btn" onClick={() => setEdit({ orig: null, day: todayKST(), reason: "" })}><Ico n="plus" />휴무 추가</button>
          </div>
        )}
      </div>
      <div className="st-tbl st-pc">
        <table className="t">
          <thead><tr><th>날짜</th><th>구분</th><th>대상</th><th>사유</th><th>반복</th><th style={{ width: 96 }}>{canEdit ? "관리" : ""}</th></tr></thead>
          <tbody>
            {hols.map((h) => (
              <tr key={h.day}>
                <td className="num">{dayLabel(h.day)}</td>
                <td><span className="badge">지점</span></td>
                <td>{branch}</td>
                <td>{h.reason || "-"}</td>
                <td />
                <td>{canEdit && (
                  <div className="st-ibs">
                    <IconBtn n="edit" label="고치기" onClick={() => setEdit({ orig: h.day, day: h.day, reason: h.reason })} />
                    <IconBtn n="trash" label="지우기" onClick={() => del(h)} />
                  </div>
                )}</td>
              </tr>
            ))}
            {hols.length === 0 && <tr><td colSpan={6} className="none">앞으로 잡힌 휴무일이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="st-m">
        <div className="st-list">
          {hols.map((h) => (
            <div key={h.day} className="st-hrow">
              <span className="tx"><b className="num">{dayLabel(h.day)}</b><span>지점 · {branch}{h.reason ? ` · ${h.reason}` : ""}</span></span>
              {canEdit && (
                <span className="st-ibs">
                  <IconBtn n="edit" label="고치기" onClick={() => setEdit({ orig: h.day, day: h.day, reason: h.reason })} />
                  <IconBtn n="trash" label="지우기" onClick={() => del(h)} />
                </span>
              )}
            </div>
          ))}
          {hols.length === 0 && <p className="st-foot">앞으로 잡힌 휴무일이 없어요</p>}
        </div>
      </div>
      <p className="st-foot">오늘부터 1년 안의 휴무만 보여요. 휴무일은 예약표에서 좁고 흐리게 보여요.</p>

      {edit && (
        <>
          <div className="dim" onClick={() => setEdit(null)} />
          <div className="drawer" role="dialog" aria-label="휴무">
            <div className="hd">{edit.orig ? "휴무 고치기" : "휴무 추가"}</div>
            <div className="bd st-form">
              <div className="field"><label>지점</label><input className="inp" value={branch} disabled readOnly /></div>
              <div className="field"><label>날짜</label><input className="inp" type="date" value={edit.day} onChange={(e) => setEdit({ ...edit, day: e.target.value })} /></div>
              <div className="field"><label>사유</label><input className="inp" placeholder="예: 설 연휴" maxLength={100} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></div>
              <p className="help">같은 날짜가 이미 있으면 사유만 바뀌어요.</p>
            </div>
            <div className="ft"><button className="btn" onClick={() => setEdit(null)}>닫기</button><button className="btn p" disabled={busy} onClick={save}>저장</button></div>
          </div>
        </>
      )}
    </>
  );
}
