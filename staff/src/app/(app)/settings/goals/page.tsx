"use client";
import { useCallback, useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { todayKST } from "@/lib/sales";
import { friendly } from "../../membership/ui";
import { Card, Confirm, Help, HelpD, Msg, NumInp, ORow, PageH, tierName, useBranch, useLead } from "../kit";

type T = { target: number | null; actual: number | null } | null;
type Row = { id: string; name: string; sales: T; visit: T; rereg: T };
type Log = { at: string; by_name: string; by_tier: string; metric: string; before: number | null; after: number | null; staff: string };
type Goal = { can_edit: boolean; show_sales: boolean; branch?: { sales: T; visit: T; rereg: T }; staff?: Row[]; logs?: Log[] };
type M = "sales" | "visit" | "rereg";
const ML: Record<M, string> = { sales: "매출", visit: "방문", rereg: "재등록" };
const man = (n: number | null | undefined) => (n == null ? null : Math.round(n / 10000));
const unit = (m: M, n: number | null) => (n == null ? "없음" : m === "sales" ? `${n.toLocaleString("ko-KR")}만` : m === "visit" ? `${n}명` : `${n}명`);

/* 시안 U-PC-SET-14 목표 + 14_변경확인 (043 dash_goal / dash_goal_set) */
export default function GoalsPage() {
  const { branch, pick } = useBranch();
  const { lead } = useLead();
  const months = Array.from({ length: 4 }, (_, i) => { const d = new Date(todayKST().slice(0, 7) + "-01T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 1 + i); return d.toISOString().slice(0, 10); });
  const [month, setMonth] = useState(months[1]);
  const [g, setG] = useState<Goal | null>(null);
  const [v, setV] = useState<Record<string, number | null>>({});
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState("");

  const key = (m: M, s = "") => `${m}|${s}`;
  const load = useCallback(async () => {
    const r = await sb.rpc("dash_goal", { p_branch: branch, p_month: month });
    if (r.error) { setG(null); return setMsg(friendly(r.error.message)); }
    const d = r.data as Goal; setG(d);
    const o: Record<string, number | null> = {};
    (["sales", "visit", "rereg"] as M[]).forEach((m) => {
      const t = d.branch?.[m]?.target ?? null; o[key(m)] = m === "sales" ? man(t) : t;
      (d.staff ?? []).forEach((s) => { const x = s[m]?.target ?? null; o[key(m, s.id)] = m === "sales" ? man(x) : x; });
    });
    setV(o); setOrig(o);
  }, [branch, month]);
  const [orig, setOrig] = useState<Record<string, number | null>>({});
  useEffect(() => { load(); }, [load]);
  const changed = Object.keys(v).filter((k) => v[k] !== orig[k]);
  const edit = lead && !!g?.can_edit;
  const name = (s: string) => g?.staff?.find((x) => x.id === s)?.name ?? "";
  const lines = changed.slice(0, 3).map((k) => { const [m, s] = k.split("|") as [M, string]; return `${s ? name(s) + " " : ""}${ML[m]} 목표 ${unit(m, orig[k])} → ${unit(m, v[k])}`; });

  async function doSave() {
    setAsk(false);
    for (const k of changed) {
      const [m, s] = k.split("|") as [M, string];
      const val = v[k] == null ? null : m === "sales" ? (v[k] as number) * 10000 : v[k];
      const { error } = await sb.rpc("dash_goal_set", { p_branch: branch, p_month: month, p_metric: m, p_staff: s, p_target: val });
      if (error) return setMsg(friendly(error.message));
    }
    setMsg("저장했어요"); load();
  }
  const inp = (m: M, s = "", w?: number) => edit
    ? <NumInp value={v[key(m, s)]} width={w} onChange={(x) => setV({ ...v, [key(m, s)]: x })} label={`${s ? name(s) + " " : ""}${ML[m]} 목표`} />
    : <span className="inp num off" style={w ? { width: w } : undefined}>{v[key(m, s)] ?? "—"}</span>;
  const ym = (d: string) => `${Number(d.slice(5, 7))}월 ${d.slice(0, 4)}`;
  const vb = g?.branch?.visit;
  const logLine = (l: Log) => {
    const d = new Date(l.at);
    const t = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
    const m = l.metric as M; const f = (n: number | null) => (n == null ? "없음" : m === "sales" ? `${man(n)!.toLocaleString("ko-KR")}만` : String(n));
    return `${l.by_name} ${tierName(l.by_tier)} · ${t} · ${l.staff ? l.staff + " " : "월 "}${ML[m]} 목표 ${f(l.before)} → ${f(l.after)}`;
  };

  if (!lead) return <div className="ct"><PageH title="목표" sub={branch} /><div className="body"><HelpD>목표는 대표관리자와 관리자가 정해요.</HelpD></div></div>;
  return (
    <div className="ct">
      <PageH title="목표" sub={`${branch} · ${ym(month)}`}>
        <Msg text={msg} />
        {edit && <button className={`btn ${ask ? "" : "p"}`} disabled={!changed.length} onClick={() => setAsk(true)}>저장</button>}
      </PageH>
      {pick}
      <div className="body">
        <div className="ltool">
          <select className="sel" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="달">{months.map((m) => <option key={m} value={m}>{ym(m)}</option>)}</select>
          <span className="help">{branch}</span>
        </div>
        <Card title="지점 목표">
          {g?.show_sales !== false && <ORow n={1} label="매출">{inp("sales")}<Help>만 원</Help></ORow>}
          <ORow n={2} label="방문">{inp("visit")}<Help>{v[key("visit")] !== orig[key("visit")] ? `지금 ${unit("visit", orig[key("visit")])}에서 ${unit("visit", v[key("visit")])}으로 바꿔요.` : vb?.actual != null ? `지금까지 ${vb.actual}명` : "명"}</Help></ORow>
          <ORow n={3} label="재등록">{inp("rereg")}<Help>명</Help></ORow>
        </Card>
        <Card title="직원별 목표">
          <table className="tbl">
            <tbody>
              <tr><th>직원</th>{g?.show_sales !== false && <th className="num">매출(만 원)</th>}<th className="num">방문</th><th className="num">재등록</th></tr>
              {(g?.staff ?? []).map((s) => (
                <tr key={s.id}><td>{s.name}</td>{g?.show_sales !== false && <td className="num">{inp("sales", s.id, 88)}</td>}<td className="num">{inp("visit", s.id, 72)}</td><td className="num">{inp("rereg", s.id, 72)}</td></tr>
              ))}
              {!g?.staff?.length && <tr><td colSpan={4}>이 지점에 재직 중인 직원이 없어요</td></tr>}
            </tbody>
          </table>
        </Card>
        {(g?.logs ?? []).slice(0, 2).map((l, i) => <div key={i} className="help">{logLine(l)}</div>)}
      </div>
      {ask && <Confirm title="목표를 바꿀까요?" lines={[...lines, ...(changed.length > 3 ? [`외 ${changed.length - 3}개`] : []), "이번 달 달성률이 다시 계산돼요.", "바꾼 내용은 기록에 남아요."]} onOk={doSave} onClose={() => setAsk(false)} />}
    </div>
  );
}
