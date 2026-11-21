"use client";
import { dot, type Col, type Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, StTitle, useStats } from "../ui";
import { SumFilter, itemCols, kindCountCols, useSum } from "./filter";

export default function SumByDay() {
  const { branch } = useStats();
  const sum = useSum("day");
  const { query, setQuery, rows, money, err } = sum;
  const cols: Col[] = [["label", "날짜", "text"], ["cnt", "건수", "num"], ...itemCols(query.items, money), ...kindCountCols];
  const view: Row[] = (rows ?? []).map((r) => ({ ...r, label: dot(String(r.k)) }));
  const { ready } = { ready: sum.ready };
  return (
    <>
      <StTitle title="날짜별 집계" meta={`${branch ?? "전 지점"} · ${query.label.replace(/^\d{4}년 /, "")}`} />
      <SumFilter query={query} onApply={setQuery} ready={ready}
        right={<ExportBtns name={`날짜별집계_${branch ?? "전지점"}_${query.label}`} cols={cols} rows={view} disabled={!view.length} />} />
      {err ? <Empty text={err} />
        : rows === null ? <div className="st-skel">불러오는 중…</div>
        : !view.length ? <Empty text={`${query.label}에는 결제 기록이 없어요`} sub="뷰티사랑넷 매출 엑셀을 옮기거나 예약에서 결제하면 바로 채워져요." />
        : <DataTable cols={cols} rows={view} />}
    </>
  );
}
