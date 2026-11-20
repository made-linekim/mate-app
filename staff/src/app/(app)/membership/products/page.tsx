"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { canSee, won } from "@/lib/sales";
import { friendly, useMb, SearchIcon } from "../ui";

type P = {
  id: string; branch: string; name: string; kind: string; valid_days: number | null; price: number | null;
  face_amount: number | null; share_ok: boolean; swap_ok: boolean; app_visible: boolean; on_sale: boolean;
  items: { program_id: string; program: string; count: number; unit_price: number }[]; sold: number;
};
const KINDS = [null, "회차", "기간", "금액"] as const;
const period = (d: number | null) => (!d ? "-" : d % 365 === 0 ? `${(d / 365) * 12}개월` : d % 30 === 0 ? `${d / 30}개월` : `${d}일`);

export default function Products() {
  const me = useMe();
  const { branch } = useMb();
  const [kind, setKind] = useState<string | null>("회차");
  const [sale, setSale] = useState(true);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<P[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const editable = canSee(me, "settings.edit");

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

  const s = q.trim();
  const list = rows.filter((r) => (!sale || r.on_sale) && (!s || r.name.includes(s) || r.items.some((i) => i.program.includes(s))));
  return (
    <>
      <div className="mb-bar">
        <div className="seg">
          {KINDS.map((k) => <button key={k ?? "all"} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k ? `${k}권` : "전체"}</button>)}
        </div>
        <label className="mb-check"><input type="checkbox" checked={!sale} onChange={(e) => setSale(!e.target.checked)} />판매 끝난 것도 보기</label>
        <label className="mb-search" style={{ marginLeft: "auto" }}>
          <SearchIcon />
          <input className="inp" placeholder="상품 이름" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {err && <p className="mb-err">{err}</p>}
      <div className="mb-card first">
        <div className="mb-scroll">
          <table className="mb-t">
            <thead>
              <tr>
                <th>회원권명</th><th>관리명</th><th className="r">관리 회차</th><th className="r">금액</th>
                <th>유효기간</th><th>나눠쓰기 · 고객앱</th><th>적용</th><th className="r">판매 건수</th><th>관리</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const cnt = p.items.reduce((a, i) => a + (i.count || 0), 0);
                return (
                  <tr key={p.id} className={p.on_sale ? "" : "off"}>
                    <td className="nm">{p.name}{!p.on_sale && <span className="badge" style={{ marginLeft: 8 }}>판매 끝</span>}</td>
                    <td>{p.items.length ? p.items.map((i) => i.program).join(" · ") : "-"}</td>
                    <td className="r">{cnt || "-"}</td>
                    <td className="r">{p.price ? won(p.price) : p.face_amount ? won(p.face_amount) : "-"}</td>
                    <td>{period(p.valid_days)}</td>
                    <td className="mute">{[p.share_ok && "나눠쓰기", p.app_visible && "고객앱"].filter(Boolean).join(" · ") || "-"}</td>
                    <td>{p.branch ? p.branch : "전 지점"}</td>
                    <td className="r">{p.sold}</td>
                    <td>
                      {editable ? (
                        <Link href="/settings/products" className="mb-ic" title="설정에서 고치기" aria-label={`${p.name} 고치기`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="m13.5 6.5 4 4" /></svg>
                        </Link>
                      ) : <span className="mute">-</span>}
                    </td>
                  </tr>
                );
              })}
              {!loading && list.length === 0 && !err && <tr><td colSpan={9} className="mb-empty">상품이 없어요</td></tr>}
              {loading && rows.length === 0 && <tr><td colSpan={9} className="mb-empty">불러오는 중</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mb-note">상품 추가·수정은 설정 › 회원권 상품에서 해요.</p>
    </>
  );
}
