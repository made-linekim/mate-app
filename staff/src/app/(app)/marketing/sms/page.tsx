"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TIER_LABEL, sb } from "@/lib/sb";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, when } from "../ui";
import { type Rsv, atText, kst } from "../reserved";

/* 시안 v3b U-PC-MKT-4 문자 · 문자확인 · 문자확인_야간 · 4-DONE 예약됨 · 예약취소
   실제 발송(문자 업체 연결)은 다른 작업 — 이 화면은 문구 고르기 · 확인 · 기록만 해요. */
type Tpl = { id: string; title: string; body: string };
type Info_ = { agreed: number; not_agreed: number; can_send: boolean; provider: boolean; templates: Tpl[] | null; remain?: number | null; send_no?: string | null };
const bytes = (s: string) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
const kstNow = () => kst(new Date().toISOString());
const isNight = () => { const h = +kstNow().slice(11, 13); return h >= 21 || h < 8; };
// 실제 발송: 서버 /api/msg/sms (알리고 또는 NHN). 키·080·권한이 다 있어야 열려요.
type MsgStatus = { send_no: boolean; optout_080: string | null; can_send: boolean; targets: number };
async function sendSms(body: Record<string, unknown>) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch("/api/msg/sms", { method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "보내지 못했어요");
  return j as { ok: number; fail: number };
}

function next8() {
  const k = new Date(Date.now() + 9 * 3600e3);
  if (k.getUTCHours() >= 8) k.setUTCDate(k.getUTCDate() + 1);
  k.setUTCHours(8, 0, 0, 0);
  return new Date(k.getTime() - 9 * 3600e3).toISOString();
}

export default function SmsPage() {
  return <Suspense fallback={null}><Sms /></Suspense>;
}

function Sms() {
  const r = useSearchParams().get("r");
  return r ? <Done id={r} /> : <Write />;
}

function Write() {
  const { branch, toast } = useMk();
  const router = useRouter();
  const { data, err } = useRpc<Info_>("mkt_sms_info", { p_branch: branch });
  const [text, setText] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [check, setCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<MsgStatus | null>(null);
  const [keys, setKeys] = useState(false);
  const [testNo, setTestNo] = useState("");
  useEffect(() => {
    sb.rpc("msg_status", { p_branch: branch }).then(({ data: d }) => setSt((d as MsgStatus) ?? null));
    fetch("/api/msg/status").then((x) => x.json()).then((j) => setKeys(!!j.sms)).catch(() => setKeys(false));
  }, [branch]);
  const live = keys && !!st?.send_no && !!st?.optout_080 && !!st?.can_send;
  const tpls = data?.templates ?? [];
  useEffect(() => { if (!pick && tpls[0]) { setPick(tpls[0].id); setText(tpls[0].body); } }, [tpls, pick]);
  useEffect(() => { setPick(null); setText(""); setCheck(false); }, [branch]);

  const n = data?.agreed ?? 0;
  const no = data?.not_agreed ?? 0;
  const optout = st?.optout_080 ? st.optout_080.replace(/\D/g, "") : "080-****-****";
  const foot = `(광고) 메이드라인 ${branch} · 무료수신거부 ${optout}`;
  const full = `(광고) ${text}\n${foot}`;
  const night = isNight();
  const copy = async () => { try { await navigator.clipboard.writeText(full); return true; } catch { return false; } };

  const send = async () => {
    setBusy(true);
    try {
      if (night) {
        // 밤에는 내일 08:00 예약으로 기록 (발송 자체는 문자 업체 연결 뒤)
        const res = await rpc<{ id: string }>("mkt_sms_pick_send", { p_branch: branch, p_pick: null, p_audience: "all", p_body: text, p_at: next8() });
        await copy();
        router.push(`/marketing/sms?r=${res.id}`);
      } else if (live) {
        const res = await sendSms({ branch, text });
        toast(`${res.ok.toLocaleString()}명에게 보냈어요${res.fail ? ` · ${res.fail}명 실패` : ""}`);
        setCheck(false);
      } else {
        const ok = await copy();
        toast(ok ? "문자 업체 연결 전이라 문구를 복사했어요. 쓰던 문자 프로그램에 붙여 보내 주세요" : "복사하지 못했어요");
        setCheck(false);
      }
    } catch (e) { toast((e as Error).message === "NEED_SQL" ? "서버 준비(048 SQL) 후에 예약할 수 있어요" : (e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="mx-sms">
      <Head title="문자" meta="일괄 문자 · 설정 › 문자(자동 발송)와는 다른 화면입니다" period={false} />
      <Info>광고 문자는 수신 동의한 고객에게만 보냅니다. 동의하지 않은 {no.toLocaleString()}명은 대상에서 빠집니다. 모든 문구 아래 (광고)와 수신거부 줄이 붙습니다.</Info>
      <div className="body">
        {err ? <Blocked err={err} /> : (
          <div className="split">
            <div className={`preview ${check ? "ck" : "w"}`}>
              <h2>{check ? "발송 확인" : "미리보기"}</h2>
              <div className="field"><label>받는 사람</label>
                <div>{n.toLocaleString()}명 · 수신 동의 고객만</div>
                <div className="sub">수신 동의 없는 {no.toLocaleString()}명은 보내지 않습니다.</div>
              </div>
              <div className="field"><label>발신 번호</label><div>{data?.send_no || "센터 대표 번호"} · {branch}</div></div>
              <div className="field"><label htmlFor="sms-ta">문구</label>
                <textarea id="sms-ta" className="ta" value={text} readOnly={check} onChange={(e) => setText(e.target.value)} placeholder="보낼 문구를 쓰거나 오른쪽 문구에서 ‘쓰기’를 눌러 주세요" />
              </div>
              <div className="field"><label>미리보기</label>
                <div className="pvbox">{text || "…"}<div className="fix">{foot}</div></div>
              </div>
              <div className="field"><label>길이</label><div>{[...text].length}자 · {bytes(text)}바이트 · 전송 1통</div></div>
              <div className="field"><label>잔여 문자</label><div>{data?.remain != null ? `${data.remain.toLocaleString()}건` : "업체 연결 후 보여요"} · 차감 {n.toLocaleString()}건</div></div>
              {check && <>
                <div className="note mx-in"><InfoI /><span>받는 {n.toLocaleString()}명은 모두 수신 동의한 고객입니다. 동의하지 않은 {no.toLocaleString()}명은 이 목록에 넣지 않았습니다.</span></div>
                <div className="quiet">광고 문자는 21:00~08:00에 보낼 수 없어요.</div>
                {live && !night && (
                  <div className="field"><label htmlFor="sms-test">내 번호로 먼저</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input id="sms-test" className="inp" inputMode="tel" value={testNo} onChange={(e) => setTestNo(e.target.value)} placeholder="010-0000-0000" style={{ flex: 1, minWidth: 0 }} />
                      <button className="btn" disabled={busy || testNo.replace(/\D/g, "").length < 10} onClick={async () => {
                        setBusy(true);
                        try { await sendSms({ branch, text, testNo }); toast("내 휴대폰으로 보냈어요"); } catch (e) { toast((e as Error).message); }
                        setBusy(false);
                      }}>테스트</button>
                    </div>
                  </div>
                )}
                {!live && <div className="quiet">문자 업체 연결이 끝나기 전이라 ‘발송’을 누르면 문구만 복사돼요.</div>}
                {night && <div className="quiet">지금은 {kstNow().slice(11, 16)}입니다. 내일 08:00 예약으로 보내집니다.</div>}
              </>}
              <div className="pf">
                {check && <button className="btn" onClick={() => setCheck(false)}>돌아가기</button>}
                <span className="sp" />
                {check
                  ? <button className="btn p" disabled={busy || !text.trim() || n === 0} onClick={send}>{night ? "예약 발송" : "발송"}</button>
                  : <button className="btn p" disabled={!text.trim()} onClick={() => setCheck(true)}>발송 확인</button>}
              </div>
            </div>
            <div>
              <div className="sech"><h2>문구 보기</h2></div>
              {data && tpls.length === 0 ? <div className="mx-empty">저장한 문구가 없어요</div> : (
                <div className="tgrid">
                  {tpls.map((t) => (
                    <div key={t.id} className={`tcard ${pick === t.id ? "on" : ""}`}>
                      <div className="ttl">{t.title}</div>
                      <p>{t.body}</p>
                      <button className="btn sm" onClick={() => { setPick(t.id); setText(t.body); setCheck(false); }}>쓰기</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* 시안 U-PC-MKT-4-DONE 발송 예약됨 + 예약 취소 확인 */
function Done({ id }: { id: string }) {
  const { branch, toast } = useMk();
  const router = useRouter();
  const { data, err, reload } = useRpc<Rsv[]>("mkt_sms_reserved_list", { p_branch: branch });
  const info = useRpc<Info_>("mkt_sms_info", { p_branch: branch });
  const [ask, setAsk] = useState(false);
  const r = data?.find((x) => x.id === id);
  const back = () => router.push("/marketing/sms");
  const cancel = async () => {
    try { await rpc("mkt_sms_reserved_cancel", { p_id: id }); setAsk(false); toast("예약을 취소했어요"); reload(); }
    catch (e) { toast((e as Error).message === "NEED_SQL" ? "062 SQL 실행 후에 취소할 수 있어요" : (e as Error).message); setAsk(false); }
  };
  const remain = info.data?.remain;
  return (
    <div className="mx-done">
      <div className="m24">
        <div className="pageh"><b className="t">문자</b><span className="badge staff">직원만</span><span className="sub">일괄 문자 · {branch}</span><span className="sp" /></div>
        <div className="body">
          {err ? <Blocked err={err === "NEED_SQL" ? "예약 문자함은 062 SQL을 실행하면 보여요." : err} /> : !data ? null : !r ? (
            <div className="preview" style={{ maxWidth: 640 }}><h2>예약을 찾지 못했어요</h2><p className="help">이미 보냈거나 지난 예약이에요.</p><div className="pf"><button className="btn p" onClick={back}>문자 탭으로</button></div></div>
          ) : (
            <div className="preview" style={{ maxWidth: 640 }}>
              <h2>{r.canceled_at ? "예약 취소됨" : "발송 예약됨"}</h2>
              <div className="done-k">
                <div className="kpi s"><b>{r.count.toLocaleString()}명</b><label>보낸 건수</label></div>
                <div className="kpi s"><b>{r.count.toLocaleString()}건</b><label>차감{remain != null ? ` · 잔여 ${remain.toLocaleString()}건` : ""}</label></div>
                <div className="kpi s"><b className="m">{atText(r.at)}</b><label>예약 발송 시각</label></div>
              </div>
              <div className="field"><label>문구</label>
                <div className="pvbox">{r.body}<div className="fix">(광고) 메이드라인 {r.branch} · 무료수신거부 080-****-****</div></div>
              </div>
              <div className="help">{r.by ?? "—"}{r.by_tier ? ` ${TIER_LABEL[r.by_tier]}` : ""} · {when(r.made_at)} · {r.count.toLocaleString()}명 발송을 {atText(r.at).replace(/ \(.\)/, "")}로 예약했어요.</div>
              {r.canceled_at && <div className="help">{r.canceled_by ?? "—"} · {when(r.canceled_at)} · 예약을 취소했어요.</div>}
              {!info.data?.provider && !r.canceled_at && <div className="help">문자 업체 연결 전이라 예약 시각에 자동으로 나가지 않아요. 복사한 문구로 보내 주세요.</div>}
              <div className="pf">
                <button className="btn" onClick={back}>문자 탭으로</button>
                {r.can_cancel && <button className={`btn ${ask ? "" : "p"}`} onClick={() => setAsk(true)}>예약 취소</button>}
              </div>
            </div>
          )}
        </div>
      </div>
      {ask && (
        <Modal title="예약을 취소할까요?" onClose={() => setAsk(false)} foot={<>
          <button className="btn" onClick={() => setAsk(false)}>닫기</button>
          <button className="btn p" onClick={cancel}>예약 취소</button>
        </>}>
          <p>문자는 보내지 않아요.</p>
          <p className="quiet">취소한 시각과 누가 취소했는지는 기록에 남아요.</p>
        </Modal>
      )}
    </div>
  );
}

const InfoI = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>;
