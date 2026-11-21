"use client";
import type { Col, Row } from "@/lib/stats";
import { DataTable, Empty, ExportBtns, StTitle, useStats } from "../../ui";
import { SumFilter, itemCols, useSum } from "../filter";

export default function SumByStaff() {
  const { branch } = useStats();
  const { query, setQuery, rows, money, err, ready } = useSum("staff");
  const cols: Col[] = [
    ["label", "담당", "text"], ["title", "역할", "text"], ["cnt", "건수", "num"], ...itemCols(query.items, money),
    ["n_svc", "관리", "num"], ["n_mem", "회원권", "num"], ["n_prod", "제품", "num"], ["n_ticket", "회차권", "cnt"],
  ].filter((c, i, a) => a.findIndex((x) => x[0] === c[0]) === i) as Col[];
  const view: Row[] = (rows ?? []).map((r) => ({ ...r, label: String(r.k), title: r.title ?? "-" }));
  return (
    <>
      <StTitle title="담당자별 집계" meta={`${branch ?? "전 지점"} · ${query.label.replace(/^\d{4}년 /, "")}`} />
      <SumFilter query={query} onApply={setQuery} ready={ready} compact
        help={`${query.label.replace(/^\d{4}년 /, "")} · ${branch ?? "전 지점"}${rows ? ` · 직원 ${view.length}명` : ""} · 조회됨`}
        right={<ExportBtns name={`담당자별집계_${branch ?? "전지점"}_${query.label}`} cols={cols} rows={view} disabled={!view.length} />} />
      {err ? <Empty text={err} />
        : rows === null ? <div className="st-skel">불러오는 중…</div>
        : !view.length ? <Empty text={`${query.label}에는 결제 기록이 없어요`} sub="뷰티사랑넷 매출 엑셀을 옮기거나 예약에서 결제하면 바로 채워져요." />
        : <DataTable cols={cols} rows={view} totalLabel={`합계 · ${view.length}명`} />}
    </>
  );
}
