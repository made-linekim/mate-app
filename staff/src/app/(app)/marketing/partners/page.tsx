"use client";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/me";
import { TIER_LABEL } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { Head, Info, Blocked, Modal, useMk, useRpc, rpc, md, pct, canEdit } from "../ui";

/* 시안 U-PC-MKT-5 제휴: 업체 명단 · 소개 · 등록 실적 */
type P = { id: string; name: string; industry: string | null; owner: string | null; contact_name: string | null; memo: string | null; last: string | null; intro: number; reg: number };
type D = { month_intro: number; month_reg: number; year_intro: number; year_reg: number; list: P[] | null };
const KINDS = ["산후조리원", "산부인과", "병원", "기타"];
const hm = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);

export default function PartnersPage() {
  const me = useMe();
  const { branch, toast } = useMk();
  const { data, err, reload } = useRpc<D>("mkt_partners", { p_branch: branch });
  const [view, setView] = useState<"list" | "add">("list");
  const [edit, setEdit] = useState<P | null>(null);
  const [rec, setRec] = useState<P | null>(null);
  const [added, setAdded] = useState<{ id: string | null; name: string; at: string } | null>(null);
  const [undo, setUndo] = useState(false);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(false), 6000); return () => clearTimeout(t); }, [undo]);
  const list = data?.list ?? [];
  const m = +todayKST().slice(5, 7);
  const direct = me.tier !== "staff";   // 시안: 관리자 이상은 바로 추가, 직원은 요청만
  const ed = canEdit(me);

  if (view === "add") {
    return (
      <div className="mx-pt">
        <div className="m24">
          <div className="pageh"><h1>제휴</h1><span className="badge staff">직원만</span><span className="sub">{direct ? "업체 추가" : "업체 추가 요청"} · {branch}</span><span className="sp" /></div>
          <div className="body">
            <AddForm branch={branch} direct={direct} onClose={() => setView("list")} onDone={(id, name) => {
              setView("list");
              if (direct) { setAdded({ id, name, at: hm() }); setUndo(true); reload(); }
              else toast(`${name} 추가를 요청했어요. 승인되면 목록에 들어가요`);
            }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-pt">
      <Head title="제휴" meta="업체 명단 · 소개 · 등록 실적" period={false}>
        <button className="btn" onClick={() => setView("add")}>업체 추가</button>
      </Head>
      <Info tag="직원만">제휴 업체를 관리하는 화면입니다. 소개 안내는 직원이 따로 보냅니다. 실적은 등록 자료와 맞춰 볼 수 있습니다.</Info>
      <div className="body">
        {err ? <Blocked err={err} /> : (<>
          <div className="kpis">
            <div className="kpi"><label>제휴 업체</label><b>{list.length}</b><div className="h">{branch}</div></div>
            <div className="kpi"><label>이번 달 소개</label><b>{data?.month_intro ?? 0}</b><div className="h">{m}월 합</div></div>
            <div className="kpi"><label>이번 달 등록</label><b className="key">{data?.month_reg ?? 0}</b><div className="h">소개 대비 {pct(data?.month_reg ?? 0, data?.month_intro ?? 0).replace(".0%", "%")}</div></div>
            <div className="kpi"><label>올해 등록</label><b>{data?.year_reg ?? 0}</b><div className="h">소개 {data?.year_intro ?? 0}건</div></div>
          </div>
          <div className="sec">
            <div className="sech"><h2>업체 목록</h2></div>
            <div className="wrap mb-scroll"><table className="tbl mx-click">
              <thead><tr><th>업체</th><th>구분</th><th>담당</th><th className="num">소개</th><th className="num">등록</th><th className="num">최근 연락</th></tr></thead>
              <tbody>
                {!data && <tr><td colSpan={6} className="mx-empty">불러오는 중…</td></tr>}
                {data && list.length === 0 && <tr><td colSpan={6} className="mx-empty">등록한 제휴 업체 없음. 오른쪽 위 ‘업체 추가’로 넣어 주세요</td></tr>}
                {list.map((p) => (
                  <tr key={p.id} onClick={() => ed && setRec(p)} title={ed ? "눌러서 소개·연락 기록" : undefined}>
                    <td data-label="업체">{p.name}</td>
                    <td data-label="구분">{p.industry ?? "—"}</td>
                    <td data-label="담당">{p.owner ?? "—"}</td>
                    <td className="num" data-label="소개">{p.intro}</td>
                    <td className="num" data-label="등록">{p.reg}</td>
                    <td className="num" data-label="최근 연락">{p.last ? md(p.last) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {added && <div className="help" style={{ marginTop: 16 }}>{me.name} {TIER_LABEL[me.tier]} · 오늘 {added.at} · {added.name}을 추가했어요.</div>}
          </div>
        </>)}
      </div>
      {undo && added && (
        <div className="toast" role="status">{added.name}을 추가했어요.
          {added.id && <button onClick={async () => {
            try { await rpc("mkt_partner_undo", { p_id: added.id }); setAdded(null); setUndo(false); toast("되돌렸어요"); reload(); }
            catch (x) { toast((x as Error).message === "NEED_SQL" ? "되돌리기는 서버 준비(063 SQL) 후에 돼요" : (x as Error).message); }
          }}>되돌리기</button>}
        </div>
      )}
      {edit && <EditModal branch={branch} p={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); toast("저장했어요"); reload(); }} />}
      {rec && <RecModal p={rec} onEdit={() => { setEdit(rec); setRec(null); }} onClose={() => setRec(null)} onDone={() => { setRec(null); toast("기록했어요"); reload(); }} />}
    </div>
  );
}

/* 시안 U-PC-MKT-5-ADD 업체 추가 (관리자 이상) · 업체 추가 요청 (직원) */
function AddForm({ branch, direct, onClose, onDone }: { branch: string; direct: boolean; onClose: () => void; onDone: (id: string | null, name: string) => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: "", kind: KINDS[0], owner: me.name, phone: "" });
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const staff = useRpc<{ name: string }[]>("mkt_staff_names", { p_branch: branch });
  const names = [...new Set([me.name, ...((staff.data ?? []).map((x) => x.name))])];
  async function go() {
    setBusy(true); setE(null);
    try {
      if (!direct) { await rpc("mkt_partner_request", { p_branch: branch, p_name: f.name, p_industry: f.kind, p_owner: f.owner, p_phone: f.phone }); onDone(null, f.name.trim()); return; }
      let id: string;
      try { id = await rpc<string>("mkt_partner_add", { p_branch: branch, p_name: f.name, p_industry: f.kind, p_owner: f.owner, p_phone: f.phone }); }
      catch (x) {
        if ((x as Error).message !== "NEED_SQL") throw x;
        id = await rpc<string>("mkt_partner_save", { p_branch: branch, p_id: null, p_name: f.name, p_industry: f.kind, p_owner: f.owner, p_contact_name: null, p_memo: f.phone ? `연락처 ${f.phone}` : null });
      }
      onDone(id, f.name.trim());
    } catch (x) { setE((x as Error).message === "NEED_SQL" ? "추가 요청은 서버 준비(063 SQL) 후에 돼요" : (x as Error).message); setBusy(false); }
  }
  return (
    <div className="op-card" style={{ maxWidth: 640 }}>
      <h2 style={{ margin: 0, fontSize: "var(--fs-16)", lineHeight: "var(--lh-24)", fontWeight: 700 }}>{direct ? "업체 추가" : "업체 추가 요청"}</h2>
      <div className="field"><label htmlFor="pa-n">업체 이름</label><input id="pa-n" className="inp" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} placeholder="예: 늘봄 산후조리원" autoFocus /></div>
      <div className="field"><label>구분</label><div className="reasons">{KINDS.map((k) => <button key={k} className={`chip ${f.kind === k ? "on" : ""}`} onClick={() => setF({ ...f, kind: k })}>{k}</button>)}</div></div>
      <div className="field"><label htmlFor="pa-o">담당</label><select id="pa-o" className="sel" value={f.owner} onChange={(x) => setF({ ...f, owner: x.target.value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></div>
      <div className="field"><label htmlFor="pa-p">연락처</label><input id="pa-p" className="inp" inputMode="tel" value={f.phone} onChange={(x) => setF({ ...f, phone: x.target.value })} placeholder="031-000-0000" /></div>
      <div className="help">{direct ? "추가하면 목록에 바로 반영돼요. 잘못 넣으면 되돌릴 수 있어요." : "요청하면 관리자 이상에게 가요. 승인되기 전에는 목록에 안 들어가요."}</div>
      {e && <div className="help" style={{ color: "var(--red)" }}>{e}</div>}
      <div><button className="btn p" disabled={busy || !f.name.trim()} onClick={go}>{direct ? "추가" : "추가 요청"}</button> <button className="btn" onClick={onClose}>닫기</button></div>
    </div>
  );
}

function EditModal({ branch, p, onClose, onDone }: { branch: string; p: P; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: p.name, industry: p.industry ?? KINDS[0], owner: p.owner ?? "", contact: p.contact_name ?? "", memo: p.memo ?? "" });
  const [e, setE] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (x: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: x.target.value });
  return (
    <Modal title="업체 고치기" onClose={onClose} foot={<>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" disabled={!f.name.trim()} onClick={async () => {
        try { await rpc("mkt_partner_save", { p_branch: branch, p_id: p.id, p_name: f.name, p_industry: f.industry, p_owner: f.owner, p_contact_name: f.contact, p_memo: f.memo }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>저장</button>
    </>}>
      <div className="grid">
        <label htmlFor="pn">업체 이름</label><input id="pn" className="inp" value={f.name} onChange={set("name")} autoFocus />
        <label htmlFor="pk">구분</label>
        <select id="pk" className="inp" value={f.industry} onChange={set("industry")}>{[...new Set([...KINDS, f.industry])].map((k) => <option key={k}>{k}</option>)}</select>
        <label htmlFor="po">담당</label><input id="po" className="inp" value={f.owner} onChange={set("owner")} />
        <label htmlFor="pc">업체 담당자</label><input id="pc" className="inp" value={f.contact} onChange={set("contact")} placeholder="선택" />
        <label htmlFor="pm">메모</label><input id="pm" className="inp" value={f.memo} onChange={set("memo")} placeholder="선택" />
      </div>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}

function RecModal({ p, onEdit, onClose, onDone }: { p: P; onEdit: () => void; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<"상담" | "등록" | "">("상담");
  const [method, setMethod] = useState<"소개" | "연락">("소개");
  const [day, setDay] = useState(todayKST());
  const [e, setE] = useState<string | null>(null);
  return (
    <Modal title={`${p.name} 기록`} onClose={onClose} foot={<>
      <button className="btn" style={{ marginRight: "auto" }} onClick={onEdit}>업체 고치기</button>
      <button className="btn" onClick={onClose}>취소</button>
      <button className="btn p" onClick={async () => {
        try { await rpc("mkt_partner_contact", { p_id: p.id, p_day: day, p_method: method, p_result: method === "소개" ? result : "", p_message: null }); onDone(); }
        catch (x) { setE((x as Error).message); }
      }}>기록</button>
    </>}>
      <div className="reasons">
        <button className={`chip ${method === "소개" ? "on" : ""}`} onClick={() => setMethod("소개")}>고객 소개받음</button>
        <button className={`chip ${method === "연락" ? "on" : ""}`} onClick={() => setMethod("연락")}>업체와 연락함</button>
      </div>
      {method === "소개" && (
        <div className="reasons">
          <button className={`chip ${result === "상담" ? "on" : ""}`} onClick={() => setResult("상담")}>상담까지</button>
          <button className={`chip ${result === "등록" ? "on" : ""}`} onClick={() => setResult("등록")}>등록함</button>
        </div>
      )}
      <div className="grid"><label htmlFor="pd">날짜</label><input id="pd" type="date" className="inp" value={day} onChange={(x) => setDay(x.target.value)} /></div>
      {e && <p className="err">{e}</p>}
    </Modal>
  );
}
