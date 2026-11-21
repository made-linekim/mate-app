"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/sb";
import "./care-board.css";

// 해피콜 › 식단 케어 · 운동 케어 (대표님 11/21)
// 고객이 개인 링크(/d/토큰)나 MADELINE 앱으로 올린 식단 · 걸음 · 수면을 보고 매일 한마디 / 통화.
// 고객마다 '식단 코칭 원치 않음' · '운동 코칭 원치 않음'을 따로 체크 → 목록에서 빠지고 따로 표시.
// 서버(080): care_board · care_link_issue · care_pref_set · care_log · care_log_undo · care_meal_feedback
export type CareKind = "diet" | "ex";
type Meal = { id: string; day: string; meal: string | null; body: string | null; photo: string | null; at: string; feedback: string | null; feedback_by: string | null };
type Day = { day: string; steps: number | null; sleep: number | null; weight: number | null; workout: number | null; kcal: number | null };
type Row = {
  customer_key: string; branch: string; name: string | null; phone: string | null; manager: string | null; membership: string | null;
  last_visit_on: string | null; grp: "linked" | "nolink" | "off"; off_note: string | null; token: string | null;
  linked_at: string | null; app_linked: boolean; last_seen_at: string | null; days7: number; last_day: string | null;
  recent: (Meal | Day)[]; days_on?: string[] | null; visits14: number; done_today: boolean; log_id: string | null; log_result: string | null; log_note: string | null;
};
type Sub = "linked" | "nolink" | "off";

const T: Record<CareKind, { name: string; off: string; say: string; empty: string }> = {
  diet: { name: "식단", off: "식단 코칭 원치 않음", say: "오늘 올린 끼니에 짧게 칭찬 한마디 먼저, 고칠 점은 하나만 말해 주세요.", empty: "식단을 올리는 고객이 아직 없어요. '아직 연결 안 함'에서 링크를 보내 주세요." },
  ex: { name: "운동", off: "운동 코칭 원치 않음", say: "걸음 · 운동한 날을 먼저 칭찬하고, 다음 방문 전까지 할 것 하나만 정해 주세요.", empty: "걸음 · 운동 기록이 들어오는 고객이 아직 없어요. MADELINE 앱 연결이나 링크를 보내 주세요." },
};
const SUBS: { k: Sub; l: string }[] = [{ k: "linked", l: "기록 중" }, { k: "nolink", l: "아직 연결 안 함" }, { k: "off", l: "원치 않음" }];
const RES = ["한마디 보냄", "통화함", "부재", "해당없음"] as const;
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))} (${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
const gap = (today: string, d: string | null) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 864e5) : null);
const sleepTxt = (m: number | null) => (m ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : "-");
const nk = (r: Row) => `${r.branch}|${r.customer_key}`;
const dial = (p: string | null) => { const d = (p ?? "").replace(/\D/g, ""); return d.length >= 10 && !(p ?? "").includes("*") ? d : null; };
const isMeal = (x: Meal | Day): x is Meal => "meal" in x;

function why(kind: CareKind, r: Row, today: string): string {
  if (r.grp === "off") return r.off_note ? `원치 않음 · ${r.off_note}` : "코칭 원치 않음";
  if (r.grp === "nolink") return r.last_visit_on ? `최근 방문 ${md(r.last_visit_on)} · 링크 아직 안 보냄` : "링크 아직 안 보냄";
  const g = gap(today, r.last_day);
  if (kind === "diet") {
    const todayN = (r.recent as Meal[]).filter((m) => isMeal(m) && m.day === today).length;
    if (todayN) return `오늘 ${todayN}끼 올림 · 7일 중 ${r.days7}일`;
    if (g == null) return "링크 받고 아직 기록 없음";
    return g === 1 ? `어제까지 올림 · 7일 중 ${r.days7}일` : `${g}일째 기록 없음`;
  }
  const d0 = (r.recent as Day[]).find((x) => !isMeal(x) && x.day === today) ?? (r.recent as Day[])[0];
  const st = d0 && !isMeal(d0) && d0.steps != null ? ` · 걸음 ${d0.steps.toLocaleString()}` : "";
  if (g == null) return r.visits14 ? `센터 방문 ${r.visits14}회 · 앱 기록 없음` : "앱 기록 · 방문 없음";
  return `운동한 날 7일 중 ${r.days7}일${st}${r.visits14 ? ` · 방문 ${r.visits14}회` : ""}`;
}

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    sb.storage.from("care-photos").createSignedUrl(path, 3600).then(({ data }) => { if (on) setUrl(data?.signedUrl ?? null); });
    return () => { on = false; };
  }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img className="cb-ph" src={url} alt="식단 사진" /></a> : <span className="cb-ph ld" />;
}

export default function CareBoard({ kind, branch, today, onCount }: { kind: CareKind; branch: string; today: string; onCount?: (left: number) => void }) {
  const router = useRouter();
  const t = T[kind];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [sub, setSub] = useState<Sub>("linked");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [fb, setFb] = useState<Record<string, string>>({});
  const [offNote, setOffNote] = useState("");
  const [toast, setToast] = useState<{ text: string; id?: string | null } | null>(null);
  const tt = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (text: string, id?: string | null) => {
    setToast({ text, id }); if (tt.current) clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 7000);
  };

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("care_board", { p_branch: branch, p_kind: kind });
    if (error) {
      setErr(error.message.includes("NO_PERMISSION") ? "해피콜 권한이 없어요." : /care_board|function/.test(error.message) ? "서버 업데이트(080)가 아직이에요. SQL을 먼저 실행해 주세요." : "불러오지 못했어요.");
      setRows([]); return;
    }
    setErr(""); setRows((data ?? []) as Row[]);
  }, [branch, kind]);
  useEffect(() => { setRows(null); setSel(null); load(); }, [load]);

  const all = rows ?? [];
  const n = (k: Sub) => all.filter((r) => r.grp === k && (k !== "linked" || !r.done_today)).length;
  useEffect(() => { if (rows) onCount?.(n("linked")); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => all.filter((r) => r.grp === sub && (!q.trim() || `${r.name ?? ""} ${r.manager ?? ""}`.includes(q.trim())))
    .sort((a, b) => Number(a.done_today) - Number(b.done_today)), [all, sub, q]);
  const cur = sel ? all.find((r) => nk(r) === sel) ?? null : null;
  useEffect(() => { setNote(""); setFb({}); setOffNote(cur?.off_note ?? ""); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async (r: Row) => {
    const { data, error } = await sb.rpc("care_link_issue", { p_branch: r.branch, p_customer_key: r.customer_key });
    if (error || !data) return setErr("링크를 만들지 못했어요.");
    const url = `${location.origin}/d/${data as string}`;
    const msg = `${r.name ?? "회원"}님, MERA예요. 드신 식단을 사진이나 메모로 여기 올려 주시면 담당 코치가 보고 챙겨 드릴게요.\n${url}\n(MADELINE 앱에서 이 링크를 연결하면 걸음·수면도 자동으로 들어와요)`;
    try { await navigator.clipboard.writeText(msg); say(`${r.name ?? "고객"} 링크 안내 문구를 복사했어요. 카톡이나 문자에 붙여 넣어 주세요.`); }
    catch { window.prompt("아래 문구를 복사해 주세요", msg); }
    load();
  };
  const log = async (r: Row, res: (typeof RES)[number]) => {
    if (res === "한마디 보냄" && !note.trim()) return setErr("고객에게 보일 한마디를 적어 주세요.");
    setErr("");
    const { data, error } = await sb.rpc("care_log", { p_branch: r.branch, p_customer_key: r.customer_key, p_kind: kind, p_result: res, p_note: note });
    if (error) return setErr(error.message.includes("NO_PERMISSION") ? "기록 권한이 없어요." : "저장하지 못했어요. 다시 눌러 주세요.");
    setSel(null); load();
    say(res === "한마디 보냄" ? `${r.name ?? "고객"}님 링크 화면에 한마디가 보여요.` : `${r.name ?? "고객"} ${res}으로 남겼어요.`, data as string);
  };
  const undo = async () => {
    const id = toast?.id; setToast(null);
    if (!id) return;
    const { error } = await sb.rpc("care_log_undo", { p_id: id });
    if (error) return setErr("되돌리지 못했어요.");
    load();
  };
  const mealFb = async (m: Meal) => {
    const text = fb[m.id] ?? "";
    const { error } = await sb.rpc("care_meal_feedback", { p_id: m.id, p_text: text });
    if (error) return setErr("저장하지 못했어요.");
    say(text.trim() ? "끼니에 한마디를 남겼어요." : "끼니 한마디를 지웠어요."); load();
  };
  const setOff = async (r: Row, off: boolean) => {
    const { error } = await sb.rpc("care_pref_set", { p_branch: r.branch, p_customer_key: r.customer_key, p_kind: kind, p_off: off, p_note: offNote });
    if (error) return setErr("저장하지 못했어요.");
    setSel(null); load();
    say(off ? `${r.name ?? "고객"}을 '${t.off}'으로 체크했어요. 목록에서 빠지고 '원치 않음'에 따로 보여요.` : `${r.name ?? "고객"} ${t.name} 케어를 다시 시작해요.`);
  };
  const chart = (r: Row) => router.push(`/customers/chart?b=${encodeURIComponent(r.branch)}&k=${encodeURIComponent(r.customer_key)}`);

  const Badge = ({ r }: { r: Row }) => (r.grp === "off" ? <span className="bdg red">{t.off}</span>
    : r.grp === "nolink" ? <span className="bdg">미연결</span>
    : r.done_today ? <span className="bdg g">{r.log_result ?? "완료"}</span>
    : r.app_linked ? <span className="bdg grn">앱 연결</span> : null);
  const Dots = ({ r }: { r: Row }) => {
    const on = new Set(r.days_on ?? []);
    return <span className="cb-dots" aria-label={`최근 7일 중 ${r.days7}일`}>{[6, 5, 4, 3, 2, 1, 0].map((i) => { const d = addDays(today, -i); return <i key={d} className={on.has(d) ? "on" : ""} title={md(d)} />; })}<b className="num">{r.days7}/7</b></span>;
  };
  const Act = ({ r }: { r: Row }) => {
    if (r.grp === "nolink") return <button className="btn3 sm p" onClick={(e) => { e.stopPropagation(); link(r); }}>링크 보내기</button>;
    if (r.grp === "off") return <button className="btn3 sm" onClick={(e) => { e.stopPropagation(); setSel(nk(r)); }}>보기</button>;
    const d = dial(r.phone);
    return <>{d ? <a className="btn3 sm" href={`tel:${d}`} onClick={(e) => e.stopPropagation()}>전화</a> : null}<button className="btn3 sm p" onClick={(e) => { e.stopPropagation(); setSel(nk(r)); }}>{r.done_today ? "다시 보기" : "한마디"}</button></>;
  };

  const meals = cur && kind === "diet" ? (cur.recent.filter(isMeal) as Meal[]) : [];
  const exDays = cur && kind === "ex" ? (cur.recent.filter((x) => !isMeal(x)) as Day[]) : [];

  return (
    <div className={`hv3 cb${cur ? " open" : ""}`}>
      <div className="hv3-left">
        {err && <p className="wv3-err">{err}</p>}
        <div className="hv3-tool">
          <div className="hv3-grp cb-seg" role="tablist" aria-label={`${t.name} 케어 구분`}>
            {SUBS.map((s) => (
              <button key={s.k} role="tab" aria-selected={sub === s.k} className={sub === s.k ? "on" : ""} onClick={() => { setSub(s.k); setSel(null); }}>
                {s.k === "off" ? t.off.replace(" 코칭 원치 않음", " 원치 않음") : s.l}<span className="num">{n(s.k)}</span>
              </button>
            ))}
          </div>
          <input className="inp3 r" placeholder="이름 · 담당" value={q} onChange={(e) => setQ(e.target.value)} aria-label="이름 · 담당 찾기" />
        </div>
        {sub === "linked" && <div className="hv3-say"><b>먼저 꺼낼 말</b><span>{t.say}</span></div>}
        {sub === "off" && <div className="hv3-say off"><b>연락하지 않아요</b><span>{t.off}으로 체크한 고객이에요. 기록은 남길 수 있지만 {t.name} 한마디 · 전화는 하지 않아요.</span></div>}

        <section className="card hv3-tbl">
          {list.length === 0 ? <p className="wv3-empty">{!rows ? "불러오는 중이에요." : sub === "linked" ? t.empty : sub === "nolink" ? "링크를 보낼 고객이 없어요." : "원치 않는 고객이 없어요."}</p> : (
            <table>
              <thead><tr>
                <th>이름</th>{!cur && <th>휴대전화</th>}{sub === "linked" && <th>최근 7일</th>}<th>지금 상황</th><th>담당</th>{!cur && <th />}
              </tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={nk(r)} className={sel === nk(r) ? "on" : ""} onClick={() => (r.grp === "nolink" ? null : setSel(nk(r)))}>
                    <td><b>{r.name ?? "-"}</b> <Badge r={r} /></td>
                    {!cur && <td className="num">{r.phone ?? "-"}</td>}
                    {sub === "linked" && <td><Dots r={r} /></td>}
                    <td className="why">{why(kind, r, today)}</td>
                    <td>{r.manager ?? "-"}</td>
                    {!cur && <td className="act"><Act r={r} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <div className="hv3-cards">
          {list.length === 0 && <section className="card"><p className="wv3-empty">{!rows ? "불러오는 중이에요." : sub === "linked" ? t.empty : sub === "nolink" ? "링크를 보낼 고객이 없어요." : "원치 않는 고객이 없어요."}</p></section>}
          {list.map((r) => (
            <section key={nk(r)} className="card hv3-mc" onClick={() => (r.grp === "nolink" ? null : setSel(nk(r)))}>
              <div className="h"><b>{r.name ?? "-"}</b><Badge r={r} /></div>
              {sub === "linked" && <Dots r={r} />}
              <div className="w">{why(kind, r, today)}</div>
              <div className="m">담당 {r.manager ?? "-"}{r.phone ? ` · ${r.phone}` : ""}</div>
              <div className="a"><Act r={r} /></div>
            </section>
          ))}
        </div>
      </div>

      {cur && (
        <>
          <div className="wv3-dim cb-mdim" onClick={() => setSel(null)} />
          <aside className="hv3-panel cb-panel" role="dialog" aria-label={`${t.name} 케어`}>
            <div className="ph"><h2>{t.name} 케어</h2><Badge r={cur} /><button className="x" onClick={() => setSel(null)}>닫기</button></div>
            <div className="pb">
              <div className="who"><h3>{cur.name ?? "-"}</h3><p>{[cur.phone, cur.manager ? `담당 ${cur.manager}` : "", cur.membership].filter(Boolean).join(" · ")}</p></div>

              {kind === "diet" && (
                <div className="box"><label>최근 3일 식단</label>
                  {meals.length === 0 ? <p>아직 올린 끼니가 없어요.</p> : meals.map((m) => (
                    <div key={m.id} className="cb-meal">
                      {m.photo && <Thumb path={m.photo} />}
                      <div className="tx">
                        <b>{md(m.day)} · {m.meal ?? "식단"}</b> <span className="mut">{hm(m.at)}</span>
                        {m.body && <p>{m.body}</p>}
                        {cur.grp !== "off" && (
                          <div className="fbr">
                            <input className="inp3" placeholder="이 끼니에 한마디" defaultValue={m.feedback ?? ""} onChange={(e) => setFb((s) => ({ ...s, [m.id]: e.target.value }))} />
                            <button className="btn3 sm" onClick={() => mealFb(m)}>남기기</button>
                          </div>
                        )}
                        {m.feedback && <span className="mut">남긴 한마디 · {m.feedback}{m.feedback_by ? ` (${m.feedback_by})` : ""}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {kind === "ex" && (
                <div className="box"><label>최근 7일 (애플 건강 · 헬스 커넥트)</label>
                  {exDays.length === 0 ? <p>앱 기록이 아직 없어요. 최근 14일 센터 방문 {cur.visits14}회.</p> : (
                    <div className="cb-days">
                      {exDays.map((d) => (
                        <div key={d.day}><b>{md(d.day)}</b><span>걸음 <em className="num">{d.steps != null ? d.steps.toLocaleString() : "-"}</em></span><span>운동 <em>{d.workout ? `${d.workout}분` : "-"}</em></span><span>수면 <em>{sleepTxt(d.sleep)}</em></span>{d.weight != null && <span>체중 <em className="num">{d.weight}kg</em></span>}</div>
                      ))}
                    </div>
                  )}
                  <p className="mut">센터 방문(운동일지) 최근 14일 {cur.visits14}회</p>
                </div>
              )}

              {cur.grp !== "off" && (
                <div className="box"><label>오늘 {t.name} 한마디 (고객 링크 화면에 보여요)</label>
                  {cur.done_today && cur.log_note && <p className="mut">오늘 남김 · {cur.log_note}</p>}
                  <textarea className="inp3 cb-ta" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={kind === "diet" ? "예: 점심 단백질 잘 챙기셨어요! 저녁은 밥 반 공기만 줄여 볼까요?" : "예: 이번 주 3일 걸으셨네요! 다음 방문 전까지 하루 6천 보만 지켜 봐요."} />
                  <div className="hv3-res cb-res">{RES.map((x) => <button key={x} className={x === "한마디 보냄" ? "p" : ""} onClick={() => log(cur, x)}>{x}</button>)}</div>
                </div>
              )}

              <div className={`box cb-off${cur.grp === "off" ? " on" : ""}`}>
                <label className="cb-chk"><input type="checkbox" checked={cur.grp === "off"} onChange={(e) => setOff(cur, e.target.checked)} /> {t.off}</label>
                <input className="inp3" placeholder={kind === "diet" ? "사유 (예: 식단 간섭 싫어하심)" : "사유 (예: 운동 숙제 부담스러워하심)"} value={offNote} onChange={(e) => setOffNote(e.target.value)} />
                <p className="mut">체크하면 {t.name} 케어 목록에서 빠지고 '원치 않음'에 따로 보여요. {kind === "diet" ? "운동" : "식단"} 케어는 그대로예요.</p>
              </div>
            </div>
            <div className="pf">
              <button className="btn3" onClick={() => link(cur)}>링크 다시 복사</button>
              <button className="btn3 ghost r" onClick={() => chart(cur)}>고객 차트 열기</button>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="wv3-toast hv3-toast" role="status">
          <span>{toast.text}</span>
          {toast.id && <button onClick={undo}>되돌리기</button>}
        </div>
      )}
    </div>
  );
}
