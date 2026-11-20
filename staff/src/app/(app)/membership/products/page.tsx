"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/sb";
import { won } from "@/lib/sales";
import { BranchOne, friendly, useBranchPick } from "../ui";

type P = {
  id: string; branch: string; name: string; kind: string; valid_days: number | null; price: number | null;
  face_amount: number | null; share_ok: boolean; swap_ok: boolean; app_visible: boolean; on_sale: boolean;
  items: { program_id: string; program: string; count: number; unit_price: number }[]; sold: number;
};
const KINDS = [null, "회차", "기간", "금액"] as const;

export default function Products() {
  const [branch, setBranch] = useState(useBranchPick());
  const [kind, setKind] = useState<string | null>(null);
  const [sale, setSale] = useState(true);
  const [rows, setRows] = useState<P[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    sb.rpc("membership_products", { p_branch: branch, p_kind: kind }).then(({ data, error }) => {
      if (!on) return;
      setErr(error ? friendly(error.message) : "");
      setRows((data ?? []) as P[]);
      setLoading(false);
    });
    return () => { on = false; };
  }, [branch, kind]);

  const list = rows.filter((r) => !sale || r.on_sale);
  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg">
          {KINDS.map((k) => <button key={k ?? "all"} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k ? `${k}권` : "전체"}</button>)}
        </div>
        <div className="seg">
          <button className={sale ? "on" : ""} onClick={() => setSale(true)}>판매 중</button>
          <button className={!sale ? "on" : ""} onClick={() => setSale(false)}>판매 끝난 것 포함</button>
        </div>
        <span style={{ marginLeft: "auto" }}><BranchOne value={branch} onChange={setBranch} /></span>
      </div>
      {err && <p style={{ color: "var(--red)" }}>{err}</p>}
      <div className="card" style={{ padding: 0, overflowX: "auto", marginTop: 16 }}>
        <table className="t">
          <thead>
            <tr>
              <th>회원권명</th><th>종류</th><th>포함 관리</th><th style={{ textAlign: "right" }}>금액</th>
              <th style={{ textAlign: "right" }}>유효기간</th><th>나눠쓰기</th><th>고객앱 노출</th><th>적용</th>
              <th style={{ textAlign: "right" }}>판매 건수</th><th>상태</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ color: p.on_sale ? undefined : "var(--ink-3)" }}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{p.kind}</td>
                <td style={{ fontSize: "var(--fs-sm)" }}>{p.items.length ? p.items.map((i) => `${i.program}${i.count ? ` ${i.count}회` : ""}`).join(", ") : "-"}</td>
                <td className="num" style={{ textAlign: "right" }}>{p.price ? `${won(p.price)}원` : "-"}</td>
                <td className="num" style={{ textAlign: "right" }}>{p.valid_days ? `${p.valid_days}일` : "-"}</td>
                <td>{p.share_ok ? "가능" : "-"}</td>
                <td>{p.app_visible ? "보임" : "-"}</td>
                <td>{p.branch ? p.branch : "전 지점"}</td>
                <td className="num" style={{ textAlign: "right" }}>{p.sold}</td>
                <td><span className={`badge ${p.on_sale ? "ok" : ""}`}>{p.on_sale ? "판매 중" : "판매 끝"}</span></td>
              </tr>
            ))}
            {!loading && list.length === 0 && !err && (
              <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--ink-3)" }}>상품이 없어요</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)" }}>상품 추가·수정은 설정 › 회원권 상품에서 해요.</p>
    </>
  );
}
