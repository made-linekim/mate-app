"use client";
import { useState } from "react";
import { useMe } from "@/lib/me";
import { todayKST } from "@/lib/sales";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, md, pct, canEdit } from "../ui";

/* 시안 U-PC-MKT-5 제휴: 업체 명단 · 소개 · 등록 실적 */
type P = { id: string; name: string; industry: string | null; owner: string | null; contact_name: string | null; memo: string | null; last: string | null; intro: number; reg: number };
type D = { month_intro: number; month_reg: number; year_intro: number; year_reg: number; list: P[] | null };
const KINDS = ["산후조리원", "산부인과", "피부과", "헬스장", "회사", "기타"];

export default function PartnersPage() {
  const me = useMe();
  const { branch, toast } = useMk();
  const { data, err, reload } = useRpc<D>("mkt_partners", { p_branch: branch });
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [rec, setRec] = useState<P | null>(null);
  const list = data?.list ?? [];
  const m = +todayKST().slice(5, 7);
  const ed = canEdit(me);

  return (
    <>
      <Head title="제휴" meta="업체 명단 · 소개 · 등록 실적" period={false}>
        {ed && <button className="btn" onClick={() => setEdit("new")}>업체 추가</button>}
      </Head>
      <Info tag="직원만">제휴 업체를 관리하는 화면입니다. 업체 소개로 고객이 오면 ‘소개 기록’을 눌러 남기고, 등록까지 하면 등록으로 표시합니다.</Info>
      {err ? <Blocked err={err} /> : (
        <>
          <div className="mk-kpis">
            <div className="mk-kpi"><span className="l">제휴 업체</span><span className="v">{list.length}</span><span className="s">{branch}</span></div>
            <div className="mk-kpi"><span className="l">이번 달 소개</span><span className="v">{data?.month_intro ?? 0}</span><span className="s">{m}월 합</span></div>
            <div className="mk-kpi"><span className="l">이번 달 등록</span><span className="v em">{data?.month_reg ?? 0}</span><span className="s">소개 대비 {pct(data?.month_reg ?? 0, data?.month_intro ?? 0)}</span></div>
            <div className="mk-kpi"><span className="l">올해 등록</span><span className="v">{data?.year_reg ?? 0}</span><span className="s">소개 {data?.year_intro ?? 0}건</span></div>
          </div>
          <div className="mk-sec"><h2>업체 목록</h2></div>
          <div className="mk-card">
            <table className="mk-t">
              <thead><tr><th>업체</th><th>구분</th><th>담당</th><th className="r">소개</th><th className="r">등록</th><th className="r">최근 연락</th>{ed && <th />}</tr></thead>
              <tbody>
                {!data && <tr><td colSpan={7} className="mk-empty">불러오는 중…</td></tr>}
                {data && list.length === 0 && <tr><td colSpan={7} className="mk-empty">등록한 제휴 업체 없음 — {ed ? "오른쪽 위 ‘업체 추가’로 넣어 주세요" : "관리자가 넣으면 보입니다"}</td></tr>}
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="nm"><button className="btn t" style={{ padding: 0, height: "auto", fontSize: "inherit", fontWeight: "inherit", color: "inherit" }} onClick={() => ed && setEdit(p)}>{p.name}</button></td>
                    <td>{p.industry ?? "—"}</td>
                    <td>{p.owner ?? "—"}</td>
                    <td className="r">{p.intro}</td>
                    <td className="r key">{p.reg}</td>
                    <td className="r">{p.last ? md(p.last) : "—"}</td>
                    {ed && <td className="r full"><button className="btn sm" onClick={() => setRec(p)}>소개 기록</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {edit && <EditModal branch={branch} p={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); toast("저장했어요"); reload(); }} />}
      {rec && <RecModal p={rec} onClose={() => setRec(null)} onDone={() => { setRec(null); toast("기록했어요"); reload(); }} />}
    </>
  );
}

function EditModal({ branch, p, onClose, onDone }: { branch: string; p: P | null; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: p?.name ?? "", industry: p?.industry ?? KINDS[0], owner: p?.owner ?? me.name, contact: p?.contact_name ?? "", memo: p?.memo ?? "" });
  const [e, setE] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: x.target.value });
  return (
    <Modal title={p ? "업체 고치기" : "업체 추가"} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={!f.name.trim()} onClick={async () => {
        try { await rpc("mkt_partner_save", { p_branch: branch, p_id: p?.id ?? null, p_name: f.name, p_industry: f.industry, p_owner: f.owner, p_contact_name: f.contact, p_memo: f.memo }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>저장</button>
    </>}>
      <div className="grid">
        <label htmlFor="pn">업체 이름</label><input id="pn" className="inp" value={f.name} onChange={set("name")} placeholder="예: ○○ 산후조리원" autoFocus />
        <label htmlFor="pk">구분</label>
        <select id="pk" className="sel" value={f.industry} onChange={set("industry")}>{[...new Set([...KINDS, f.industry])].map((k) => <option key={k}>{k}</option>)}</select>
        <label htmlFor="po">담당 직원</label><input id="po" className="inp" value={f.owner} onChange={set("owner")} />
        <label htmlFor="pc">업체 담당자</label><input id="pc" className="inp" value={f.contact} onChange={set("contact")} placeholder="선택" />
        <label htmlFor="pm">메모</label><input id="pm" className="inp" value={f.memo} onChange={set("memo")} placeholder="조건 · 할인 등 (선택)" />
      </div>
      <p className="h">{branch}</p>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}

function RecModal({ p, onClose, onDone }: { p: P; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<"상담" | "등록" | "">("상담");
  const [method, setMethod] = useState<"소개" | "연락">("소개");
  const [day, setDay] = useState(todayKST());
  const [e, setE] = useState<string | null>(null);
  return (
    <Modal title={`${p.name} 기록`} onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" onClick={async () => {
        try { await rpc("mkt_partner_contact", { p_id: p.id, p_day: day, p_method: method, p_result: method === "소개" ? result : "", p_message: null }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>기록</button>
    </>}>
      <div className="chips">
        <button className={`chip ${method === "소개" ? "on" : ""}`} onClick={() => setMethod("소개")}>고객 소개받음</button>
        <button className={`chip ${method === "연락" ? "on" : ""}`} onClick={() => setMethod("연락")}>업체와 연락함</button>
      </div>
      {method === "소개" && (
        <div className="chips">
          <button className={`chip ${result === "상담" ? "on" : ""}`} onClick={() => setResult("상담")}>상담까지</button>
          <button className={`chip ${result === "등록" ? "on" : ""}`} onClick={() => setResult("등록")}>등록함</button>
        </div>
      )}
      <div className="grid"><label htmlFor="pd">날짜</label><input id="pd" type="date" className="inp" value={day} onChange={(x) => setDay(x.target.value)} /></div>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
