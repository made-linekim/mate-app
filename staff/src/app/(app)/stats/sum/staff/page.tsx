"use client";
import type { Col, Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, Info, useStats } from "../../ui";
import { SumFilter, itemCols, useSum } from "../filter";

export default function SumByStaff() {
  const { branch } = useStats();
  const { query, setQuery, rows, money, err } = useSum("staff");
  const cols: Col[] = [
    ["label", "담당", "text"], ["title", "직책", "text"], ["cnt", "건수", "num"], ...itemCols(query.items, money),
    ["n_svc", "관리", "num"], ["n_mem", "회원권", "num"], ["n_prod", "제품", "num"], ["n_ticket", "회차권", "num"],
  ].filter((c, i, a) => a.findIndex((x) => x[0] === c[0]) === i) as Col[];
  const view: Row[] = (rows ?? []).map((r) => ({ ...r, label: String(r.k), title: r.title ?? "-" }));
  return (
    <>
      <div className="st-dhead">
        <h2>담당자별 집계</h2>
        <span className="st-meta">{branch ?? "전 지점"} · {query.label}</span>
        <Info text={money ? "매출에 적힌 담당자 기준이에요. 담당이 비어 있으면 '미지정'으로 모여요." : "매출 권한이 없어서 본인 건수만 보여요."} />
        <div className="st-sp" />
        <ExportBtns name={`담당자별집계_${branch ?? "전지점"}_${query.label}`} cols={cols} rows={view} disabled={!view.length} />
      </div>
      <SumFilter query={query} onApply={setQuery} staffCount={rows ? view.length : undefined} />
      {err ? <Empty text={err} />
        : rows === null ? <div className="st-skel">불러오는 중…</div>
        : !view.length ? <Empty text={`${query.label}에는 결제 기록이 없어요`} sub="뷰티사랑넷 매출 엑셀을 옮기거나 예약에서 결제하면 바로 채워져요." />
        : <DataTable cols={cols} rows={view} totalLabel={`합계 · ${view.length}명`} />}
    </>
  );
}
