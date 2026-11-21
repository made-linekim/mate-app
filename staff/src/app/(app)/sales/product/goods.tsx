"use client";
/* 제품 (판매 · 매입 · 재고 · 미지급금 · 거래처 · 제품 항목) 공용. 접두어 gd-
   구조는 뷰티사랑넷 제품 메뉴, 모양은 MERA 매출 화면·새 예약 팝업과 같은 틀. 서버: 041 SQL (goods_*) */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sb, BRANCHES, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { won } from "@/lib/sales";
import { useSales } from "../ui";
import "./goods.css";

export type Goods = {
  id: string; branch: string; category: string; name: string; price: number; cost: number; vendor_id: string | null; vendor: string | null;
  safe_qty: number; on_sale: boolean; sort: number; stock: number; last_in: string | null;
};
export type Vendor = { id: string; branch: string; name: string; phone: string; manager: string; memo: string; active: boolean; goods: number };

export const SUBS = [
  { href: "/sales/product", label: "판매" },
  { href: "/sales/product/buy", label: "매입" },
  { href: "/sales/product/stock", label: "재고" },
  { href: "/sales/product/payable", label: "미지급금" },
  { href: "/sales/product/vendors", label: "거래처" },
  { href: "/sales/product/items", label: "제품 항목" },
];

/* 041 SQL 이 아직 없으면 알아듣게 */
export const friendly = (m: string) =>
  /goods_|pay_checkout|function|schema cache/i.test(m) && /not find|does not exist|schema cache/i.test(m)
    ? "제품 서버 준비 중이에요 (041 SQL 실행 전). 실행하면 바로 쓸 수 있어요."
    : m.replace(/^.*?ERROR:\s*/, "");

export function SubNav({ right }: { right?: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="gd-sub">
      <nav>
        {SUBS.map((s) => (
          <Link key={s.href} href={s.href} className={(s.href === "/sales/product" ? path === s.href : path.startsWith(s.href)) ? "on" : ""}>{s.label}</Link>
        ))}
      </nav>
      {right && <div className="gd-sub-r">{right}</div>}
    </div>
  );
}

/* 지점 하나가 꼭 필요한 화면(재고 등): 헤더가 '전 지점'이면 첫 지점 */
export function useOneBranch() {
  const me = useMe();
  const { branch } = useSales();
  return branch ?? (me.tier === "owner" ? BRANCHES[0] : me.branch);
}

export function useGoods(branch: string) {
  const [rows, setRows] = useState<Goods[]>([]);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("goods_list", { p_branch: branch });
    setReady(true);
    if (error) { setErr(friendly(error.message)); setRows([]); return; }
    setErr(""); setRows((data ?? []) as Goods[]);
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  return { rows, err, ready, load };
}

export function useVendors(branch: string) {
  const [rows, setRows] = useState<Vendor[]>([]);
  const load = useCallback(async () => {
    const { data } = await sb.rpc("goods_vendor_list", { p_branch: branch });
    setRows((data ?? []) as Vendor[]);
  }, [branch]);
  useEffect(() => { load(); }, [load]);
  return { rows, load };
}

export function useStaff(branch: string) {
  const [rows, setRows] = useState<Staff[]>([]);
  useEffect(() => {
    sb.from("staff_accounts").select("*").eq("branch", branch).eq("status", "active").order("name")
      .then(({ data }) => setRows((data ?? []) as Staff[]));
  }, [branch]);
  return rows;
}

/* 금액 입력: 숫자만, 천 단위 쉼표 */
export function Money({ value, onChange, disabled, ph }: { value: number; onChange: (n: number) => void; disabled?: boolean; ph?: string }) {
  return (
    <span className="gd-money">
      <input className="inp num" inputMode="numeric" disabled={disabled} placeholder={ph ?? "0"}
        value={value ? value.toLocaleString() : ""} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)} />
      <em>원</em>
    </span>
  );
}

export function Qty({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <span className="gd-qty">
      <button type="button" aria-label="하나 빼기" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input className="num" inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value.replace(/\D/g, "")) || 0))} />
      <button type="button" aria-label="하나 더하기" onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

/* 팝업 틀 (새 예약 팝업과 같은 모양: PC 가운데, 모바일 전체 화면) */
export function Modal({ title, sub, onClose, foot, children, wide }: {
  title: string; sub?: string; onClose: () => void; foot: React.ReactNode; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <aside className={`drawer rd rd-modal gd-modal ${wide ? "wide" : ""}`} style={{ zIndex: 41 }} role="dialog" aria-label={title}>
        <div className="hd"><span>{title}</span>{sub && <span className="rd-sub">{sub}</span>}<button className="rd-x" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="닫기">×</button></div>
        <div className="bd">{children}</div>
        <div className="ft">{foot}</div>
      </aside>
    </>
  );
}

/* 제품 고르기 팝업: 분류 탭 + 체크 (뷰티사랑넷 제품 선택 흐름) */
export function GoodsPicker({ goods, picked, onDone, onClose, showStock, priceOf }: {
  goods: Goods[]; picked: string[]; onDone: (ids: string[]) => void; onClose: () => void; showStock?: boolean; priceOf?: (g: Goods) => number;
}) {
  const [cat, setCat] = useState("전체");
  const [sel, setSel] = useState<string[]>(picked);
  const [q, setQ] = useState("");
  const list = goods.filter((g) => g.on_sale);
  const cats = useMemo(() => ["전체", ...Array.from(new Set(list.map((g) => g.category)))], [list]);
  const shown = list.filter((g) => (cat === "전체" || g.category === cat) && (!q.trim() || g.name.includes(q.trim())));
  const groups = useMemo(() => {
    const m = new Map<string, Goods[]>();
    shown.forEach((g) => m.set(g.category, [...(m.get(g.category) ?? []), g]));
    return [...m.entries()];
  }, [shown]);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Modal title="제품 선택" sub={sel.length ? `${sel.length}개 골랐어요` : undefined} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>닫기</button><button className="btn p" onClick={() => onDone(sel)}>선택 완료{sel.length ? ` (${sel.length})` : ""}</button></>}>
      <input className="inp" placeholder="제품 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="gd-cats">
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      {groups.length === 0 && <p className="gd-none">{list.length ? "찾는 제품이 없어요" : "등록한 제품이 없어요. ‘제품 항목’에서 먼저 추가해 주세요."}</p>}
      {groups.map(([c, gs]) => (
        <div key={c} className="gd-grp">
          <div className="gd-grp-h">{c}</div>
          {gs.map((g) => (
            <label key={g.id} className={`gd-pick ${sel.includes(g.id) ? "on" : ""}`}>
              <span className="tx"><b>{g.name}</b>
                <span className="num">{won(priceOf ? priceOf(g) : g.price)}원{showStock && <> · 재고 <em className={g.stock <= g.safe_qty ? "low" : ""}>{g.stock}</em>개</>}</span></span>
              <input type="checkbox" checked={sel.includes(g.id)} onChange={() => toggle(g.id)} />
            </label>
          ))}
        </div>
      ))}
    </Modal>
  );
}

/* 고객 찾기 (새 예약 팝업과 같은 customer_list) */
export type Cust = { key: string; name: string; phone?: string | null; customer_no?: string | null };
export function CustSearch({ branch, value, onPick }: { branch: string; value: Cust | null; onPick: (c: Cust | null) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Cust[] | null>(null);
  useEffect(() => {
    if (value || q.trim().length < 1) { setFound(null); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.rpc("customer_list", { p_q: q.trim(), p_branch: branch, p_filter: "all", p_limit: 8, p_offset: 0 });
      setFound((data ?? []) as Cust[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, value, branch]);
  if (value) {
    return (
      <div className="gd-cust on">
        <b>{value.name}</b>{value.phone && <span className="num">{value.phone}</span>}
        <button className="btn sm t" style={{ marginLeft: "auto" }} onClick={() => { onPick(null); setQ(""); }}>바꾸기</button>
      </div>
    );
  }
  return (
    <div className="gd-cust-wrap">
      <input className="inp" autoFocus placeholder="이름 또는 전화번호로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      {found && (
        <div className="gd-found">
          {found.length === 0 && <div className="gd-none" style={{ padding: 12 }}>찾는 고객이 없어요</div>}
          {found.map((c) => (
            <button key={c.key} onClick={() => onPick(c)}><b>{c.name}</b><span className="num">{c.phone ?? ""}</span></button>
          ))}
        </div>
      )}
    </div>
  );
}

/* 한 줄 합계 (뷰티사랑넷 '총계' 줄) */
export function TotalBar({ items }: { items: [string, number | string, boolean?][] }) {
  return (
    <div className="gd-total">
      {items.map(([k, v, em]) => (
        <span key={k} className={em ? "em" : ""}><i>{k}</i><b className="num">{typeof v === "number" ? won(v) : v}</b></span>
      ))}
    </div>
  );
}

export const kday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const mdhm = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${k.getUTCMonth() + 1}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
};
export const mdOf = (d: string | null) => (d ? `${+d.slice(5, 7)}.${d.slice(8, 10)}` : "-");
