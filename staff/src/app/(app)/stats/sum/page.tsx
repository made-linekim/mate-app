"use client";
import { dot, type Col, type Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, Info, useStats } from "../ui";
import { SumFilter, itemCols, kindCountCols, useSum } from "./filter";

export default function SumByDay() {
  const { branch } = useStats();
  const { query, setQuery, rows, money, err } = useSum("day");
  const cols: Col[] = [["label", "날짜", "text"], ["cnt", "건수", "num"], ...itemCols(query.items, money), ...kindCountCols];
  const view: Row[] = (rows ?? []).map((r) => ({ ...r, label: dot(String(r.k)) }));
  return (
    <>
      <div className="st-dhead">
        <h2>날짜별 집계</h2>
        <span className="st-meta">{branch ?? "전 지점"} · {query.label}</span>
        <Info text={money ? "결제가 있었던 날만 보여요. 항목에서 카드·현금 같은 칸을 더 켤 수 있어요." : "매출 권한이 없어서 건수만 보여요."} />
        <div className="st-sp" />
        <ExportBtns name={`날짜별집계_${branch ?? "전지점"}_${query.label}`} cols={cols} rows={view} disabled={!view.length} />
      </div>
      <SumFilter query={query} onApply={setQuery} />
      {err ? <Empty text={err} />
        : rows === null ? <div className="st-skel">불러오는 중…</div>
        : !view.length ? <Empty text={`${query.label}에는 결제 기록이 없어요`} sub="뷰티사랑넷 매출 엑셀을 옮기거나 예약에서 결제하면 바로 채워져요." />
        : <DataTable cols={cols} rows={view} />}
    </>
  );
}
