"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { won } from "@/lib/sales";
import { LedgerScreen, Kpi, salesArgs, type Query } from "../ui";

type Tot = { n: number; amt: number } | null;

/* 판매 금액 · 회차권 · 기간권 합계 (서버 합계 한 줄씩) */
function MembershipKpis({ query }: { query: Query }) {
  const [t, setT] = useState<Tot[]>([null, null, null]);
  const key = JSON.stringify({ ...query, kinds: null });
  useEffect(() => {
    let on = true;
    const one = (kinds: string[] | null) => sb.rpc("sales_list", salesArgs({ ...query, kinds }, 1, 0)).then(({ data }) => {
      const h = (data ?? [])[0] as { total: number; sum_amount: number } | undefined;
      return h ? { n: Number(h.total), amt: Number(h.sum_amount) } : { n: 0, amt: 0 };
    });
    Promise.all([one(query.kinds ?? null), one(["회차회원권"]), one(["기간회원권"])]).then((r) => on && setT(r));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(query.kinds)]);
  const v = (x: Tot) => (x ? won(x.amt) : "-");
  const s = (x: Tot) => (x ? `${x.n.toLocaleString()}건` : "");
  return (
    <div className="sl-kpis">
      <Kpi label="판매 금액" value={v(t[0])} unit="원" sub={s(t[0])} em />
      <Kpi label="회차권" value={v(t[1])} unit="원" sub={s(t[1])} />
      <Kpi label="기간권" value={v(t[2])} unit="원" sub={s(t[2])} />
      <Kpi label="금액권" value="-" sub="매출 구분이 아직 없어요" />
    </div>
  );
}

export default function MembershipSales() {
  return (
    <LedgerScreen tab="membership" csvName="회원권매출"
      top={(q) => <MembershipKpis query={q} />}
      cols={["day", "customer", "staff", ["content", "회원권"], "mkind", ["amount", "금액"], "card", "cash", "account", "npay", ["unpaid", "미수"], "discount", "point"]}
      opt={["npay", "discount", "point"]}
      kinds={[{ k: "회차회원권", l: "회차권" }, { k: "기간회원권", l: "기간권" }]} />
  );
}
