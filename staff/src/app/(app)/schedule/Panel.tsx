"use client";
// 예약 화면 왼쪽 '현황보드' (메라 시안 P01)
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { type Rsv, todayKST, addDays, weekStart } from "@/lib/schedule";

type Period = "today" | "tomorrow" | "week" | "month";
const PERIODS: { k: Period; l: string }[] = [{ k: "today", l: "오늘" }, { k: "tomorrow", l: "내일" }, { k: "week", l: "이번주" }, { k: "month", l: "이번달" }];
const monthEnd = (d: string) => addDays(`${addDays(`${d.slice(0, 8)}28`, 4).slice(0, 8)}01`, -1);
function range(p: Period): [string, string] {
  const t = todayKST();
  if (p === "today") return [t, t];
  if (p === "tomorrow") return [addDays(t, 1), addDays(t, 1)];
  if (p === "week") return [weekStart(t), addDays(weekStart(t), 6)];
  return [`${t.slice(0, 8)}01`, monthEnd(t)];
}
const man = (n: number) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString()}만` : n.toLocaleString());

export default function Panel({ branch, dayRows, staffName, onClose }: { branch: string; dayRows: Rsv[]; staffName: (id: string) => string; onClose?: () => void }) {
  const [tab, setTab] = useState("현황");
  return (
    <aside className="sb-panel">
      <div className="seg sb-tabs">
        {["현황", "업무 메모", "문자", "네이버"].map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "현황" ? (
        <>
          <div className="sb-title">현황보드{onClose && <button className="sb-close" onClick={onClose} title="현황보드 닫기" aria-label="현황보드 닫기">«</button>}</div>
          <RsvCard branch={branch} />
          <SalesCard branch={branch} />
          <BlockedCard branch={branch} />
          <ExpiringRow branch={branch} />
          <CustomerRow branch={branch} />
          <ByStaffRow rows={dayRows} staffName={staffName} />
        </>
      ) : (
        <div className="sb-card" style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)", marginTop: 12 }}>
          {tab} 기능은 준비 중이에요.
        </div>
      )}
    </aside>
  );
}

function Tabs<T extends string>({ list, v, set }: { list: { k: T; l: string }[]; v: T; set: (k: T) => void }) {
  return (
    <div className="sb-mini">
      {list.map((x) => <button key={x.k} className={v === x.k ? "on" : ""} onClick={() => set(x.k)}>{x.l}</button>)}
    </div>
  );
}

function RsvCard({ branch }: { branch: string }) {
  const [p, setP] = useState<Period>("today");
  const [c, setC] = useState<{ rsv: number; visit: number; noshow: number; cancel: number } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const [f, t] = range(p);
    sb.rpc("rsv_board", { p_branch: branch, p_from: f, p_to: t }).then(({ data, error }) => {
      if (!on) return;
      setErr(!!error);
      const rows = (data ?? []) as Rsv[];
      setC({
        rsv: rows.filter((r) => r.status === "예약" || r.status === "완료").length,
        visit: rows.filter((r) => r.status === "완료").length,
        noshow: rows.filter((r) => r.status === "노쇼").length,
        cancel: rows.filter((r) => r.status === "취소").length,
      });
    });
    return () => { on = false; };
  }, [branch, p]);
  return (
    <div className="sb-card">
      <div className="sb-hd"><b>예약현황</b><Tabs list={PERIODS} v={p} set={setP} /></div>
      {err ? <div className="sb-none">볼 수 있는 권한이 없어요</div> : (
        <div className="sb-kpi num">
          {([["예약", c?.rsv], ["방문", c?.visit], ["노쇼", c?.noshow], ["취소", c?.cancel]] as const).map(([l, v]) => (
            <div key={l}><span>{l}</span><b>{v ?? "-"}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}

function SalesCard({ branch }: { branch: string }) {
  const [p, setP] = useState<"this" | "last">("this");
  const [s, setS] = useState<{ amount: number; card: number; cash: number; account: number } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    const t = todayKST();
    const first = p === "this" ? `${t.slice(0, 8)}01` : `${addDays(`${t.slice(0, 8)}01`, -1).slice(0, 8)}01`;
    sb.rpc("sales_list", {
      p_tab: "all", p_from: first, p_to: monthEnd(first), p_branch: branch, p_staff: null, p_q: null,
      p_customer_key: null, p_kinds: null, p_limit: 1, p_offset: 0,
    }).then(({ data, error }) => {
      if (!on) return;
      setErr(!!error);
      const r = (data as { sum_amount: number; sum_card: number; sum_cash: number; sum_account: number; sum_npay: number }[] | null)?.[0];
      setS({ amount: Number(r?.sum_amount ?? 0), card: Number(r?.sum_card ?? 0), cash: Number(r?.sum_cash ?? 0), account: Number(r?.sum_account ?? 0) + Number(r?.sum_npay ?? 0) });
    });
    return () => { on = false; };
  }, [branch, p]);
  return (
    <div className="sb-card">
      <div className="sb-hd"><b>매출현황</b><Tabs list={[{ k: "this", l: "이번달" }, { k: "last", l: "지난달" }]} v={p} set={setP} /></div>
      {err ? <div className="sb-none">매출을 볼 권한이 없어요</div> : (
        <>
          <div className="sb-row"><span>결제 매출</span><b className="num">{s ? man(s.amount) : "-"}</b></div>
          <div className="sb-row"><span>카드·현금·계좌</span><span className="num" style={{ whiteSpace: "nowrap" }}>{s ? [s.card, s.cash, s.account].map((x) => Math.round(x / 10000).toLocaleString()).join(" · ") : "-"}</span></div>
        </>
      )}
    </div>
  );
}

function BlockedCard({ branch }: { branch: string }) {
  const [v, setV] = useState<{ late: number | null; renew: number | null; unpaid: number | null }>({ late: null, renew: null, unpaid: null });
  useEffect(() => {
    let on = true;
    Promise.all([
      sb.rpc("happycall_list", { p_branch: branch }),
      sb.rpc("receivable_list", { p_q: null, p_branch: branch }),
    ]).then(([h, r]) => {
      if (!on) return;
      const hl = (h.data ?? []) as { kind: string; status: string; last_called_at: string | null }[];
      setV({
        late: h.error ? null : hl.filter((x) => x.status === "기한지남").length,
        renew: h.error ? null : hl.filter((x) => x.kind === "expiring" && !x.last_called_at).length,
        unpaid: r.error ? null : ((r.data ?? []) as { balance: number }[]).filter((x) => Number(x.balance) > 0).length,
      });
    });
    return () => { on = false; };
  }, [branch]);
  const n = [v.late, v.renew, v.unpaid].filter((x) => (x ?? 0) > 0).length;
  const row = (l: string, x: number | null, href: string, red?: boolean) => (
    <Link href={href} className="sb-row"><span>{l}</span><b className="num" style={{ color: red && x ? "var(--red)" : undefined }}>{x === null ? "-" : `${x}명`}</b></Link>
  );
  return (
    <div className="sb-card">
      <div className="sb-hd"><b>막힌 곳</b>{n > 0 && <span className="badge em">{n}곳</span>}</div>
      {row("해피콜 마감 지남", v.late, "/happycall", true)}
      {row("재등록 D-14 미연락", v.renew, "/happycall")}
      {row("미수금", v.unpaid, "/sales/receivable")}
    </div>
  );
}

function Fold({ title, value, href, children }: { title: string; value: string; href?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sb-card sb-fold">
      <button onClick={() => setOpen(!open)}><b>{title}</b><span className="num">{value}</span><i>{open ? "▾" : "▸"}</i></button>
      {open && <div style={{ marginTop: 8 }}>{children}{href && <Link href={href} className="sb-more">전체 보기</Link>}</div>}
    </div>
  );
}

function ExpiringRow({ branch }: { branch: string }) {
  const [d, setD] = useState<{ n: number; rows: { customer: string; name: string; end_on: string | null; remain: number }[] } | null>(null);
  useEffect(() => {
    let on = true;
    sb.rpc("membership_holdings", { p_branch: branch, p_filter: "soon" }).then(({ data, error }) => {
      if (!on || error || !data) return setD(null);
      const rows = (data.rows ?? []) as { customer_key: string; customer: string; name: string; end_on: string | null; remain: number }[];
      setD({ n: new Set(rows.map((r) => r.customer_key)).size, rows });
    });
    return () => { on = false; };
  }, [branch]);
  return (
    <Fold title="만료예정 회원권" value={d ? `${d.n}명` : "-"} href="/membership">
      {d?.rows.slice(0, 5).map((r, i) => (
        <div key={i} className="sb-row sm"><span>{r.customer} · {r.name}</span><span className="num">{r.end_on ? r.end_on.slice(5).replace("-", "/") : `${r.remain}회`}</span></div>
      ))}
    </Fold>
  );
}

function CustomerRow({ branch }: { branch: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    sb.rpc("customer_list", { p_q: null, p_branch: branch, p_filter: "all", p_limit: 1, p_offset: 0 }).then(({ data, error }) => {
      if (on) setN(error ? null : Number((data as { total: number }[] | null)?.[0]?.total ?? 0));
    });
    return () => { on = false; };
  }, [branch]);
  return <Fold title="고객 현황" value={n === null ? "-" : `${n.toLocaleString()}명`} href="/customers" />;
}

function ByStaffRow({ rows, staffName }: { rows: Rsv[]; staffName: (id: string) => string }) {
  const m = new Map<string, number>();
  rows.filter((r) => r.status === "예약" || r.status === "완료").forEach((r) => m.set(r.staff_id || "", (m.get(r.staff_id || "") ?? 0) + 1));
  const list = [...m.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <Fold title="담당자별 예약" value={`${list.filter(([k]) => k).length}명`}>
      {list.length === 0 && <div className="sb-none">이 날 예약이 없어요</div>}
      {list.map(([k, v]) => <div key={k} className="sb-row sm"><span>{k ? staffName(k) : "담당 미정"}</span><span className="num">{v}건</span></div>)}
    </Fold>
  );
}
