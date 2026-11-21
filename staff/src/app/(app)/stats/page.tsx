"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee } from "@/lib/sales";
import { CATS, REPORTS, type ReportDef, type Span } from "@/lib/stats";
import { Info, StTitle } from "./ui";

const SPANS: (Span | "전체" | "비교")[] = ["전체", "연간", "월간", "일간", "비교"];
// 직원(일반 권한)은 본인 결제로 계산되는 리포트만 (049 SQL 과 같은 목록)
const OWN_OK = ["sales_month", "sales_year", "sales_day", "sales_kind", "sales_method", "sales_staff", "sales_service", "receivable"];
const DEF_FAV = ["sales_month", "cust_new", "rsv_status", "noshow_top"];

export default function ReportList() {
  const me = useMe();
  const money = canSee(me, "sales.others") || canSee(me, "sales.own");
  const [span, setSpan] = useState<Span | "전체" | "비교">("전체");
  const [favs, setFavs] = useState<string[]>(DEF_FAV);
  const [saved, setSaved] = useState(true);

  useEffect(() => {
    sb.rpc("stats_fav_list").then(({ data, error }) => {
      if (error) { setSaved(false); try { const l = localStorage.getItem("stats:favs"); if (l) setFavs(JSON.parse(l)); } catch {} return; }
      setFavs((data as string[]) ?? []);
    });
  }, []);

  async function toggle(id: string) {
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    setFavs(next);
    if (saved) {
      const { error } = await sb.rpc("stats_fav_toggle", { p_id: id });
      if (!error) return;
      setSaved(false);
    }
    try { localStorage.setItem("stats:favs", JSON.stringify(next)); } catch {}
  }

  const own = me.tier === "staff";
  const list = REPORTS.filter((r) => (money || !r.money) && (!own || OWN_OK.includes(r.id)) && (span === "전체" || (span === "비교" ? !!r.cmp : r.span === span || r.span === "전체")));
  const favList = favs.map((id) => list.find((r) => r.id === id)).filter(Boolean) as ReportDef[];

  return (
    <>
      <StTitle title="리포트" meta={me.tier === "owner" ? "전 지점 · 지점은 오른쪽 위에서" : me.branch}
        right={
          <div className="seg st3-spans st-noprint" role="tablist" aria-label="기간 종류">
            {SPANS.map((s) => <button key={s} role="tab" aria-selected={span === s} className={span === s ? "on" : ""} onClick={() => setSpan(s)}>{s}</button>)}
          </div>
        } />
      <p className="st3-fav">
        즐겨찾기{favList.length ? favList.map((r) => <span key={r.id}> · <Link href={`/stats/r/${r.id}`}>{r.title}</Link></span>) : <span className="st-muted"> · 별을 누르면 여기 모여요</span>}
        <Info text={`리포트를 누르면 표와 그래프로 봐요. 별을 누르면 즐겨찾기에 모여요.${own ? " 직원 권한은 본인 결제로 계산되는 리포트만 보여요." : ""}`} />
      </p>
      {CATS.map((c) => {
        const items = list.filter((r) => r.cat === c);
        if (!items.length) return null;
        return (
          <section key={c} className="st-sec">
            <h3>{c}</h3>
            <Grid items={items} favs={favs} onStar={toggle} />
          </section>
        );
      })}
      {!list.length && <p className="st-muted">이 기간 종류에 맞는 리포트가 없어요.</p>}
    </>
  );
}

function Grid({ items, favs, onStar }: { items: ReportDef[]; favs: string[]; onStar: (id: string) => void }) {
  return (
    <div className="st-grid">
      {items.map((r) => {
        const on = favs.includes(r.id);
        return (
          <div key={r.id} className="st-tile">
            <Link href={`/stats/r/${r.id}`} className="st-tile-a">
              <span className="badge">{r.cat}</span>
              <b>{r.title}</b>
              <span className="st-tile-d">{r.span} · {r.desc}</span>
            </Link>
            <button className={`st-star ${on ? "on" : ""}`} aria-label={on ? "즐겨찾기 빼기" : "즐겨찾기"} aria-pressed={on} onClick={() => onStar(r.id)}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6L12 16.6l-5 2.6 1-5.6-4-3.9 5.5-.8z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
