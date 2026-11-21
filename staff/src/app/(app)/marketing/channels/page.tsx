"use client";
import { useState } from "react";
import Link from "next/link";
import { useMe } from "@/lib/me";
import { Head, Info, Blocked, Modal, Collect, useMk, useRpc, rpc, periodRange, periodText, PERIODS, n0, when, canEdit, type Job } from "../ui";

/* 시안 U-PC-MKT-2 채널: 유입·전환 + 채널 발행량 + 키워드 순위 */
type Inflow = { route: string; n: number; rsv: number; reg: number };
type Kw = { id: string; keyword: string; blog: number | null; place: number | null; prev: number | null; on: string | null };
type Ch = {
  inflow: Inflow[] | null; blog: { now: number; prev: number };
  manual: Record<string, number> | null; manual_prev: Record<string, number> | null;
  keywords: Kw[] | null; jobs: Job[] | null; local_top?: { rank: number; name: string }[] | null;
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
  const curLabel = PERIODS.find((x) => x.k === period)!.l;

  const jobs = data?.jobs ?? [];
  const auto = (job: string) => jobs.some((j) => j.job === job && j.result === "성공");
  const top5 = data?.local_top ?? [];
  const fail = jobs.filter((j) => j.result !== "성공" && j.result !== "건너뜀").map((j) => `${when(j.at)} · ${JOB_LABEL[j.job] ?? j.job}${j.reason ? ` · ${j.reason}` : ""}`)[0];

  return (
    <div className="mx-ch">
      <Head title="채널" meta={periodText(period)} />
      <Info tag="직원만">유입·전환과 발행량, 키워드 순위를 한 화면에서 봅니다. 키워드 바꾸고 지금 확인은 관리자 이상만 할 수 있습니다. 연결은 <Link className="link" href="/settings">설정 › 운영 › 연결</Link> 에서 관리합니다. 리뷰·플레이스 순위와 당근은 API가 없어 직접 입력합니다.</Info>
      <div className="body">
        {err ? <Blocked err={err} /> : (<>
          <div className="chgrid">
            <div>
              <div className="sec">
                <div className="sech"><h2>유입 · 전환</h2><span className="sub">문의별이 아니라 경로별입니다. 광고별 문의 수는 알 수 없습니다.</span></div>
                <div className="wrap mb-scroll"><table className="tbl">
                  <thead><tr><th>유입 경로</th><th className="num">유입</th><th className="num">예약</th><th className="num">등록</th><th className="num">비중</th></tr></thead>
                  <tbody>
                    {!data && <tr><td colSpan={5} className="mx-empty">불러오는 중…</td></tr>}
                    {data && inflow.length === 0 && <tr><td colSpan={5} className="mx-empty">이 기간 문의 기록 없음. 문의가 들어오면 경로별로 쌓입니다</td></tr>}
                    {inflow.map((x) => {
                      const p = total ? Math.round((x.n / total) * 100) : 0;
                      return (
                        <tr key={x.route}>
                          <td data-label="유입 경로">{x.route}</td>
                          <td className="num" data-label="유입">{n0(x.n)}</td><td className="num" data-label="예약">{n0(x.rsv)}</td><td className="num" data-label="등록">{n0(x.reg)}</td>
                          <td className="num" data-label="비중"><span className="bar"><i style={{ width: `${p}%` }} /></span> {p}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              </div>
              <div className="sec">
                <div className="sech"><h2>채널 발행량</h2></div>
                <div className="vols">
                  <div className="vol"><label>인스타그램</label><b>{data?.manual?.["인스타그램"] ?? 0}</b><div className="h">{curLabel} 게시물 · {prevLabel} {data?.manual_prev?.["인스타그램"] ?? 0} · {auto("insta-count") ? <span className="badge ok">연결됨</span> : <>직접 입력 · {edit && <button className="btn sm" onClick={() => setReview("인스타그램")}>입력</button>}</>}</div></div>
                  <div className="vol"><label>네이버 블로그</label><b>{data?.blog.now ?? 0}</b><div className="h">{curLabel} 글 · {prevLabel} {data?.blog.prev ?? 0} · {auto("blog-count") ? <span className="badge ok">연결됨</span> : <span className="badge">수집 전</span>}</div></div>
                  <div className="vol"><label>리뷰</label><b>{data?.manual?.["리뷰"] ?? 0}</b><div className="h">직접 입력 · API 없음 · {edit && <button className="btn sm" onClick={() => setReview("리뷰")}>입력</button>}</div></div>
                </div>
              </div>
            </div>
            <div>
              <div className="sec">
                <div className="sech"><h2>키워드 순위</h2>
                  <span className="sub">지점 키워드 {kws.length}개 · 블로그 순위 · 지역 검색 상위 5곳</span>
                  <span className="sp" />
                  {edit && <button className="btn sm" onClick={() => setKwOpen(true)}>키워드 바꾸기</button>}
                  {edit && <button className="btn sm" onClick={() => toast("지금 확인은 준비 중이에요. 순위는 매일 08:15에 자동으로 모아요")}>지금 순위 확인</button>}
                </div>
                <div className="kwtwo">
                  <div className="wrap mb-scroll"><table className="tbl">
                    <thead><tr><th>키워드</th><th className="num">블로그</th><th className="num">지역</th></tr></thead>
                    <tbody>
                      {data && kws.length === 0 && <tr><td colSpan={3} className="mx-empty">등록한 키워드 없음{edit ? ". ‘키워드 바꾸기’로 10개까지 넣어 주세요" : ""}</td></tr>}
                      {kws.map((k) => (
                        <tr key={k.id}><td data-label="키워드">{k.keyword}</td><td className="num" data-label="블로그">{k.blog ?? "—"}</td><td className="num" data-label="지역">{k.place ?? "—"}</td></tr>
                      ))}
                    </tbody>
                  </table></div>
                  <div className="wrap mb-scroll"><table className="tbl">
                    <thead><tr><th>지역 검색 상위 5곳</th><th className="num">순위</th></tr></thead>
                    <tbody>
                      {data && top5.length === 0 && <tr><td colSpan={2} className="mx-empty">지역 검색 수집이 연결되면 보여요</td></tr>}
                      {top5.map((t) => <tr key={t.rank}><td data-label="업체">{t.name}</td><td className="num" data-label="순위">{t.rank}</td></tr>)}
                    </tbody>
                  </table></div>
                </div>
              </div>
            </div>
          </div>
          <Collect jobs={jobs.filter((j) => !j.job.startsWith("ads-"))} fail={fail ?? "최근 7일 실패 없음"} />
        </>)}
      </div>

      {kwOpen && <KwModal branch={branch} list={kws} onClose={() => setKwOpen(false)} onDone={() => { setKwOpen(false); toast("키워드를 저장했어요"); reload(); }} />}
      {review && <CountModal kind={review} branch={branch} from={r.from} onClose={() => setReview(null)} onDone={() => { setReview(null); toast("저장했어요"); reload(); }} />}
    </div>
  );
}

const JOB_LABEL: Record<string, string> = { "blog-count": "네이버 블로그 글 수", "insta-count": "인스타그램 게시물", "keyword-rank": "키워드 순위" };

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
      <p className="help">{branch} · 10개까지. 순위는 오늘 확인한 숫자를 넣으면 지난 순위와 비교해 보여 줍니다.</p>
      <div className="mx-kwrow" style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}><span>키워드</span><span>블로그</span><span>플레이스</span><span /></div>
      {rows.map((r, i) => (
        <div className="mx-kwrow" key={i}>
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
      <p className="help">{branch} · {from.slice(5).replace("-", ".")} 시작 주에 새로 생긴 {kind === "리뷰" ? "리뷰" : "게시물"} 수</p>
      <input className="inp" inputMode="numeric" autoFocus value={v} onChange={(x) => setV(x.target.value.replace(/\D/g, ""))} placeholder="0" />
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
