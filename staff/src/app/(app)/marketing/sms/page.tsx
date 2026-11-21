"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/me";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, canEdit } from "../ui";
import { sb } from "@/lib/sb";

type MsgStatus = { send_no: boolean; optout_080: string | null; can_send: boolean; targets: number;
  recent: { at: string; test: boolean; count: number; ok: number | null; fail: number | null; status: string; by: string }[] | null };
const nightKST = () => { const h = new Date(Date.now() + 9 * 3600e3).getUTCHours(); return h >= 21 || h < 8; };
async function sendSms(body: Record<string, unknown>) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch("/api/msg/sms", { method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "보내지 못했어요");
  return j as { ok: number; fail: number };
}

/* 시안 U-PC-MKT-4 문자: 광고 문자 쓰기 · 미리보기 · 문구 보기 */
type Tpl = { id: string; title: string; body: string };
type Info_ = { agreed: number; not_agreed: number; can_send: boolean; provider: boolean; templates: Tpl[] | null };
const bytes = (s: string) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);

export default function SmsPage() {
  const me = useMe();
  const { branch, toast } = useMk();
  const { data, err, reload } = useRpc<Info_>("mkt_sms_info", { p_branch: branch });
  const [text, setText] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [edit, setEdit] = useState<Tpl | "new" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [st, setSt] = useState<MsgStatus | null>(null);
  const [keys, setKeys] = useState(false);
  const [testNo, setTestNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const loadSt = () => { sb.rpc("msg_status", { p_branch: branch }).then(({ data }) => setSt((data as MsgStatus) ?? null)); };
  useEffect(() => { loadSt(); fetch("/api/msg/status").then((r) => r.json()).then((j) => setKeys(!!j.sms)).catch(() => setKeys(false)); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = keys && !!st?.send_no && !!st?.optout_080;
  const go = async (test: boolean) => {
    setBusy(true); setSendErr(null);
    try {
      const r = await sendSms({ branch, text, testNo: test ? testNo : null });
      toast(test ? "내 휴대폰으로 보냈어요" : `${r.ok.toLocaleString()}명에게 보냈어요${r.fail ? ` · ${r.fail}명 실패` : ""}`);
      if (!test) setConfirm(false);
      loadSt();
    } catch (e) { setSendErr((e as Error).message); }
    setBusy(false);
  };
  const tpls = data?.templates ?? [];
  useEffect(() => { if (!pick && tpls[0]) { setPick(tpls[0].id); setText(tpls[0].body); } }, [tpls, pick]);
  useEffect(() => { setPick(null); setText(""); }, [branch]);

  const optout = st?.optout_080 ? st.optout_080.replace(/\D/g, "") : "080********";
  const head = `(광고) 메이드라인 ${branch}`;
  const foot = `무료수신거부 ${optout}`;
  const full = `${head}\n${text}\n${foot}`;
  const b = bytes(full);
  const kind = b <= 90 ? "단문 1통" : "장문 1통";

  return (
    <>
      <Head title="문자" meta="광고 문자 · 받는 사람 수 확인 · 문구 관리" period={false} />
      <Info>광고 문자는 수신 동의한 고객에게만 보냅니다. 동의하지 않았거나 동의를 모르는 고객은 대상에서 빠집니다. 모든 문구 아래 (광고)와 수신거부 줄이 붙습니다.</Info>
      {err ? <Blocked err={err} /> : (
        <div className="mk-sms">
          <div className="card">
            <h2 style={{ fontSize: "var(--fs-xl)", margin: "0 0 16px" }}>미리보기</h2>
            <div className="mk-f">
              <div className="l">받는 사람</div>
              <div className="v"><b>{(data?.agreed ?? 0).toLocaleString()}명</b> · 수신 동의 고객만</div>
              <div className="h">수신 동의가 없는 {(data?.not_agreed ?? 0).toLocaleString()}명은 보내지 않습니다.{data && data.agreed === 0 ? " 고객 차트에서 광고 수신 동의를 받으면 여기 숫자가 늘어납니다." : ""}</div>
            </div>
            <div className="mk-f"><div className="l">발신 번호</div><div className="v">센터 대표 번호 · {branch}{st && !st.send_no ? " (아직 설정 전)" : ""}</div></div>
            <div className="mk-f">
              <div className="l">문구</div>
              <textarea className="mk-ta" value={text} onChange={(e) => setText(e.target.value)} placeholder="보낼 문구를 쓰거나 오른쪽 ‘쓰기’를 눌러 주세요" />
            </div>
            <div className="mk-f">
              <div className="l">미리보기</div>
              <div className="mk-prev">{head}{"\n"}{text || "…"}<span className="ad">{foot}</span></div>
            </div>
            <div className="mk-f"><div className="l">길이</div><div className="v">{[...text].length}자 · {b}바이트 · {kind}</div></div>
            <div className="foot">
              <button className="btn" disabled={!text} onClick={async () => { try { await navigator.clipboard.writeText(full); toast("문구를 복사했어요"); } catch { toast("복사하지 못했어요"); } }}>문구 복사</button>
              <button className="btn p" disabled={!text} onClick={() => { setSendErr(null); setConfirm(true); }}>{live ? "보내기" : "발송 확인"}</button>
            </div>
          </div>

          <div className="mk-tpl">
            <h2>문구 보기{canEdit(me) && <button className="btn sm" onClick={() => setEdit("new")}>+ 새 문구</button>}</h2>
            {data && tpls.length === 0 && <div className="mk-empty card">저장한 문구 없음</div>}
            {tpls.map((t) => (
              <div key={t.id} className={`it ${pick === t.id ? "on" : ""}`}>
                <b>{t.title}{canEdit(me) && <button className="btn sm t" onClick={() => setEdit(t)}>고치기</button>}</b>
                <p>{t.body}</p>
                <button className="btn w" onClick={() => { setPick(t.id); setText(t.body); }}>쓰기</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirm && (live ? (
        <Modal title="광고 문자를 보낼까요?" onClose={() => !busy && setConfirm(false)} foot={<>
          <button className="btn" disabled={busy} onClick={() => setConfirm(false)}>닫기</button>
          <button className="btn p" disabled={busy || nightKST() || !st?.can_send || !st?.targets} onClick={() => go(false)}>{busy ? "보내는 중…" : `${(st?.targets ?? 0).toLocaleString()}명에게 보내기`}</button>
        </>}>
          <p className="d">받는 사람 {(st?.targets ?? 0).toLocaleString()}명 (광고 수신 동의 고객만) · {kind}</p>
          <p className="h">보내기 전에 내 휴대폰으로 한 번 받아 보세요. 보낸 문자는 되돌릴 수 없어요.</p>
          <div className="grid"><label htmlFor="tn">내 번호</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="tn" className="inp" inputMode="tel" value={testNo} onChange={(e) => setTestNo(e.target.value)} placeholder="010-0000-0000" style={{ flex: 1, minWidth: 0 }} />
              <button className="btn" disabled={busy || nightKST() || testNo.replace(/\D/g, "").length < 10} onClick={() => go(true)}>테스트</button>
            </div>
          </div>
          {!st?.can_send && <p className="err">문자 보내기 권한이 없어요. 대표관리자에게 요청해 주세요.</p>}
          {nightKST() && <p className="err">지금은 밤 시간(21시~8시)이라 광고 문자를 보낼 수 없어요.</p>}
          {sendErr && <p className="err">{sendErr}</p>}
        </Modal>
      ) : (
        <Modal title="문자를 보낼까요?" onClose={() => setConfirm(false)} foot={<>
          <button className="btn" onClick={() => setConfirm(false)}>닫기</button>
          <button className="btn p" onClick={async () => { try { await navigator.clipboard.writeText(full); toast("문구를 복사했어요"); } catch { /* */ } setConfirm(false); }}>문구 복사</button>
        </>}>
          <p className="d">받는 사람 {(data?.agreed ?? 0).toLocaleString()}명 · {kind}</p>
          <p className="h">{!keys ? "문자 업체(NHN Cloud) 키가 아직 설정되지 않아" : !st ? "DB 설정(046)이 아직 안 돼서" : !st.send_no ? "발신번호가 아직 설정되지 않아" : "080 수신거부 번호가 아직 설정되지 않아"} 이 화면에서 바로 보낼 수는 없어요. 문구를 복사해 쓰던 문자 프로그램에 붙여 주세요.</p>
          {nightKST() ? <p className="err">지금은 밤 시간(21시~8시)이라 광고 문자를 보낼 수 없습니다.</p> : null}
        </Modal>
      ))}
      {st?.recent && st.recent.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: "var(--fs-lg)", margin: "0 0 8px" }}>최근 보낸 문자</h2>
          {st.recent.map((x, i) => (
            <div key={i} className="mk-f"><div className="l">{new Date(x.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              <div className="v">{x.test ? "테스트 · " : ""}{x.status} · {(x.ok ?? 0).toLocaleString()}/{x.count.toLocaleString()}명{x.fail ? ` · 실패 ${x.fail}` : ""} · {x.by}</div></div>
          ))}
        </div>
      )}
      {edit && <TplModal branch={branch} tpl={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); toast("문구를 저장했어요"); reload(); }} />}
    </>
  );
}

function TplModal({ branch, tpl, onClose, onDone }: { branch: string; tpl: Tpl | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(tpl?.title ?? "");
  const [body, setBody] = useState(tpl?.body ?? "");
  const [e, setE] = useState<string | null>(null);
  return (
    <Modal title={tpl ? "문구 고치기" : "새 문구"} onClose={onClose} foot={<>
      {tpl && <button className="btn danger" style={{ marginRight: "auto" }} onClick={async () => { try { await rpc("mkt_sms_template_del", { p_id: tpl.id }); onDone(); } catch (x) { setE((x as Error).message); } }}>지우기</button>}
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={!title.trim() || !body.trim()} onClick={async () => {
        try { await rpc("mkt_sms_template_save", { p_branch: branch, p_id: tpl?.id ?? null, p_title: title, p_body: body }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>저장</button>
    </>}>
      <div className="grid"><label htmlFor="tt">이름</label><input id="tt" className="inp" value={title} onChange={(x) => setTitle(x.target.value)} placeholder="예: 상담 예약 안내" /></div>
      <textarea className="mk-ta" value={body} onChange={(x) => setBody(x.target.value)} placeholder="문구" />
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
