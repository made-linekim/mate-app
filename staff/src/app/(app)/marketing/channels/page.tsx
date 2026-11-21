"use client";
import { useState } from "react";
import { useMe } from "@/lib/me";
import { Head, Info, Blocked, Modal, JobRow, useMk, useRpc, rpc, periodRange, periodText, n0, canEdit, type Job } from "../ui";

/* 시안 U-PC-MKT-2 채널: 유입·전환 + 채널 발행량 + 키워드 순위 */
type Inflow = { route: string; n: number; rsv: number; reg: number };
type Kw = { id: string; keyword: string; blog: number | null; place: number | null; prev: number | null; on: string | null };
type Ch = {
  inflow: Inflow[] | null; blog: { now: number; prev: number };
  manual: Record<string, number> | null; manual_prev: Record<string, number> | null;
  keywords: Kw[] | null; jobs: Job[] | null;
};

export default function ChannelsPage() {
  const me = useMe();
  const { branch, period, toast } = useMk();
  const r = periodRange(period);
  const { data, err, reload } = useRpc<Ch>("mkt_channels", { p_branch: branch, p_from: r.from, p_to: r.to });
  const [kwOpen, setKwOpen] = useState(false);
  const [review, setReview] = useState<null | "리뷰" | "인스타그램">(null);
  const inflow = data?.inflow ?? [];
  const total = inflow.reduce((a, x) => a + x.n, 0);
  const kws = data?.keywords ?? [];
  const edit = canEdit(me);
  const prevLabel = period.includes("month") ? "지난 달" : "지난 주";

  return (
    <>
      <Head title="채널" meta={periodText(period)} />
      <Info tag="직원만">유입·전환과 발행량, 키워드 순위를 한 화면에서 봅니다. 키워드 바꾸기는 관리자 이상이 할 수 있습니다. 리뷰·인스타그램처럼 API가 없는 숫자는 직접 입력합니다.</Info>
      {err ? <Blocked err={err} /> : (
        <div className="mk-split">
          <div>
            <div className="mk-sec"><h2>유입 · 전환</h2><span className="meta">문의별이 아니라 경로별입니다</span></div>
            <div className="mk-card">
              <table className="mk-t">
                <thead><tr><th>유입 경로</th><th className="r">유입</th><th className="r">예약</th><th className="r">등록</th><th className="r">비중</th></tr></thead>
                <tbody>
                  {!data && <tr><td colSpan={5} className="mk-empty">불러오는 중…</td></tr>}
                  {data && inflow.length === 0 && <tr><td colSpan={5} className="mk-empty">이 기간 문의 기록 없음 — 문의가 들어오면 경로별로 자동으로 쌓입니다</td></tr>}
                  {inflow.map((x) => {
                    const p = total ? Math.round((x.n / total) * 100) : 0;
                    return (
                      <tr key={x.route}>
                        <td className="nm">{x.route}</td>
                        <td className="r key">{n0(x.n)}</td><td className="r">{n0(x.rsv)}</td><td className="r">{n0(x.reg)}</td>
                        <td className="r"><span className="bar"><i><b style={{ width: `${p}%` }} /></i>{p}%</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mk-sec" style={{ marginTop: 24 }}><h2>채널 발행량</h2></div>
            <div className="mk-pub">
              <Pub label="인스타그램" v={data?.manual?.["인스타그램"]} prev={data?.manual_prev?.["인스타그램"]} unit="게시물" prevLabel={prevLabel}
                act={edit ? <button className="btn sm" onClick={() => setReview("인스타그램")}>입력</button> : undefined} manual />
              <Pub label="네이버 블로그" v={data?.blog.now} prev={data?.blog.prev} unit="글" prevLabel={prevLabel} />
              <Pub label="리뷰" v={data?.manual?.["리뷰"]} prev={data?.manual_prev?.["리뷰"]} unit="리뷰" prevLabel={prevLabel}
                act={edit ? <button className="btn sm" onClick={() => setReview("리뷰")}>입력</button> : undefined} manual />
            </div>
          </div>

          <div>
            <div className="mk-sec">
              <h2>키워드 순위</h2><span className="meta">지점 키워드 {kws.length}개 · 블로그 · 플레이스</span>
              {edit && <span className="act"><button className="btn" onClick={() => setKwOpen(true)}>키워드 바꾸기</button></span>}
            </div>
            <div className="mk-card">
              <table className="mk-t">
                <thead><tr><th>키워드</th><th className="r">블로그</th><th className="r">플레이스</th><th className="r">변화</th></tr></thead>
                <tbody>
                  {data && kws.length === 0 && <tr><td colSpan={4} className="mk-empty">등록한 키워드 없음 — {edit ? "‘키워드 바꾸기’로 10개까지 넣어 주세요" : "관리자가 넣으면 보입니다"}</td></tr>}
                  {kws.map((k) => {
                    const d = k.blog != null && k.prev != null ? k.prev - k.blog : null;
                    return (
                      <tr key={k.id}>
                        <td className="nm">{k.keyword}</td>
                        <td className="r key">{k.blog == null ? <span className="z">—</span> : `${k.blog}위`}</td>
                        <td className="r">{k.place == null ? <span className="z">—</span> : `${k.place}위`}</td>
                        <td className="r">{d == null || d === 0 ? <span className="z">—</span> : <span style={{ color: d < 0 ? "var(--red)" : "var(--grn)", fontWeight: 600 }}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {kws.some((k) => k.on) && <p style={{ margin: "8px 2px 0", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>마지막 순위 입력 {kws.map((k) => k.on).filter(Boolean).sort().pop()?.slice(5).replace("-", ".")}</p>}
          </div>
        </div>
      )}

      {!err && (
        <div className="mk-routine">
          <div className="hd">수집 루틴 상태</div>
          {(data?.jobs ?? []).map((j) => <JobRow key={j.job} j={j} />)}
          {data && (data.jobs ?? []).length === 0 && (
            <div className="row"><b>블로그 · 인스타 · 순위</b><span>자동 수집 연결 전입니다. 그때까지는 직접 입력한 숫자로 보여 줍니다.</span><span /></div>
          )}
        </div>
      )}

      {kwOpen && <KwModal branch={branch} list={kws} onClose={() => setKwOpen(false)} onDone={() => { setKwOpen(false); toast("키워드를 저장했어요"); reload(); }} />}
      {review && <CountModal kind={review} branch={branch} from={r.from} onClose={() => setReview(null)} onDone={() => { setReview(null); toast("저장했어요"); reload(); }} />}
    </>
  );
}

function Pub({ label, v, prev, unit, prevLabel, act, manual }: { label: string; v?: number; prev?: number; unit: string; prevLabel: string; act?: React.ReactNode; manual?: boolean }) {
  return (
    <div className="mk-kpi">
      <span className="l">{label}</span>
      <span className="v">{v ?? 0}</span>
      <span className="s">이번 기간 {unit} · {prevLabel} {prev ?? 0} · {manual ? <span className="badge">직접 입력</span> : <span className="badge ok">자동</span>}{act}</span>
    </div>
  );
}

function KwModal({ branch, list, onClose, onDone }: { branch: string; list: Kw[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState(() => {
    const r = list.map((k) => ({ keyword: k.keyword, blog: k.blog == null ? "" : String(k.blog), place: k.place == null ? "" : String(k.place) }));
    return r.length ? r : [{ keyword: "", blog: "", place: "" }];
  });
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: "keyword" | "blog" | "place", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: k === "keyword" ? v : v.replace(/\D/g, "") } : r)));
  return (
    <Modal title="키워드 바꾸기" onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await rpc("mkt_keywords_save", { p_branch: branch, p_items: rows.filter((r) => r.keyword.trim()) }); onDone(); }
        catch (x) { setE((x as Error).message); setBusy(false); }
      }}>저장</button>
    </>}>
      <p className="h">{branch} · 10개까지. 순위는 오늘 확인한 숫자를 넣으면 지난 순위와 비교해 보여 줍니다.</p>
      <div className="mk-kwrow" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}><span>키워드</span><span>블로그</span><span>플레이스</span><span /></div>
      {rows.map((r, i) => (
        <div className="mk-kwrow" key={i}>
          <input className="inp" value={r.keyword} onChange={(x) => set(i, "keyword", x.target.value)} placeholder="예: 의정부 다이어트" aria-label="키워드" />
          <input className="inp" inputMode="numeric" value={r.blog} onChange={(x) => set(i, "blog", x.target.value)} placeholder="위" aria-label="블로그 순위" />
          <input className="inp" inputMode="numeric" value={r.place} onChange={(x) => set(i, "place", x.target.value)} placeholder="위" aria-label="플레이스 순위" />
          <button className="btn t sm" aria-label="빼기" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {rows.length < 10 && <button className="btn sm" onClick={() => setRows([...rows, { keyword: "", blog: "", place: "" }])}>+ 키워드 추가</button>}
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}

function CountModal({ kind, branch, from, onClose, onDone }: { kind: "리뷰" | "인스타그램"; branch: string; from: string; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState("");
  const [e, setE] = useState<string | null>(null);
  return (
    <Modal title={`${kind} 수 입력`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={!v} onClick={async () => {
        try { await rpc("mkt_manual_set", { p_branch: branch, p_week: from, p_channel: kind, p_spend: 0, p_inflow: Number(v), p_reserve: 0, p_reg: 0 }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>저장</button>
    </>}>
      <p className="h">{branch} · {from.slice(5).replace("-", ".")} 시작 주에 새로 생긴 {kind === "리뷰" ? "리뷰" : "게시물"} 수</p>
      <input className="inp" inputMode="numeric" autoFocus value={v} onChange={(x) => setV(x.target.value.replace(/\D/g, ""))} placeholder="0" />
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
