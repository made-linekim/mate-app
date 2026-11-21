"use client";
import { useState } from "react";
import { useMe } from "@/lib/me";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, when, canEdit } from "../ui";

/* 시안 U-PC-MKT-3 제안: 이번 주 할 일 카드 최대 3개 · 적용으로 표시 / 넘기기 */
type Tip = { key: string; tag: string; title: string; body: string; meta: string };
type Tips = { week: string; items: Tip[]; done: { key: string; status: string; reason: string | null; by: string; at: string }[] | null };
const REASONS = ["지금은 손대지 않음", "이미 하고 있음", "숫자를 다시 볼 필요가 있음"];

export default function TipsPage() {
  const me = useMe();
  const { branch, toast } = useMk();
  const { data, err, reload } = useRpc<Tips>("mkt_tips_list", { p_branch: branch });
  const [skip, setSkip] = useState<Tip | null>(null);
  const edit = canEdit(me);

  async function decide(t: Tip, status: "적용" | "넘김", reason?: string) {
    try { await rpc("mkt_tip_decide", { p_branch: branch, p_key: t.key, p_status: status, p_reason: reason ?? null }); toast(status === "적용" ? "적용으로 표시했어요" : "넘겼어요"); reload(); }
    catch (e) { toast((e as Error).message); }
  }

  return (
    <>
      <Head title="제안" meta="최근 4주 기록에서 최대 3개 · 적용 전후" period={false} />
      <Info>이 화면은 내부 할 일 카드입니다. 고객 연락은 오늘 할 일에서 합니다. 숫자가 기준보다 나빠졌을 때만 카드가 생깁니다.</Info>
      {err ? <Blocked err={err} /> : (
        <>
          <div className="mk-tips">
            {!data && <div className="mk-empty card">불러오는 중…</div>}
            {data && data.items.length === 0 && (
              <div className="mk-empty card" style={{ gridColumn: "1 / -1" }}>이번 주 제안 없음 — 광고·발행량·키워드가 모두 기준 안에 있습니다</div>
            )}
            {data?.items.map((t) => (
              <div className="mk-tip" key={t.key}>
                <span className="mk-tg">{t.tag}</span>
                <h3>{t.title}</h3>
                <p>{t.body}</p>
                {t.meta && <span className="m">{t.meta}</span>}
                {edit && (
                  <div className="b">
                    <button className="btn" onClick={() => decide(t, "적용")}>적용으로 표시</button>
                    <button className="btn" onClick={() => setSkip(t)}>넘기기</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {(data?.done ?? []).length > 0 && (
            <div className="mk-done">
              <div className="mk-sec"><h2>이번 주 처리한 제안</h2></div>
              {data!.done!.map((d) => (
                <div className="row" key={d.key}>
                  <span className={`badge ${d.status === "적용" ? "ok" : ""}`}>{d.status}</span>
                  <b>{d.reason ?? (d.status === "적용" ? "적용함" : "이유 없음")}</b>
                  <span>{d.by} · {when(d.at)}</span>
                  {edit && <button className="btn sm t" style={{ marginLeft: "auto" }} onClick={async () => { try { await rpc("mkt_tip_undo", { p_branch: branch, p_key: d.key }); reload(); } catch (e) { toast((e as Error).message); } }}>되돌리기</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {skip && <SkipModal tip={skip} onClose={() => setSkip(null)} onDone={(r) => { decide(skip, "넘김", r); setSkip(null); }} />}
    </>
  );
}

function SkipModal({ tip, onClose, onDone }: { tip: Tip; onClose: () => void; onDone: (r: string | undefined) => void }) {
  const [r, setR] = useState<string | undefined>();
  return (
    <Modal title="이 제안을 넘길까요?" onClose={onClose} foot={<><button className="btn" onClick={onClose}>취소</button><button className="btn p" onClick={() => onDone(r)}>넘기기</button></>}>
      <p className="d">{tip.title}</p>
      <p className="h">이유 · 선택 · 비워 두어도 됩니다</p>
      <div className="chips">
        {REASONS.map((x) => <button key={x} className={`chip ${r === x ? "on" : ""}`} onClick={() => setR(r === x ? undefined : x)}>{x}</button>)}
      </div>
      <p className="h">{r ? `‘${r}’로 남깁니다.` : "이유는 고르지 않은 상태입니다. 비워 두고 넘겨도 됩니다."}</p>
    </Modal>
  );
}
