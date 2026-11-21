"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { todayKST, addDays, dow } from "@/lib/schedule";

// 업무 메모 (대표님 11/21): 메모만. 일간·주간·월간 + 날짜 이동, 날짜별로 묶음,
// 메모마다 누가·언제 · 수정 · 삭제 · 코멘트 쓰기. 중요(별) 메모는 위로. 정렬: 중요도 / 과거순
// 서버: 054 rsv_work_memo_feed / save / star / reply / del

type Reply = { id: string; body: string; author: string; at: string; edited_at: string | null };
type Memo = { id: string; day: string; title: string | null; body: string; important: boolean; author: string; at: string; edited_at: string | null; replies: Reply[] };
type Span = "d" | "w" | "m";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Star = ({ on }: { on: boolean }) => (
  <svg className="i" viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" /></svg>
);
const L = <svg className="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" {...P} /></svg>;
const R = <svg className="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" {...P} /></svg>;
const DW = ["일", "월", "화", "수", "목", "금", "토"];

const monthEnd = (d: string) => addDays(`${addDays(`${d.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const tm = (t: string) => {
  const k = new Date(new Date(t).getTime() + 9 * 36e5).toISOString();
  return `${Number(k.slice(5, 7))}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
};
const kday = (t: string) => new Date(new Date(t).getTime() + 9 * 36e5).toISOString().slice(0, 10);
const errText = (m: string) =>
  /Could not find the function|does not exist|PGRST202|schema cache/.test(m) ? "업무 메모 새 기능은 서버 준비 중이에요. 054 SQL을 실행하면 열려요."
  : /NO_PERMISSION|FORBIDDEN/.test(m) ? "권한이 없어요. 쓴 사람이나 관리자만 고칠 수 있어요."
  : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

function range(span: Span, at: string): [string, string] {
  if (span === "d") return [at, at];
  if (span === "w") { const s = addDays(at, -((dow(at) + 6) % 7)); return [s, addDays(s, 6)]; }
  return [`${at.slice(0, 8)}01`, monthEnd(at)];
}

export default function WorkMemo({ branch }: { branch: string }) {
  const me = useMe();
  const lead = me.tier === "owner" || me.tier === "manager";
  const [span, setSpan] = useState<Span>("w");
  const [at, setAt] = useState(todayKST());
  const [sort, setSort] = useState<"imp" | "old">("imp");
  const [list, setList] = useState<Memo[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<{ id: string | null; day: string; title: string; body: string; important: boolean } | null>(null);
  const [reply, setReply] = useState<{ parent: string; id: string | null; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ id: string; what: string } | null>(null);
  const [from, to] = range(span, at);

  const load = useCallback(() => {
    sb.rpc("rsv_work_memo_feed", { p_branch: branch, p_from: from, p_to: to }).then(({ data, error }) => {
      if (error) { setErr(errText(error.message)); setList([]); return; }
      setErr(""); setList((data ?? []) as Memo[]);
    });
  }, [branch, from, to]);
  useEffect(() => { setList(null); load(); }, [load]);

  const step = (n: number) => setAt(span === "d" ? addDays(at, n) : span === "w" ? addDays(at, n * 7) : `${addDays(`${at.slice(0, 8)}15`, n * 30).slice(0, 8)}01`);
  const label = span === "d" ? `${at.slice(0, 4)} ${md(at)} (${DW[dow(at)]})` : span === "w" ? `${from.slice(0, 4)} ${md(from)} ~ ${md(to)}` : `${at.slice(0, 4)}년 ${Number(at.slice(5, 7))}월`;
  const mine = (a: string) => lead || a === me.name;

  // 중요도: 별 메모를 맨 위 '중요'로, 나머지는 최근 날짜부터. 과거순: 날짜 오래된 것부터(그날 안에서 별 먼저)
  const groups = useMemo(() => {
    const ms = list ?? [];
    const byDay = (xs: Memo[], asc: boolean) => {
      const g = new Map<string, Memo[]>();
      [...xs].sort((a, b) => (asc ? a.day.localeCompare(b.day) : b.day.localeCompare(a.day)) || Number(b.important) - Number(a.important) || a.at.localeCompare(b.at))
        .forEach((m) => { if (!g.has(m.day)) g.set(m.day, []); g.get(m.day)!.push(m); });
      return [...g.entries()].map(([d, xs2]) => ({ k: d, label: d.replace(/-/g, "."), items: xs2 }));
    };
    if (sort === "old") return byDay(ms, true);
    const imp = ms.filter((m) => m.important).sort((a, b) => b.day.localeCompare(a.day));
    return [...(imp.length ? [{ k: "imp", label: "중요", items: imp }] : []), ...byDay(ms.filter((m) => !m.important), false)];
  }, [list, sort]);

  const save = async () => {
    if (!form || (!form.body.trim() && !form.title.trim())) return;
    setBusy(true);
    const { error } = await sb.rpc("rsv_work_memo_save", { p_id: form.id, p_branch: branch, p_day: form.day, p_title: form.title.trim(), p_body: form.body.trim(), p_important: form.important });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    setForm(null); load();
  };
  const star = async (m: Memo) => {
    setList((l) => (l ?? []).map((x) => (x.id === m.id ? { ...x, important: !m.important } : x)));
    const { error } = await sb.rpc("rsv_work_memo_star", { p_id: m.id, p_on: !m.important });
    if (error) { setErr(errText(error.message)); load(); }
  };
  const del = (id: string, what: string) => setAsk({ id, what });
  const delGo = async () => {
    if (!ask) return;
    const id = ask.id; setAsk(null);
    const { error } = await sb.rpc("rsv_work_memo_del", { p_id: id });
    if (error) return setErr(errText(error.message));
    load();
  };
  const sendReply = async () => {
    if (!reply || !reply.body.trim()) return;
    setBusy(true);
    const { error } = await sb.rpc("rsv_work_memo_reply", { p_id: reply.id, p_parent: reply.parent, p_body: reply.body.trim() });
    setBusy(false);
    if (error) return setErr(errText(error.message));
    setReply(null); load();
  };

  return (
    <div className="wm">
      <div className="wm-nav">
        <button className="ib" onClick={() => step(-1)} aria-label="이전">{L}</button>
        <b className="num">{label}</b>
        <button className="ib" onClick={() => step(1)} aria-label="다음">{R}</button>
      </div>
      <div className="wm-bar">
        <select className="wm-span" value={span} onChange={(e) => setSpan(e.target.value as Span)} aria-label="기간">
          <option value="d">일간</option><option value="w">주간</option><option value="m">월간</option>
        </select>
        <input className="wm-date" type="date" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} aria-label="날짜 고르기" />
        <button className="btn3 sm p" onClick={() => setForm({ id: null, day: span === "d" ? at : todayKST(), title: "", body: "", important: false })}>메모 등록</button>
      </div>
      <div className="wm-sort">
        <button className={sort === "imp" ? "on" : ""} onClick={() => setSort("imp")}><Star on={sort === "imp"} />중요도</button>
        <i />
        <button className={sort === "old" ? "on" : ""} onClick={() => setSort("old")}>과거순</button>
      </div>
      {err && <p className="wm-err">{err}</p>}
      {list === null ? <div className="card mempty">불러오는 중…</div>
        : list.length === 0 ? <div className="card mempty">이 기간에 남긴 업무 메모가 없어요.</div>
        : groups.map((g) => (
          <div key={g.k} className="wm-g">
            <div className={`wm-day${g.k === "imp" ? " imp" : ""}`}>{g.k === "imp" ? <><Star on />중요</> : g.label}</div>
            {g.items.map((m) => (
              <div key={m.id} className={`card wm-c${m.important ? " imp" : ""}`}>
                <div className="h">
                  <button className={`st${m.important ? " on" : ""}`} onClick={() => star(m)} aria-label={m.important ? "중요 끄기" : "중요로 올리기"}><Star on={m.important} /></button>
                  <b>{m.title || m.body.split("\n")[0]}</b>
                </div>
                {(m.title ? m.body : m.body.split("\n").slice(1).join("\n")).trim() && <div className="t">{m.title ? m.body : m.body.split("\n").slice(1).join("\n")}</div>}
                <div className="who num">{m.author || "직원"} · {tm(m.at)}{g.k === "imp" && m.day !== kday(m.at) ? ` · ${md(m.day)} 메모` : ""}{m.edited_at ? " · 수정됨" : ""}</div>
                <div className="a">
                  {mine(m.author) && <button onClick={() => setForm({ id: m.id, day: m.day, title: m.title ?? "", body: m.body, important: m.important })}>수정</button>}
                  {mine(m.author) && <button className="d" onClick={() => del(m.id, "메모")}>삭제</button>}
                  <button className="c" onClick={() => setReply({ parent: m.id, id: null, body: "" })}>코멘트 쓰기</button>
                </div>
                {(m.replies.length > 0 || reply?.parent === m.id) && (
                  <div className="rp">
                    {m.replies.map((r) => reply?.id === r.id ? null : (
                      <div key={r.id} className="r">
                        <div className="rt">{r.body}</div>
                        <div className="rw num">{r.author || "직원"} · {tm(r.at)}{r.edited_at ? " · 수정됨" : ""}
                          {mine(r.author) && <><button onClick={() => setReply({ parent: m.id, id: r.id, body: r.body })}>수정</button><button className="d" onClick={() => del(r.id, "코멘트")}>삭제</button></>}
                        </div>
                      </div>
                    ))}
                    {reply?.parent === m.id && (
                      <div className="rf">
                        <textarea autoFocus maxLength={1000} value={reply.body} onChange={(e) => setReply({ ...reply, body: e.target.value })} placeholder="코멘트를 남겨요" aria-label="코멘트" />
                        <div className="rb"><button className="btn3 sm" onClick={() => setReply(null)}>닫기</button><button className="btn3 sm p" disabled={busy || !reply.body.trim()} onClick={sendReply}>{reply.id ? "고치기" : "등록"}</button></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

      {ask && (
        <>
          <div className="wm-dim" onClick={() => setAsk(null)} />
          <div className="wm-form wm-ask" role="alertdialog" aria-label="지우기 확인">
            <h3>이 {ask.what}를 지울까요?</h3>
            <p>{ask.what === "메모" ? "달린 코멘트도 같이 지워져요. " : ""}지우면 되돌릴 수 없어요.</p>
            <div className="ff"><button className="btn3" onClick={() => setAsk(null)}>닫기</button><button className="btn3 p" onClick={delGo}>지우기</button></div>
          </div>
        </>
      )}
      {form && (
        <>
          <div className="wm-dim" onClick={() => setForm(null)} />
          <div className="wm-form" role="dialog" aria-label="업무 메모 작성">
            <div className="fh"><h3>{form.id ? "업무 메모 고치기" : "업무 메모 작성"}</h3>
              <button className={`st${form.important ? " on" : ""}`} onClick={() => setForm({ ...form, important: !form.important })}><Star on={form.important} />중요도</button>
            </div>
            <label>메모 날짜<input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value || form.day })} /></label>
            <label>제목<input maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus /></label>
            <label>내용<textarea maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
            <div className="ff"><button className="btn3" onClick={() => setForm(null)}>닫기</button><button className="btn3 p" disabled={busy || (!form.body.trim() && !form.title.trim())} onClick={save}>{form.id ? "고치기" : "등록하기"}</button></div>
          </div>
        </>
      )}
    </div>
  );
}
