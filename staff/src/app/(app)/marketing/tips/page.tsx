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
    <div className="mx-tips">
      <Head title="제안" meta="최근 4주 기록에서 최대 3개 · 적용 전후" period={false} />
      <Info>이 화면은 내부 할 일 카드입니다. 해피콜이나 목록 자동화는 마케팅에 두지 않습니다. 고객 연락은 오늘 할 일에서 합니다.</Info>
      <div className="body">
        {err ? <Blocked err={err} /> : (<>
          {!data && <div className="mx-empty card">불러오는 중…</div>}
          {data && data.items.length === 0 && <div className="mx-empty card">이번 주 제안 없음. 광고·발행량·키워드가 모두 기준 안에 있습니다</div>}
          {!!data?.items.length && (
            <div className="cards">
              {data.items.map((t) => (
                <div className="card" key={t.key}>
                  <div><span className="badge line">{t.tag}</span></div>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                  {t.meta && <div className="lab">{t.meta}</div>}
                  {edit && <div className="acts"><button className="btn sm" onClick={() => decide(t, "적용")}>적용으로 표시</button><button className="btn sm" onClick={() => setSkip(t)}>넘기기</button></div>}
                </div>
              ))}
            </div>
          )}
          {(data?.done ?? []).length > 0 && (
            <div className="sec">
              <div className="sech"><h2>이번 주 처리한 제안</h2></div>
              <div className="wrap mb-scroll"><table className="tbl">
                <thead><tr><th>처리</th><th>이유</th><th>누가 · 언제</th><th /></tr></thead>
                <tbody>
                  {data!.done!.map((d) => (
                    <tr key={d.key}>
                      <td data-label="처리"><span className={`badge ${d.status === "적용" ? "ok" : ""}`}>{d.status}</span></td>
                      <td data-label="이유">{d.reason ?? (d.status === "적용" ? "적용함" : "이유 없음")}</td>
                      <td data-label="누가 · 언제">{d.by} · {when(d.at)}</td>
                      <td className="num">{edit && <button className="btn sm" onClick={async () => { try { await rpc("mkt_tip_undo", { p_branch: branch, p_key: d.key }); reload(); } catch (e) { toast((e as Error).message); } }}>되돌리기</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>)}
      </div>
      {skip && <SkipModal tip={skip} onClose={() => setSkip(null)} onDone={(r) => { decide(skip, "넘김", r); setSkip(null); }} />}
    </div>
  );
}

function SkipModal({ tip, onClose, onDone }: { tip: Tip; onClose: () => void; onDone: (r: string | undefined) => void }) {
  const [r, setR] = useState<string | undefined>();
  return (
    <Modal title="이 제안을 넘길까요?" onClose={onClose} foot={<><button className="btn" onClick={onClose}>취소</button><button className="btn p" onClick={() => onDone(r)}>넘기기</button></>}>
      <p>{tip.title}</p>
      <div>
        <div className="help" style={{ marginBottom: 8 }}>이유 · 선택 · 비워 두어도 됩니다</div>
        <div className="reasons">
          {REASONS.map((x) => <button key={x} className={`chip ${r === x ? "on" : ""}`} onClick={() => setR(r === x ? undefined : x)}>{x}</button>)}
        </div>
      </div>
      <p className="help">{r ? `‘${r}’로 남깁니다.` : "이유는 고르지 않은 상태입니다. 비워 두고 넘겨도 됩니다."}</p>
    </Modal>
  );
}
