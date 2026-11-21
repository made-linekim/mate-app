"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";

// 업무 요청 (대표님 11/21): 담당자를 정해서 요청 → 진행중 · 완료 · 보류. 오늘 할 일 > 남은 업무 탭 위쪽.
// 서버: 055 work_req_list / save / status / del

type St = "진행중" | "완료" | "보류";
type Req = {
  id: string; title: string; body: string | null; assignee: string | null; requester: string; status: St;
  due_day: string | null; at: string; edited_at: string | null; status_at: string | null; status_by: string | null;
};
const STS: St[] = ["진행중", "보류", "완료"];
const tm = (t: string) => { const k = new Date(new Date(t).getTime() + 9 * 36e5).toISOString(); return `${Number(k.slice(5, 7))}.${k.slice(8, 10)} ${k.slice(11, 16)}`; };
const md = (d: string) => `${Number(d.slice(5, 7))}.${d.slice(8, 10)}`;
const errText = (m: string) =>
  /Could not find the function|does not exist|PGRST202|schema cache/.test(m) ? "업무 요청은 서버 준비 중이에요. 055 SQL을 실행하면 열려요."
  : /NO_PERMISSION|FORBIDDEN/.test(m) ? "권한이 없어요. 담당자·요청한 사람·관리자만 바꿀 수 있어요."
  : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

export default function WorkReq({ branch, staff, lead, say }: { branch: string; staff: string[]; lead: boolean; say: (t: { text: string }) => void }) {
  const me = useMe();
  const [list, setList] = useState<Req[] | null>(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState<St>("진행중");
  const [form, setForm] = useState<{ id: string | null; title: string; body: string; assignee: string; due: string } | null>(null);
  const [ask, setAsk] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    sb.rpc("work_req_list", { p_branch: branch }).then(({ data, error }) => {
      if (error) { setErr(errText(error.message)); setList([]); return; }
      setErr(""); setList((data ?? []) as Req[]);
    });
  }, [branch]);
  useEffect(() => { setList(null); load(); }, [load]);

  // 직원은 내가 담당이거나 내가 요청한 것만
  const mineAll = (list ?? []).filter((r) => lead || r.assignee === me.name || r.requester === me.name);
  const n = (s: St) => mineAll.filter((r) => r.status === s).length;
  const rows = mineAll.filter((r) => r.status === f);
  const canSt = (r: Req) => lead || r.assignee === me.name || r.requester === me.name;
  const canEdit = (r: Req) => lead || r.requester === me.name;

  const setSt = async (r: Req, s: St) => {
    if (r.status === s) return;
    setList((l) => (l ?? []).map((x) => (x.id === r.id ? { ...x, status: s } : x)));
    const { error } = await sb.rpc("work_req_status", { p_id: r.id, p_status: s });
    if (error) { setErr(errText(error.message)); return load(); }
    say({ text: `'${r.title}'을(를) ${s}${s === "진행중" ? "으로" : "로"} 바꿨어요.` });
  };
  const save = async () => {
    if (!form || !form.title.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("work_req_save", { p_id: form.id, p_branch: branch, p_title: form.title.trim(), p_body: form.body.trim(), p_assignee: form.assignee || null, p_due: form.due || null });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    say({ text: form.id ? "요청을 고쳤어요." : `${form.assignee ? `${form.assignee}님에게 ` : ""}요청을 남겼어요.` });
    setForm(null); if (!form.id) setF("진행중"); load();
  };
  const del = async () => {
    if (!ask) return;
    const id = ask.id; setAsk(null);
    const { error } = await sb.rpc("work_req_del", { p_id: id });
    if (error) return setErr(errText(error.message));
    load();
  };

  return (
    <div className="wr">
      <div className="wv3-sech wr-h">
        <h2>업무 요청</h2>
        <div className="wr-f" role="tablist" aria-label="요청 상태">
          {STS.map((s) => <button key={s} role="tab" aria-selected={f === s} className={`${f === s ? "on" : ""} s-${s}`} onClick={() => setF(s)}>{s}<span className="num">{n(s)}</span></button>)}
        </div>
        <button className="btn3 sm p wr-add" onClick={() => setForm({ id: null, title: "", body: "", assignee: "", due: "" })}>+ 요청하기</button>
      </div>
      {err && <p className="wv3-err">{err}</p>}
      <section className="card wr-list">
        {list === null ? <p className="wv3-empty">불러오는 중이에요.</p>
          : rows.length === 0 ? <p className="wv3-empty">{f === "진행중" ? "진행 중인 요청이 없어요." : f === "보류" ? "보류한 요청이 없어요." : "최근 30일 동안 완료한 요청이 없어요."}</p>
          : rows.map((r) => (
            <div key={r.id} className={`wr-r st-${r.status}`}>
              <div className="wr-tp">
                <b className="wr-tt">{r.title}</b>
                {r.due_day && <span className={`wr-due num${r.status !== "완료" && r.due_day < new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10) ? " late" : ""}`}>{md(r.due_day)}까지</span>}
              </div>
              {r.body && <p className="wr-b">{r.body}</p>}
              <div className="wr-who num">
                <span>{r.requester} → <b>{r.assignee || "담당 미정"}</b></span>
                <span>{tm(r.at)}{r.edited_at ? " · 수정됨" : ""}</span>
                {r.status !== "진행중" && r.status_by && r.status_at && <span>{r.status} {r.status_by} {tm(r.status_at)}</span>}
              </div>
              <div className="wr-ac">
                <div className="wr-sg" role="group" aria-label="상태">
                  {STS.map((s) => <button key={s} className={`${r.status === s ? "on" : ""} s-${s}`} disabled={!canSt(r)} onClick={() => setSt(r, s)}>{s}</button>)}
                </div>
                {canEdit(r) && <span className="wr-ed">
                  <button onClick={() => setForm({ id: r.id, title: r.title, body: r.body ?? "", assignee: r.assignee ?? "", due: r.due_day ?? "" })}>수정</button>
                  <button className="d" onClick={() => setAsk(r)}>삭제</button>
                </span>}
              </div>
            </div>
          ))}
      </section>

      {form && (
        <>
          <div className="wv3-dim" onClick={() => setForm(null)} />
          <div className="wv3-sheet" role="dialog" aria-label="업무 요청">
            <i className="grab" /><div className="ph"><h2>{form.id ? "요청 고치기" : "업무 요청"}</h2><button className="btn3 sm g" onClick={() => setForm(null)}>닫기</button></div>
            <div className="pb">
              <div className="fld"><label>담당자</label><div className="pills">
                {staff.map((s) => <button key={s} className={form.assignee === s ? "on" : ""} onClick={() => setForm({ ...form, assignee: form.assignee === s ? "" : s })}>{s}</button>)}
                {staff.length === 0 && <span className="wv3-cap">등록된 직원이 없어요.</span>}
              </div></div>
              <div className="fld"><label htmlFor="wr-t">요청할 일</label><input id="wr-t" className="inp3" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 양주점 수건 재고 확인" /></div>
              <div className="fld"><label htmlFor="wr-b">내용 (선택)</label><textarea id="wr-b" maxLength={1000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
              <div className="fld"><label htmlFor="wr-d">언제까지 (선택)</label><input id="wr-d" className="inp3" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
            </div>
            <div className="pf two"><button className="btn3" onClick={() => setForm(null)}>닫기</button><button className="btn3 p" disabled={busy || !form.title.trim()} onClick={save}>{form.id ? "고치기" : "요청하기"}</button></div>
          </div>
        </>
      )}
      {ask && (
        <>
          <div className="wv3-dim" onClick={() => setAsk(null)} />
          <div className="wv3-sheet" role="alertdialog" aria-label="요청 지우기">
            <i className="grab" /><div className="ph"><h2>이 요청을 지울까요?</h2></div>
            <div className="pb"><p className="wr-ask">&apos;{ask.title}&apos; 요청을 지우면 되돌릴 수 없어요.</p></div>
            <div className="pf two"><button className="btn3" onClick={() => setAsk(null)}>닫기</button><button className="btn3 p" onClick={del}>지우기</button></div>
          </div>
        </>
      )}
    </div>
  );
}
