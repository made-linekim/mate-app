"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/me";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, canEdit } from "../ui";

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
  const tpls = data?.templates ?? [];
  useEffect(() => { if (!pick && tpls[0]) { setPick(tpls[0].id); setText(tpls[0].body); } }, [tpls, pick]);
  useEffect(() => { setPick(null); setText(""); }, [branch]);

  const foot = `(광고) 메이드라인 ${branch} · 무료수신거부 080-****-****`;
  const full = `(광고) ${text}\n${foot}`;
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
            <div className="mk-f"><div className="l">발신 번호</div><div className="v">센터 대표 번호 · {branch}</div></div>
            <div className="mk-f">
              <div className="l">문구</div>
              <textarea className="mk-ta" value={text} onChange={(e) => setText(e.target.value)} placeholder="보낼 문구를 쓰거나 오른쪽 ‘쓰기’를 눌러 주세요" />
            </div>
            <div className="mk-f">
              <div className="l">미리보기</div>
              <div className="mk-prev">(광고) {text || "…"}<span className="ad">{foot}</span></div>
            </div>
            <div className="mk-f"><div className="l">길이</div><div className="v">{[...text].length}자 · {b}바이트 · {kind}</div></div>
            <div className="foot">
              <button className="btn" disabled={!text} onClick={async () => { try { await navigator.clipboard.writeText(full); toast("문구를 복사했어요"); } catch { toast("복사하지 못했어요"); } }}>문구 복사</button>
              <button className="btn p" disabled={!text} onClick={() => setConfirm(true)}>발송 확인</button>
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

      {confirm && (
        <Modal title="문자를 보낼까요?" onClose={() => setConfirm(false)} foot={<>
          <button className="btn" onClick={() => setConfirm(false)}>닫기</button>
          <button className="btn p" onClick={async () => { try { await navigator.clipboard.writeText(full); toast("문구를 복사했어요"); } catch { /* */ } setConfirm(false); }}>문구 복사</button>
        </>}>
          <p className="d">받는 사람 {(data?.agreed ?? 0).toLocaleString()}명 · {kind}</p>
          <p className="h">문자 업체가 아직 연결되지 않아 이 화면에서 바로 보낼 수는 없습니다. 문구를 복사해 쓰던 문자 프로그램에 붙여 주세요. 업체를 연결하면 이 버튼으로 바로 보내집니다.</p>
          {new Date(Date.now() + 9 * 3600e3).getUTCHours() >= 21 || new Date(Date.now() + 9 * 3600e3).getUTCHours() < 8
            ? <p className="err">지금은 밤 시간(21시~8시)이라 광고 문자를 보낼 수 없습니다.</p> : null}
        </Modal>
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
