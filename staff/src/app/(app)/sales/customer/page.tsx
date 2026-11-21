"use client";
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { TABS, tabOk, won, downloadCsv, todayKST, type Sale } from "@/lib/sales";
import {
  SalesTable, FilterRows, useFilters, useSales, useExport, fetchAllSales, friendly, mdy, Z, Pager, SlTool, rangeHelp,
} from "../ui";

type Agg = {
  id: string; branch: string; key: string; name: string; staff: string | null; n: number; amount: number;
  card: number; cash: number; account: number; npay: number; unpaid: number; sess: number; last: string;
};
type Hit = { key: string; branch: string; name: string; phone: string | null; membership: string | null; last_visit_on: string | null };
const PAGE = 50;
const sessN = (s: string | null) => (s ? (s.match(/\d+/g) ?? []).reduce((a, x) => a + Number(x), 0) : 0);

export default function CustomerSales() {
  const me = useMe();
  const allTab = TABS.find((t) => t.tab === "all")!;
  // 기간 전체 매출을 고객별로 묶으려면 전체 매출 권한이 필요해요. 없으면 고객을 찾아서 한 명씩 봐요.
  return tabOk(me, allTab.keys) ? <ByCustomer /> : <SearchOne />;
}

function ByCustomer() {
  const me = useMe();
  const { range, mode, branch } = useSales();
  const [f, setF] = useFilters();
  const [rows, setRows] = useState<Sale[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pick, setPick] = useState<Agg | null>(null);
  const query = { tab: "all" as const, range, branch, staff: f.staff, q: f.q };
  const key = JSON.stringify(query);

  useEffect(() => {
    let on = true;
    setLoading(true); setPage(0);
    fetchAllSales(query, 10000).then(({ rows, err }) => {
      if (!on) return;
      setRows(rows); setErr(err); setLoading(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const list = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const s of rows) {
      if (!s.customer_key) continue;
      const id = `${s.branch}:${s.customer_key}`;
      let g = m.get(id);
      if (!g) {
        // 최신 순으로 오니 처음 본 담당자 = 최근 결제 담당자
        g = { id, branch: s.branch, key: s.customer_key, name: s.customer_name, staff: s.staff_name, n: 0, amount: 0, card: 0, cash: 0, account: 0, npay: 0, unpaid: 0, sess: 0, last: s.day };
        m.set(id, g);
      }
      g.n++; g.amount += s.amount ?? 0; g.card += s.card ?? 0; g.cash += s.cash ?? 0; g.account += s.account ?? 0;
      g.npay += s.npay ?? 0; g.unpaid += s.unpaid ?? 0; g.sess += sessN(s.sessions);
      if (s.day > g.last) g.last = s.day;
    }
    return [...m.values()].sort((a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : b.amount - a.amount));
  }, [rows]);

  const sum = useMemo(() => list.reduce((a, g) => ({
    n: a.n + g.n, amount: a.amount + g.amount, card: a.card + g.card, cash: a.cash + g.cash, account: a.account + g.account,
    npay: a.npay + g.npay, unpaid: a.unpaid + g.unpaid, sess: a.sess + g.sess,
  }), { n: 0, amount: 0, card: 0, cash: 0, account: 0, npay: 0, unpaid: 0, sess: 0 }), [list]);

  useExport(list.length ? () => downloadCsv(`고객별매출_${range.from}_${range.to}.csv`,
    ["지점", "고객", "담당자", "결제 건수", "결제 금액", "카드", "현금", "계좌이체", "NPay", "미수", "회차 차감", "최근 결제"],
    list.map((g) => [g.branch, g.name, g.staff, g.n, g.amount, g.card, g.cash, g.account, g.npay, g.unpaid, g.sess, g.last])) : null);

  const [qq, setQq] = useState("");
  const shown = qq.trim() ? list.filter((g) => g.name.includes(qq.trim())) : list;
  const view = shown.slice(page * PAGE, page * PAGE + PAGE);
  const tot = shown.reduce((a, g) => ({ n: a.n + g.n, amount: a.amount + g.amount, card: a.card + g.card, cash: a.cash + g.cash, unpaid: a.unpaid + g.unpaid }), { n: 0, amount: 0, card: 0, cash: 0, unpaid: 0 });
  void me; void sum;

  return (
    <div className="sl3-led">
      <SlTool help={rangeHelp(range, branch, !loading)}
        cond={<FilterRows f={f} setF={setF} />}
        right={<input className="inp sl3-q" placeholder="고객 이름 · 전화" value={qq} onChange={(e) => { setQq(e.target.value); setPage(0); }} onKeyDown={(e) => { if (e.key === "Enter") setF({ ...f, q: qq.trim() }); }} />} />
      {err && <p className="sl-err">{err}</p>}
      <div className="sl3-card">
        <div className="sl-scroll">
          <table className="sl3-t sl3-cust">
            <thead>
              <tr>
                <th>고객</th><th>담당</th><th className="r">건수</th><th className="r">결제 금액</th>
                <th className="r">카드</th><th className="r">현금</th><th className="r">미수</th><th className="r">회차 차감</th><th>최근 결제</th>
              </tr>
            </thead>
            <tbody>
              {view.map((g) => (
                <tr key={g.id} className="go" onClick={() => setPick(g)} title="눌러서 결제 내역 보기">
                  <td>{g.name}</td><td>{g.staff || "-"}</td>
                  <td className="r">{g.n}</td><td className="r"><Z n={g.amount} /></td>
                  <td className="r"><Z n={g.card} /></td><td className="r"><Z n={g.cash} /></td>
                  <td className="r"><Z n={g.unpaid} /></td><td className="r">{g.sess ? `${g.sess}회` : <span className="sl-z">—</span>}</td><td>{mdy(g.last)}</td>
                </tr>
              ))}
              {!loading && shown.length === 0 && !err && <tr><td colSpan={9} className="sl-empty">이 기간에 매출 기록이 없어요</td></tr>}
              {loading && <tr><td colSpan={9} className="sl-empty">불러오는 중</td></tr>}
            </tbody>
            {view.length > 0 && (
              <tfoot>
                <tr><td>합계 · {shown.length.toLocaleString()}명</td><td /><td className="r">{tot.n.toLocaleString()}</td><td className="r">{won(tot.amount)}</td>
                  <td className="r">{won(tot.card)}</td><td className="r">{won(tot.cash)}</td><td className="r">{won(tot.unpaid)}</td><td /><td /></tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {shown.length > PAGE && <Pager page={page} pages={Math.ceil(shown.length / PAGE)} onChange={setPage} />}
      {pick && <Detail who={{ name: pick.name, branch: pick.branch, key: pick.key }} onClose={() => setPick(null)} />}
    </div>
  );
}

function Detail({ who, onClose }: { who: { name: string; branch: string; key: string }; onClose: () => void }) {
  const me = useMe();
  const { range } = useSales();
  const byCustomer = tabOk(me, TABS.find((t) => t.tab === "customer")!.keys);
  const [whole, setWhole] = useState(false);
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer lg">
        <div className="hd">{who.name} 결제 내역</div>
        <div className="bd">
          <div className="sl-row">
            <button className={`chip ${!whole ? "on" : ""}`} onClick={() => setWhole(false)}>조회 기간 ({range.from.slice(5).replace("-", ".")} ~ {range.to.slice(5).replace("-", ".")})</button>
            <button className={`chip ${whole ? "on" : ""}`} onClick={() => setWhole(true)}>전체 기간</button>
          </div>
          <SalesTable inline csvName={`고객별매출_${who.name}`}
            cols={["when", "staff", "kind", "content", "memo", "amount", "card", "cash", "account", "npay", "unpaid", "settled", "discount", "point", "sessions"]}
            opt={["npay", "discount", "point", "settled"]}
            query={{ tab: byCustomer ? "customer" : "all", range: whole ? { from: "2000-01-01", to: todayKST() } : range, branch: who.branch, customer_key: who.key }} />
        </div>
        <div className="ft"><button className="btn" onClick={onClose}>닫기</button></div>
      </div>
    </>
  );
}

/* 전체 매출 권한 없이 고객별 매출만 볼 수 있을 때: 고객 찾기 → 한 명씩 */
function SearchOne() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState<Hit | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    const { data, error } = await sb.rpc("customer_list", { p_q: v, p_branch: null, p_filter: "all", p_limit: 20, p_offset: 0 });
    setErr(error ? friendly(error.message) : "");
    setHits((data ?? []) as Hit[]);
  }

  return (
    <>
      <div className="sl-cond">
        <form className="sl-cond-bar" onSubmit={search}>
          <b>고객</b>
          <input className="inp" style={{ maxWidth: 280, height: 32 }} placeholder="이름 또는 연락처 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm">검색</button>
        </form>
      </div>
      {err && <p className="sl-err">{err}</p>}
      {hits && (
        <div className="sl-card">
          <div className="sl-scroll">
            <table className="sl-t">
              <thead><tr><th>고객</th><th>연락처</th><th>지점</th><th>회원권</th><th>최근 방문</th><th /></tr></thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={`${h.branch}:${h.key}`}>
                    <td className="nm">{h.name}</td><td>{h.phone || "-"}</td><td>{h.branch}</td><td>{h.membership || "-"}</td>
                    <td>{mdy(h.last_visit_on)}</td>
                    <td className="r"><button className="btn sm" onClick={() => setPick(h)}>매출 보기</button></td>
                  </tr>
                ))}
                {hits.length === 0 && <tr><td colSpan={6} className="sl-empty">찾는 고객이 없어요</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {pick && <Detail who={{ name: pick.name, branch: pick.branch, key: pick.key }} onClose={() => setPick(null)} />}
    </>
  );
}
