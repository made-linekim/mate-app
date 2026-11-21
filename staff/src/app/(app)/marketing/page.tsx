"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, useMk, useRpc, rpc } from "./ui";

/* 시안 v3b U-PC-MKT-0 이달의 마케팅 추천: 카드 누르기 → 받는 사람 칩 → 보내기 (타이핑 없이 3번) */
type Card = { id: string; cat: string; title: string; body: string; hq: boolean; sent: number | null; resp_rate: number | null; reply_rate: number | null; book_rate: number | null };
type Data = { month: string | null; cards: Card[]; audience: Record<string, number | null>; can_send: boolean };

const CATS = ["전체", "월", "재등록", "휴면", "안부", "생일", "신규"];
const AUD = [
  { k: "all", l: "수신 동의 전체" }, { k: "low2", l: "잔여 2회 이하" }, { k: "expire", l: "당월 만료 회원권" },
  { k: "dormant30", l: "미방문 30일 이상" }, { k: "lounge", l: "라운지 3일 미참여" },
];
const AUD_HELP: Record<string, string> = { lounge: "고객앱 라운지 기록이 생기면 고를 수 있어요" };
const bytes = (s: string) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
const kstHour = () => new Date(Date.now() + 9 * 3600e3).getUTCHours();
const night = () => { const h = kstHour(); return h >= 21 || h < 8; };

// 서버 준비(048 SQL) 전에도 대표님 확정 11월 카드는 보여 줘요. 숫자(응답률)는 비워 둠.
const NOV: Card[] = [
  ["재등록", "재등록 혜택", "안녕하세요, 메이드라인 {지점}입니다. 회원권이 곧 끝나는 분께 이번 달 재등록 혜택을 먼저 안내드려요. 자세한 내용은 센터로 문의해 주세요.", false],
  ["월", "11월 프로모션", "11월 한 달 동안 첫 체험 관리를 3만원대로 받아보실 수 있어요. 가족·지인과 함께 오시면 더 좋아요. 예약은 고객앱이나 전화로 해 주세요.", true],
  ["휴면", "다시 만나요 (휴면)", "한동안 못 뵈었네요. 이번 주 상담 예약이 열려 있어요. 지금 몸 상태부터 편하게 이야기 나눠요. 일정은 고객앱에서 확인해 주세요.", false],
  ["안부", "겨울 관리 안부", "날이 많이 추워졌어요. 따뜻한 물 자주 드시고, 관리 일정 잊지 마세요. 이번 주 빈 시간이 있어 예약을 도와드릴 수 있어요.", true],
  ["생일", "생일 축하 쿠폰", "생일 축하드려요! 이번 달 안에 오시면 작은 선물을 준비해 둘게요. 예약은 고객앱이나 전화로 해 주세요.", false],
  ["신규", "첫 방문 감사", "처음 와 주셔서 감사해요. 다음 관리 전 궁금한 점은 언제든 답장 주세요. 담당 선생님이 확인하고 연락드릴게요.", false],
].map(([cat, title, body, hq], i) => ({ id: `nov-${i}`, cat: cat as string, title: title as string, body: body as string, hq: hq as boolean, sent: null, resp_rate: null, reply_rate: null, book_rate: null }));

export default function Picks() {
  const { branch, toast } = useMk();
  const { data, err } = useRpc<Data>("mkt_sms_picks_get", { p_branch: branch });
  const info = useRpc<{ agreed: number; remain?: number | null }>("mkt_sms_info", { p_branch: branch });
  const ready = !!data && !err && Array.isArray(data.cards);
  const month = data?.month ? +data.month.slice(5, 7) : +new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 7);
  const cards: Card[] = useMemo(() => (ready ? data!.cards : NOV).map((c) => ({ ...c, body: c.body.replaceAll("{지점}", branch) })), [ready, data, branch]);
  const aud: Record<string, number | null> = ready ? data!.audience : { all: info.data?.agreed ?? null };
  // 1위 = 서버가 점수(0.5·응답률 + 0.3·예약 + 0.2·답장) 순으로 준 카드 중 첫 지점 추천. 보낸 기록 100건 미만은 제외
  const top = useMemo(() => cards.find((c) => !c.hq && c.resp_rate != null && (c.sent ?? 0) >= 100)?.id ?? null, [cards]);

  const [cat, setCat] = useState("전체");
  const [pick, setPick] = useState<Card | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<null | "now" | "later">(null);
  const [busy, setBusy] = useState(false);

  const shown = cards.filter((c) => cat === "전체" || c.cat === cat);
  const n = to ? aud[to] ?? 0 : 0;
  const foot = `(광고) 메이드라인 ${branch} · 무료수신거부 080-****-****`;
  const full = `(광고) ${text}\n${foot}`;
  const len = [...text].length;
  const kind = bytes(full) <= 90 ? "SMS" : "LMS";
  const ok = !!pick && !!to && n > 0 && !!text.trim();
  const step = !pick ? 1 : !to ? 2 : 3;
  const router = useRouter();

  const choose = (c: Card) => { setPick(c); setText(c.body); setEditing(false); };
  const send = async (later: boolean) => {
    setBusy(true);
    try {
      if (ready) {
        const at = later ? nextMorning() : null;
        const res = await rpc<{ id: string }>("mkt_sms_pick_send", { p_branch: branch, p_pick: pick!.id, p_audience: to, p_body: text, p_at: at });
        if (later && res?.id) { try { await navigator.clipboard.writeText(full); } catch { /* */ } router.push(`/marketing/sms?r=${res.id}`); return; }
      }
      try { await navigator.clipboard.writeText(full); } catch { /* 복사 못 해도 기록은 남김 */ }
      toast(later ? "내일 아침 9시 발송으로 남겼어요. 문구를 복사했어요" : "보낸 기록을 남기고 문구를 복사했어요");
      setAsk(null); setPick(null); setTo(null); setText("");
    } catch (e) { toast((e as Error).message === "NEED_SQL" ? "서버 준비(048 SQL) 후에 보낼 수 있어요" : (e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="mx-rec">
      <div className="steps">
        {["추천 카드 누르기", "받는 사람 칩 고르기", "보내기"].map((l, i) => (
          <Fragment key={l}>
            {i > 0 && <span className="arrow"><Chev /></span>}
            <span className={`st ${i + 1 < step ? "done" : ""}`}><b>{i + 1}</b>{l}</span>
          </Fragment>
        ))}
        <span className="cap" style={{ marginLeft: 8 }}>타이핑 없이 3번 클릭</span>
      </div>

      <div className="rw">
        <section className="rc">
          <div className="hd">
            <Spark /><h2>이달의 마케팅 추천</h2>
            <span className="bdg">{month}월 · 매달 1일 새로 고침</span>
            {!ready && <span className="bdg ns">발송 기록 없음</span>}
            <div className="r"><span className="cap">{cards.length}장 · 본사 고정 {cards.filter((c) => c.hq).length} + 지점 추천 {cards.filter((c) => !c.hq).length} · 응답(7일 내 답장·예약·방문) 순</span></div>
          </div>
          <div className="fl">
            {CATS.map((c) => <button key={c} className={`fchip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c === "월" ? `${month}월` : c}</button>)}
          </div>
          <div className="rg">
            {shown.map((c) => (
              <button key={c.id} className={`rt ${pick?.id === c.id ? "on" : ""}`} onClick={() => choose(c)}>
                <span className="tt">
                  <span className="bdg">{c.cat === "월" ? `${month}월` : c.cat}</span>
                  <b>{c.title}</b>
                  {top === c.id && <span className="bdg red rk"><Star /> 1위</span>}
                  <span className={`bdg src ${c.hq ? "hq" : ""}`}>{c.hq ? "본사 고정" : "지점 추천"}</span>
                </span>
                <p>{c.body}</p>
                <span className="ft">
                  {c.resp_rate != null ? <>
                    <span className="mt">
                      <span className="bdg grn">응답률 {c.resp_rate}%</span>
                      <span className="bdg">{c.reply_rate != null ? `답장 ${c.reply_rate}%` : `예약 ${c.book_rate ?? 0}%`}</span>
                    </span>
                    <span className="cap">{(c.sent ?? 0).toLocaleString()}건 기준{(c.sent ?? 0) < 100 ? " · 표본 적음" : ""}</span>
                  </> : <span className="cap">아직 보낸 기록 없음</span>}
                </span>
              </button>
            ))}
          </div>
        </section>

        <aside className="rc pn">
          <div className="hd"><Plane /><h2>보내기</h2>{ok && <span className="bdg grn"><Check /> 보낼 준비 완료</span>}</div>
          <div className="sec">
            <div className="lb">받는 사람 · 한 번 누르면 바로 적용</div>
            <div className="chips">
              {AUD.map((a) => {
                const v = aud[a.k];
                const off = v == null;
                return (
                  <button key={a.k} className={`fchip ${to === a.k ? "on" : ""}`} disabled={off} title={AUD_HELP[a.k] ?? ""} onClick={() => setTo(a.k)}>
                    {a.l}<span className="n">{off ? "—" : v.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="sec">
            <div className="lb">문구{pick && <> · <span className="bdg">{pick.title}</span></>}
              {pick && <button className="link" style={{ marginLeft: "auto" }} onClick={() => setEditing(!editing)}><Pen /> {editing ? "다 고침" : "고치기"}</button>}
            </div>
            {!pick ? (
              <div className="empty"><Spark /><div>왼쪽 추천 카드를 누르면<br />문구가 바로 채워져요</div></div>
            ) : (
              <div className="msg">
                {editing ? <textarea value={text} onChange={(e) => setText(e.target.value)} /> : text}
                <div className="ad">{foot}</div>
              </div>
            )}
          </div>
          <div className="sec">
            <div className="kv">받는 사람{to ? <b>{AUD.find((a) => a.k === to)!.l} · 수신 동의 {n.toLocaleString()}명</b> : <b className="muted">칩을 골라 주세요</b>}</div>
            {pick && <div className="kv">길이 · 차감<b>{len}자 · {kind} {n.toLocaleString()}건</b></div>}
            <div className="kv">남은 문자<b>{info.data?.remain != null ? `${info.data.remain.toLocaleString()}건` : "업체 연결 후"}</b></div>
          </div>
          <div className="pf">
            <button className="btn" disabled={!ok} onClick={() => setAsk("later")}><Clock /> 예약 발송</button>
            <button className={`btn ${ok ? "p" : "off"}`} disabled={!ok} onClick={() => setAsk(night() ? "later" : "now")}><Plane /> {ok ? `${n.toLocaleString()}명에게 보내기` : "보내기"}</button>
          </div>
        </aside>
      </div>

      {ask && (
        <Modal title={ask === "now" ? `${n.toLocaleString()}명에게 보낼까요?` : "예약 발송할까요?"} onClose={() => setAsk(null)} foot={<>
          <button className="btn" onClick={() => setAsk(null)}>닫기</button>
          <button className="btn p" disabled={busy} onClick={() => send(ask === "later")}>{ask === "now" ? "보내기" : "내일 9시로 예약"}</button>
        </>}>
          <p>{AUD.find((a) => a.k === to)?.l} · 수신 동의 {n.toLocaleString()}명 · {kind}</p>
          {ask === "later" && night() && <p className="err">지금은 밤 시간(21시~8시)이라 바로 보낼 수 없어요. 내일 아침 9시로 예약만 돼요.</p>}
          <p className="help">문자 업체 연결 전이라 문구가 복사돼요. 쓰던 문자 프로그램에 붙여 보내 주세요. 보낸 기록은 남아서 7일 안의 예약·방문으로 응답률을 셉니다.</p>
        </Modal>
      )}
    </div>
  );
}

function nextMorning() {
  const k = new Date(Date.now() + 9 * 3600e3);
  if (k.getUTCHours() >= 9) k.setUTCDate(k.getUTCDate() + 1);
  k.setUTCHours(9, 0, 0, 0);
  return new Date(k.getTime() - 9 * 3600e3).toISOString();
}

const I = (d: string, w = 16) => <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const Spark = () => I("M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8");
const Plane = () => I("M21 3L3 10.5l7 2.5 2.5 7z M10 13l5-5");
const Clock = () => I("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2");
const Pen = () => I("M4 20h4L19 9l-4-4L4 16z", 16);
const Star = () => I("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", 14);
const Chev = () => I("M9 6l6 6-6 6", 16);
const Check = () => I("M5 12l5 5 9-10", 12);
