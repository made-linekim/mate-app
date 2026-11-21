"use client";
// 결제 창 — 시안 01-07 (왼쪽: 관리 결제 · 회차권 판매 · 기간권 판매 · 제품 판매 / 오른쪽: 결제 수단 · 받을 금액)
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import { type Program, DOW, dow } from "@/lib/schedule";

type Item = { id: string; program_id: string; program: string; left: number; total: number };
type Ms = { id: string; name: string; kind: string; end_on: string | null; shared?: boolean; owner?: string | null; items: Item[] };
type Prod = { id: string; name: string; kind: "회차" | "기간"; valid_days: number | null; price: number; items: { program_id: string; program: string; count: number }[] };
type Ctx = { customer: { name: string } | null; memberships: Ms[]; products: Prod[]; prices: Record<string, number> };
type Line = { program_id: string; name: string };
type Goods = { id: string; category: string; name: string; price: number; stock: number; on_sale: boolean };
export type PayRsv = { id: string; day: string; start_time: string; customer_key: string; customer_name: string; program_id: string | null; staff_name: string | null };

const won = (n: number) => n.toLocaleString("ko-KR");
const md = (d: string) => `${Number(d.slice(5, 7))}.${d.slice(8)}`;
const ymd = (d: string) => d.slice(2).replace(/-/g, ".");
const DISC = ["직원 할인", "회원 할인", "이벤트 할인", "기타 할인"];

function Num({ v, on, ro, label }: { v: number; on?: (n: number) => void; ro?: boolean; label?: string }) {
  return (
    <input className="inp num pm-num" inputMode="numeric" aria-label={label} readOnly={ro} value={won(v)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => on?.(Math.min(99999999, Number(e.target.value.replace(/\D/g, "")) || 0))} />
  );
}

export default function PayModal({ branch, rsv, programs, onClose, onDone }: {
  branch: string; rsv: PayRsv; programs: Program[]; onClose: () => void; onDone: () => void;
}) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"svc" | "cnt" | "per" | "prod">("svc");
  const [ded, setDed] = useState<Set<string>>(new Set());
  const [lines, setLines] = useState<Line[]>([]);
  const [showShared, setShowShared] = useState(false);
  const [extra, setExtra] = useState(0);
  const [vat, setVat] = useState(false);
  const [disc, setDisc] = useState(0);
  const [discT, setDiscT] = useState(DISC[0]);
  const [memo, setMemo] = useState("");
  const [sellId, setSellId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState(0);
  const [sellStart, setSellStart] = useState(rsv.day);
  const [pName, setPName] = useState("");
  // 제품: 제품 메뉴(재고)가 있으면 거기서 고르고 재고가 빠져요. 없으면 이름·금액 직접 입력
  const [goods, setGoods] = useState<Goods[] | null>(null);
  const [gq, setGq] = useState<Record<string, number>>({});
  useEffect(() => {
    sb.rpc("goods_list", { p_branch: branch }).then(({ data, error }) => setGoods(error ? null : ((data ?? []) as Goods[]).filter((g) => g.on_sale)));
  }, [branch]);
  const gLines = (goods ?? []).filter((g) => (gq[g.id] ?? 0) > 0).map((g) => ({ g, qty: gq[g.id] }));
  const gSub = gLines.reduce((a, x) => a + x.qty * x.g.price, 0);
  const setQty = (id: string, n: number) => setGq((q) => ({ ...q, [id]: Math.max(0, Math.min(99, n)) }));
  const [pQty, setPQty] = useState(1);
  const [pUnit, setPUnit] = useState(0);
  const [pay, setPay] = useState({ card: 0, cash: 0, account: 0, local: 0 });
  const [touched, setTouched] = useState(false);
  const [addPick, setAddPick] = useState("");

  useEffect(() => {
    sb.rpc("pay_context", { p_branch: branch, p_key: rsv.customer_key }).then(({ data, error }) => {
      if (error) { setErr(/pay_context|function/i.test(error.message) ? "결제 기능은 서버 준비(SQL 실행) 후에 쓸 수 있어요." : error.message); return; }
      const c = data as Ctx;
      setCtx(c);
      const p = programs.find((x) => x.id === rsv.program_id);
      if (p) setLines([{ program_id: p.id, name: p.name }]);
      // 예약한 관리와 같은 회차가 남은 회원권이 있으면 미리 체크 (본인 것 먼저, 만료 빠른 순)
      const hit = [...c.memberships].sort((a, b) => Number(!!a.shared) - Number(!!b.shared))
        .flatMap((m) => m.items).find((i) => i.program_id === rsv.program_id && i.left > 0);
      if (hit) setDed(new Set([hit.id]));
    });
  }, [branch, rsv.customer_key, rsv.program_id, programs]);

  const allItems = useMemo(() => (ctx?.memberships ?? []).flatMap((m) => m.items.map((i) => ({ ...i, ms: m }))), [ctx]);
  const dedItems = allItems.filter((i) => ded.has(i.id));
  const covered = new Set(dedItems.map((i) => i.program_id));
  const price = (pid: string) => ctx?.prices?.[pid] ?? 0;
  const svcAmt = lines.reduce((a, l) => a + (covered.has(l.program_id) ? 0 : price(l.program_id)), 0);
  const sell = ctx?.products.find((p) => p.id === sellId) ?? null;
  const sellAmt = sell ? sellPrice : 0;
  const useGoods = !!goods && goods.length > 0;
  const freeAmt = !useGoods && pName.trim() ? pQty * pUnit : 0;
  const prodAmt = useGoods ? gSub : freeAmt;
  const base = svcAmt + sellAmt + prodAmt + extra;
  const rsvBase = svcAmt + sellAmt + freeAmt + extra;          // 예약 결제로 남는 부분
  const vatAmt = vat ? Math.round(rsvBase * 0.1) + (useGoods ? Math.round(gSub * 0.1) : 0) : 0;
  const gross = base + vatAmt;
  const discount = Math.min(disc, gross);
  const due = gross - discount;
  const recv = pay.card + pay.cash + pay.account + pay.local;
  const unpaid = due - recv;
  useEffect(() => { if (!touched) setPay({ card: due, cash: 0, account: 0, local: 0 }); }, [due, touched]);
  const setP = (k: keyof typeof pay) => (n: number) => { setTouched(true); setPay((p) => ({ ...p, [k]: n })); };

  const sessions = dedItems.map((i) => `${i.program} 1회 차감`).join(", ");
  const own = (ctx?.memberships ?? []).filter((m) => !m.shared);
  const shared = (ctx?.memberships ?? []).filter((m) => m.shared);
  const msShown = showShared ? [...own, ...shared] : own;
  const flip = (id: string) => setDed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickSell = (p: Prod) => { if (sellId === p.id) { setSellId(null); return; } setSellId(p.id); setSellPrice(p.price); };

  const submit = async () => {
    setErr("");
    if (unpaid < 0) return setErr(`받은 금액이 ${won(-unpaid)}원 많아요.`);
    if (!dedItems.length && gross === 0) return setErr("차감하거나 결제할 내용이 없어요.");
    // 제품(재고)은 제품 판매로 따로 기록: 결제 수단은 카드 → 현금 → 계좌 → 지역화폐 순서로 제품 몫을 먼저 떼어요
    const gTotal = useGoods ? gSub + (vat ? Math.round(gSub * 0.1) : 0) : 0;
    const rsvGross = gross - gTotal;
    if (gTotal > 0 && !dedItems.length && rsvGross === 0) return setErr("관리 결제 없이 제품만 팔 때는 매출 › 제품 › 판매에서 입력해 주세요.");
    const rsvDisc = Math.min(discount, rsvGross);
    const gDisc = discount - rsvDisc;
    let need = gTotal - gDisc;
    const gPay = { card: 0, cash: 0, account: 0, local: 0 };
    for (const k of ["card", "cash", "account", "local"] as const) { const t = Math.min(pay[k], need); gPay[k] = t; need -= t; }
    const rPay = { card: pay.card - gPay.card, cash: pay.cash - gPay.cash, account: pay.account - gPay.account, local: pay.local - gPay.local };
    setBusy(true);
    const p = {
      deduct: dedItems.map((i) => ({ item_id: i.id, qty: 1 })),
      services: lines.map((l) => ({ program_id: l.program_id, name: l.name, amount: covered.has(l.program_id) ? 0 : price(l.program_id) })),
      extra: extra + (vat ? Math.round(rsvBase * 0.1) : 0),
      discount: rsvDisc,
      sell: sell ? { product_id: sell.id, name: sell.name, kind: sell.kind, start_on: sellStart, valid_days: sell.valid_days ?? 90, price: sellPrice,
        items: sell.items.map((i) => ({ program_id: i.program_id, total: i.count, service: 0 })) } : null,
      product: freeAmt > 0 ? { name: pQty > 1 ? `${pName.trim()} ${pQty}개` : pName.trim(), amount: freeAmt } : null,
      pay: rPay,
      memo: [discount > 0 ? discT : "", vat ? "부가세 포함" : "", memo.trim()].filter(Boolean).join(" · "),
      staff: rsv.staff_name ?? "",
    };
    const { error } = await sb.rpc("pay_checkout", { p_branch: branch, p_key: rsv.customer_key, p_rsv: rsv.id, p });
    if (error) { setBusy(false); return setErr(error.message); }
    if (gLines.length) {
      const g = await sb.rpc("goods_sale_create", { p_branch: branch, p: {
        customer_key: rsv.customer_key, lines: gLines.map((x) => ({ goods_id: x.g.id, qty: x.qty, price: x.g.price })),
        vat, discount: gDisc, pay: gPay, memo: memo.trim(), staff_name: rsv.staff_name ?? "" } });
      if (g.error) { setBusy(false); setErr(`관리 결제는 끝났어요. 제품 판매만 저장하지 못했어요: ${g.error.message} (매출 › 제품 › 판매에서 다시 입력해 주세요)`); return; }
    }
    setBusy(false);
    onDone();
  };

  const cnt = { svc: lines.length, cnt: sell?.kind === "회차" ? 1 : 0, per: sell?.kind === "기간" ? 1 : 0, prod: gLines.length || (freeAmt > 0 ? 1 : 0) };
  const TABS: [typeof tab, string][] = [["svc", "관리 결제"], ["cnt", "회차권 판매"], ["per", "기간권 판매"], ["prod", "제품 판매"]];
  const svcProgs = programs.filter((p) => p.grp !== "업무" && p.grp !== "행사");

  const sellList = (kind: "회차" | "기간") => {
    const list = (ctx?.products ?? []).filter((p) => p.kind === kind);
    return (
      <>
        {list.length === 0 && <p className="pm-empty">판매 중인 {kind}권 상품이 없어요. 설정 › 회원권 상품에서 만들 수 있어요.</p>}
        <div className="pm-prods">
          {list.map((p) => (
            <button key={p.id} className={`pm-prod ${sellId === p.id ? "on" : ""}`} onClick={() => pickSell(p)}>
              <b>{p.name}</b>
              <span className="num">{kind === "회차" ? p.items.map((i) => `${i.program} ${i.count}회`).join(" · ") || "-" : `${p.valid_days ?? 0}일`}</span>
              <em className="num">{won(p.price)}원</em>
            </button>
          ))}
        </div>
        {sell && sell.kind === kind && (
          <div className="pm-rows">
            <div className="pm-row"><span className="pm-k">판매 금액</span><div className="pm-v"><Num v={sellPrice} on={setSellPrice} label="판매 금액" /></div></div>
            <div className="pm-row"><span className="pm-k">시작일</span><div className="pm-v"><input type="date" className="inp" value={sellStart} onChange={(e) => e.target.value && setSellStart(e.target.value)} />
              <span className="pm-dim">{sell.valid_days ?? 90}일 사용</span></div></div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <div className="dim" style={{ zIndex: 50 }} onClick={onClose} />
      <div className="pm" role="dialog" aria-label="결제">
        <div className="pm-l">
          <div className="pm-hd">
            <b>결제</b>
            <span className="num">{rsv.customer_name} · {md(rsv.day)} ({DOW[dow(rsv.day)]}) {rsv.start_time.slice(0, 5)}{rsv.staff_name ? ` · 담당 ${rsv.staff_name}` : ""}</span>
            <button className="pm-x m-only" onClick={onClose} aria-label="닫기">×</button>
          </div>
          <div className="pm-tabs">
            {TABS.map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{cnt[k] > 0 && <i className="num">{cnt[k]}</i>}</button>
            ))}
          </div>
          {!ctx && !err && <p className="pm-empty">불러오는 중…</p>}
          {ctx && tab === "svc" && (
            <div className="pm-rows">
              <div className="pm-row">
                <span className="pm-k">회원권 차감</span>
                <div className="pm-v col">
                  {msShown.length === 0 && <span className="pm-dim">쓸 수 있는 회원권이 없어요</span>}
                  {msShown.flatMap((m) => m.items.map((i) => (
                    <label key={i.id} className={`pm-ck ${i.left <= 0 ? "off" : ""}`}>
                      <input type="checkbox" checked={ded.has(i.id)} disabled={i.left <= 0} onChange={() => flip(i.id)} />
                      <b>{m.name}{m.items.length > 1 ? ` · ${i.program}` : ""}</b>
                      {ded.has(i.id)
                        ? <span className="pm-tag num">잔여 {i.left}회 → {i.left - 1}회</span>
                        : <span className="pm-tag g num">잔여 {i.left}회</span>}
                      {m.end_on && <span className="pm-dim num">{ymd(m.end_on)} 만료</span>}
                      {m.shared && <span className="pm-dim">{m.owner ?? "다른 고객"} 회원권</span>}
                    </label>
                  )))}
                </div>
              </div>
              <div className="pm-row">
                <span className="pm-k">관리</span>
                <div className="pm-v col">
                  {lines.map((l, n) => (
                    <div key={n} className="pm-line">
                      <span>{l.name} 1회 · {covered.has(l.program_id) ? "회원권" : "단건"}</span>
                      <b className="num">{won(covered.has(l.program_id) ? 0 : price(l.program_id))}</b>
                      <button className="pm-del" onClick={() => setLines(lines.filter((_, j) => j !== n))} aria-label="빼기">×</button>
                    </div>
                  ))}
                  <select className="sel pm-add" value={addPick} onChange={(e) => { const p = svcProgs.find((x) => x.id === e.target.value); if (p) setLines([...lines, { program_id: p.id, name: p.name }]); setAddPick(""); }}>
                    <option value="">+ 관리 추가</option>
                    {svcProgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {won(price(p.id))}원</option>)}
                  </select>
                </div>
              </div>
              {(sell || prodAmt > 0) && (
                <div className="pm-row">
                  <span className="pm-k">판매</span>
                  <div className="pm-v col">
                    {sell && <div className="pm-line"><span>{sell.name}</span><b className="num">{won(sellAmt)}</b></div>}
                    {freeAmt > 0 && <div className="pm-line"><span>{pName} {pQty}개</span><b className="num">{won(freeAmt)}</b></div>}
                    {gLines.map((x) => <div key={x.g.id} className="pm-line"><span>{x.g.name} {x.qty}개</span><b className="num">{won(x.qty * x.g.price)}</b></div>)}
                  </div>
                </div>
              )}
              <div className="pm-row">
                <span className="pm-k">추가금</span>
                <div className="pm-v"><Num v={extra} on={setExtra} label="추가금" /><label className="pm-ck sm"><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} />부가세 추가</label></div>
              </div>
              <div className="pm-row">
                <span className="pm-k">할인</span>
                <div className="pm-v"><Num v={disc} on={setDisc} label="할인" />
                  <select className="sel" value={discT} onChange={(e) => setDiscT(e.target.value)}>{DISC.map((d) => <option key={d}>{d}</option>)}</select></div>
              </div>
              <div className="pm-row">
                <span className="pm-k">타인 회원권</span>
                <div className="pm-v">
                  <button className="btn sm" disabled={shared.length === 0} onClick={() => setShowShared((v) => !v)}>
                    {shared.length === 0 ? "나눠쓰는 회원권 없음" : showShared ? "나눠쓰기 회원권 숨기기" : "나눠쓰기 회원권 고르기"}
                  </button>
                </div>
              </div>
              <div className="pm-row">
                <span className="pm-k">결제 메모</span>
                <div className="pm-v"><input className="inp" placeholder="메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
              </div>
            </div>
          )}
          {ctx && tab === "cnt" && sellList("회차")}
          {ctx && tab === "per" && sellList("기간")}
          {ctx && tab === "prod" && useGoods && (
            <div className="pm-goods">
              {goods!.map((g) => {
                const q = gq[g.id] ?? 0;
                return (
                  <div key={g.id} className={`pm-g ${q > 0 ? "on" : ""}`}>
                    <div className="nm"><b>{g.name}</b><span className="num">{g.category ? `${g.category} · ` : ""}재고 {g.stock}개</span></div>
                    <em className="num">{won(g.price)}</em>
                    <div className="qty">
                      <button onClick={() => setQty(g.id, q - 1)} disabled={q === 0} aria-label="빼기">−</button>
                      <b className="num">{q}</b>
                      <button onClick={() => setQty(g.id, q + 1)} aria-label="더하기">+</button>
                    </div>
                  </div>
                );
              })}
              <div className="pm-line pm-gsum"><span>제품 합계 {gLines.reduce((a, x) => a + x.qty, 0)}개</span><b className="num">{won(gSub)}원</b></div>
            </div>
          )}
          {ctx && tab === "prod" && !useGoods && (
            <div className="pm-rows">
              {goods && <p className="pm-empty">등록된 제품이 없어 직접 입력해요 · 매출 › 제품 › 제품 항목에서 만들 수 있어요</p>}
              <div className="pm-row"><span className="pm-k">제품</span><div className="pm-v"><input className="inp" placeholder="예: 홈케어 앰플" value={pName} onChange={(e) => setPName(e.target.value)} /></div></div>
              <div className="pm-row"><span className="pm-k">수량 · 단가</span><div className="pm-v">
                <select className="sel pm-qty" value={pQty} onChange={(e) => setPQty(+e.target.value)}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}개</option>)}</select>
                <Num v={pUnit} on={setPUnit} label="단가" /></div></div>
              <div className="pm-row"><span className="pm-k">금액</span><div className="pm-v"><b className="num">{won(freeAmt)}원</b></div></div>
            </div>
          )}
        </div>

        <div className="pm-r">
          <div className="pm-hd r"><b>결제 수단</b><button className="pm-x" onClick={onClose} aria-label="닫기">×</button></div>
          <div className="pm-pays">
            <label><span>카드</span><Num v={pay.card} on={setP("card")} label="카드" /></label>
            <label><span>현금</span><Num v={pay.cash} on={setP("cash")} label="현금" /></label>
            <label><span>계좌이체</span><Num v={pay.account} on={setP("account")} label="계좌이체" /></label>
            <label><span>지역화폐</span><Num v={pay.local} on={setP("local")} label="지역화폐" /></label>
            <label><span>미수금</span><Num v={Math.max(unpaid, 0)} ro label="미수금" /></label>
          </div>
          <dl className="pm-sum num">
            <div><dt>회원권 차감</dt><dd>{dedItems.length ? dedItems.map((i) => `${i.program} 1회`).join(", ") : "-"}</dd></div>
            <div><dt>관리 · 제품</dt><dd>{won(gross)}</dd></div>
            <div><dt>할인</dt><dd>{discount ? `-${won(discount)}` : "0"}</dd></div>
          </dl>
          <div className="pm-due"><span>받을 금액</span><b className="num">{won(due)}<small>원</small></b></div>
          {unpaid < 0 && <p className="pm-err">받은 금액이 {won(-unpaid)}원 많아요</p>}
          {err && <p className="pm-err">{err}</p>}
          <button className="btn p pm-go" disabled={busy || !ctx || unpaid < 0} onClick={submit}>
            {busy ? "저장 중…" : `결제 완료${sessions ? ` · ${sessions}` : ""}`}
          </button>
        </div>
        <div className="pm-mbar">
          <span>받을 금액 <b className="num">{won(due)}원</b></span>
          <button className="btn p" disabled={busy || !ctx || unpaid < 0} onClick={submit}>
            {busy ? "저장 중…" : `결제 완료${sessions ? ` · ${sessions}` : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}
