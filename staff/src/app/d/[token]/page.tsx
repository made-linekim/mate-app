"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { sb } from "@/lib/sb";
import "../care.css";

// 고객 식단 기록 (로그인 없이 개인 링크로) — 직원 앱 해피콜 › 식단 케어로 이어져요.
// 서버: care_me · care_consent · care_meal_add · care_meal_del (080). 사진: care-photos/{토큰}/{날짜}/{id}.jpg
type Meal = { id: string; day: string; meal: string; body: string | null; photo: string | null; at: string; feedback: string | null };
type Health = { day: string; steps: number | null; sleep: number | null; weight: number | null; workout: number | null };
type Note = { kind: "diet" | "ex"; day: string; note: string; staff: string | null };
type Me = { name: string | null; branch: string; today: string; consent: boolean; diet_off: boolean; ex_off: boolean; meals: Meal[]; health: Health[]; notes: Note[] };

const MEALS = ["아침", "점심", "저녁", "간식"] as const;
const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 (${WD[new Date(`${d}T00:00:00Z`).getUTCDay()]})`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
const sleepTxt = (m: number | null) => (m ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : "-");

// 사진 줄이기 (긴 변 1600px, JPEG)
async function shrink(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? f), "image/jpeg", 0.82));
  } catch { return f; }
}
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(16).slice(2)}`);

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    sb.storage.from("care-photos").createSignedUrl(path, 3600).then(({ data }) => { if (on) setUrl(data?.signedUrl ?? null); });
    return () => { on = false; };
  }, [path]);
  return url ? <img className="cr-ph" src={url} alt="식단 사진" /> : <div className="cr-ph ld" />;
}

export default function CarePage() {
  const { token } = useParams<{ token: string }>();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // 끼니 올리기 창
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("care_me", { p_token: token });
    if (error) { setErr(error.message.includes("BAD_LINK") ? "링크가 만료됐어요. 센터에 새 링크를 받아 주세요." : "불러오지 못했어요. 잠시 뒤 다시 열어 주세요."); return; }
    setErr(""); setMe(data as Me);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (me && !day) setDay(me.today); }, [me, day]);
  useEffect(() => { if (!file) return setPrev(null); const u = URL.createObjectURL(file); setPrev(u); return () => URL.revokeObjectURL(u); }, [file]);

  const days = useMemo(() => (me ? [0, -1, -2, -3].map((n) => addDays(me.today, n)) : []), [me]);
  const ofDay = (m: string) => (me?.meals ?? []).filter((x) => x.day === day && x.meal === m);
  const h = me?.health.find((x) => x.day === day) ?? null;

  const consent = async () => {
    setBusy(true);
    const { error } = await sb.rpc("care_consent", { p_token: token, p_method: "web" });
    setBusy(false);
    if (error) return setErr("저장하지 못했어요. 다시 눌러 주세요.");
    load();
  };
  const close = () => { setOpen(null); setBody(""); setFile(null); };
  const save = async () => {
    if (!me || !day || !open) return;
    if (!file && !body.trim()) return setErr("사진이나 메모 중 하나는 넣어 주세요.");
    setBusy(true); setErr("");
    let path: string | null = null;
    if (file) {
      path = `${token}/${day}/${uid()}.jpg`;
      const up = await sb.storage.from("care-photos").upload(path, await shrink(file), { contentType: "image/jpeg", upsert: false });
      if (up.error) { setBusy(false); return setErr("사진을 올리지 못했어요. 메모만 남기거나 다시 시도해 주세요."); }
    }
    const { error } = await sb.rpc("care_meal_add", { p_token: token, p_day: day, p_meal: open, p_body: body, p_photo: path });
    setBusy(false);
    if (error) return setErr(error.message.includes("TOO_MANY") ? "오늘은 더 올릴 수 없어요." : "저장하지 못했어요. 다시 눌러 주세요.");
    close(); load();
  };
  const del = async (m: Meal) => {
    const { error } = await sb.rpc("care_meal_del", { p_token: token, p_id: m.id });
    if (error) return setErr("지우지 못했어요.");
    load();
  };

  if (err && !me) return <main className="cr"><div className="cr-box"><h1>MERA 기록</h1><p className="cr-err">{err}</p></div></main>;
  if (!me || !day) return <main className="cr"><div className="cr-box"><p className="cr-muted">불러오는 중이에요.</p></div></main>;

  if (!me.consent) return (
    <main className="cr">
      <header className="cr-hd"><span className="cr-logo">M</span><b>MERA 기록</b></header>
      <div className="cr-box">
        <h1>{me.name ?? "회원"}님, 반가워요</h1>
        <p className="cr-lead">먹은 음식을 사진이나 메모로 남기면 담당 코치가 보고 관리에 참고해요.</p>
        <ul className="cr-list">
          <li>올린 사진과 메모는 담당 코치와 센터 직원만 봐요.</li>
          <li>사진 원본은 30일 뒤 지워요.</li>
          <li>코치 연락을 원하지 않으면 센터에 말해 주세요. 기록만 남길 수 있어요.</li>
        </ul>
        <label className="cr-chk"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> 위 내용을 읽었고 기록 수집에 동의해요</label>
        {err && <p className="cr-err">{err}</p>}
        <button className="cr-btn p" disabled={!agree || busy} onClick={consent}>동의하고 시작하기</button>
      </div>
    </main>
  );

  return (
    <main className="cr">
      <header className="cr-hd"><span className="cr-logo">M</span><b>MERA 기록</b><span className="cr-sp" /><span className="cr-muted">{me.branch}</span></header>
      <h1 className="cr-h1">{day === me.today ? `${me.name ?? "회원"}님, 오늘 뭐 드셨어요?` : md(day)}</h1>
      <div className="cr-days" role="tablist" aria-label="날짜">
        {days.map((d, i) => (
          <button key={d} role="tab" aria-selected={d === day} className={d === day ? "on" : ""} onClick={() => setDay(d)}>
            {i === 0 ? "오늘" : i === 1 ? "어제" : md(d).replace(/^\d+월 /, "")}
          </button>
        ))}
      </div>
      {err && <p className="cr-err">{err}</p>}

      <section className="cr-meals">
        {MEALS.map((m) => {
          const xs = ofDay(m);
          return (
            <div key={m} className={`cr-meal${xs.length ? " has" : ""}`}>
              <div className="mh"><b>{m}</b>{xs.length > 0 && <span className="ok">기록함</span>}<span className="cr-sp" /><button className="cr-btn sm" onClick={() => { close(); setOpen(m); }}>+ 올리기</button></div>
              {xs.map((x) => (
                <div key={x.id} className="it">
                  {x.photo && <Photo path={x.photo} />}
                  <div className="tx">
                    {x.body && <p>{x.body}</p>}
                    <span className="cr-muted">{hm(x.at)} 올림 · <button className="lnk" onClick={() => del(x)}>지우기</button></span>
                    {x.feedback && <div className="fb"><b>코치</b> {x.feedback}</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </section>

      {me.notes.length > 0 && (
        <section className="cr-card">
          <h2>코치 한마디</h2>
          {me.notes.map((n, i) => <p key={i} className="cr-note"><b>{n.kind === "diet" ? "식단" : "운동"}</b> {n.note}<span className="cr-muted"> · {md(n.day)}</span></p>)}
        </section>
      )}

      <section className="cr-card">
        <h2>걸음 · 수면 · 운동</h2>
        {h ? (
          <div className="cr-hl">
            <div><label>걸음</label><b className="num">{h.steps != null ? h.steps.toLocaleString() : "-"}</b></div>
            <div><label>수면</label><b>{sleepTxt(h.sleep)}</b></div>
            <div><label>운동</label><b>{h.workout ? `${h.workout}분` : "-"}</b></div>
            <div><label>체중</label><b className="num">{h.weight != null ? `${h.weight}kg` : "-"}</b></div>
          </div>
        ) : <p className="cr-muted">MADELINE 앱에서 이 링크를 연결하면 애플 건강 · 삼성 헬스(헬스 커넥트)의 걸음 · 수면이 자동으로 들어와요.</p>}
      </section>
      <p className="cr-foot">홈 화면에 추가하면 앱처럼 바로 열 수 있어요. (공유 버튼 → 홈 화면에 추가)</p>

      {open && (
        <div className="cr-dim" onClick={close}>
          <div className="cr-sheet" role="dialog" aria-label={`${open} 올리기`} onClick={(e) => e.stopPropagation()}>
            <div className="sh"><b>{md(day)} · {open}</b><span className="cr-sp" /><button className="lnk" onClick={close}>닫기</button></div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {prev ? <img className="cr-prev" src={prev} alt="고른 사진" onClick={() => fileRef.current?.click()} />
              : <button className="cr-pick" onClick={() => fileRef.current?.click()}>사진 찍기 · 고르기</button>}
            <textarea className="cr-ta" rows={3} maxLength={500} placeholder="무엇을 얼마나 드셨는지 적어 주세요 (예: 현미밥 반 공기, 닭가슴살)" value={body} onChange={(e) => setBody(e.target.value)} />
            {err && <p className="cr-err">{err}</p>}
            <button className="cr-btn p" disabled={busy} onClick={save}>{busy ? "올리는 중…" : "올리기"}</button>
          </div>
        </div>
      )}
    </main>
  );
}
