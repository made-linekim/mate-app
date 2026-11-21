"use client";
import { createPortal } from "react-dom";
// 결제 창 — 시안 01-07 (왼쪽: 관리 결제 · 회차권 판매 · 기간권 판매 · 제품 판매 / 오른쪽: 결제 수단 · 받을 금액)
import { useEffect, useMemo, useState } from "react";
import "./pay-v3.css";
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
const DISC = ["직원 할인", "회원 할인", "이벤트 할인", "기타 할인"];

function Num({ v, on, ro, label }: { v: number; on?: (n: number) => void; ro?: boolean; label?: string }) {
  return (
    <input className="inp num pm-num" inputMode="numeric" aria-label={label} readOnly={ro} value={won(v)}
      onFocus={(e) => e.target.select()}
      onChange={(e) => on?.(Math.min(99999999, Number(e.target.value.replace(/\D/g, "")) || 0))} />
  );
}

export default function PayModal({ branch, rsv, programs, onClose, onDone, head }: {
  branch: string; rsv: PayRsv; programs: Program[]; onClose: () => void; onDone: () => void; head?: React.ReactNode;
}) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
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
  const [fail, setFail] = useState(""); // 결제 실패 (P31): 입력은 그대로 두고 다시 시도
  const [owe, setOwe] = useState(false); // 미수금 처리 (P05b: 모자란 금액을 미수로 남겨요)
  const [open, setOpen] = useState<Record<string, boolean>>({ svc: true });
  const [now] = useState(() => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }));
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
    if (error) { setBusy(false); setFail(error.message); return; }
    if (gLines.length) {
      const g = await sb.rpc("goods_sale_create", { p_branch: branch, p: {
        customer_key: rsv.customer_key, lines: gLines.map((x) => ({ goods_id: x.g.id, qty: x.qty, price: x.g.price })),
        vat, discount: gDisc, pay: gPay, memo: memo.trim(), staff_name: rsv.staff_name ?? "" } });
      if (g.error) { setBusy(false); setErr(`관리 결제는 끝났어요. 제품 판매만 저장하지 못했어요: ${g.error.message} (매출 › 제품 › 판매에서 다시 입력해 주세요)`); return; }
    }
    setBusy(false);
    onDone();
  };

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

  const short = unpaid > 0 && !owe;
  const pc = (pid: string) => programs.find((x) => x.id === pid)?.color ?? "#8A8F98";
  const lineItems = (pid: string) => [...own, ...(showShared ? shared : [])].flatMap((m) => m.items.filter((i) => i.program_id === pid && i.left > 0).map((i) => ({ ...i, ms: m })));
  const pickFor = (pid: string, id: string) => setDed((s0) => { const n = new Set([...s0].filter((x) => allItems.find((i) => i.id === x)?.program_id !== pid)); if (id) n.add(id); return n; });
  const PAYS: [keyof typeof pay, string][] = [["cash", "현금"], ["card", "카드"], ["account", "계좌이체"], ["local", "지역화폐"]];
  const togglePay = (k: keyof typeof pay) => { setTouched(true); setPay((p) => p[k] > 0 ? { ...p, [k]: 0 } : { ...p, [k]: Math.max(0, due - (p.card + p.cash + p.account + p.local)) }); };
  // 접히는 판매 칸 (함수로 그려요: 컴포넌트로 만들면 입력 중에 칸이 다시 만들어져 커서가 빠져요)
  const sec = (k: string, on: boolean, title: string, children: React.ReactNode) => (
    <div key={k} className={`pv-sec ${open[k] ? "open" : ""}`}>
      <button className="pv-sh" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}><i className={`cbx ${on ? "on" : ""}`} /><b>{title}</b><span className="sp" /><span className="arw">{open[k] ? "▾" : "▸"}</span></button>
      {open[k] && <div className="pv-in">{children}</div>}
    </div>
  );
  const prodBody = useGoods ? (
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
    </div>
  ) : (
    <div className="pm-rows">
      {goods && <p className="pm-empty">등록된 제품이 없어 직접 입력해요 · 매출 › 제품 › 제품 항목에서 만들 수 있어요</p>}
      <div className="pm-row"><span className="pm-k">제품</span><div className="pm-v"><input className="inp" placeholder="예: 홈케어 앰플" value={pName} onChange={(e) => setPName(e.target.value)} /></div></div>
      <div className="pm-row"><span className="pm-k">수량 · 단가</span><div className="pm-v">
        <select className="sel pm-qty" value={pQty} onChange={(e) => setPQty(+e.target.value)}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}개</option>)}</select>
        <Num v={pUnit} on={setPUnit} label="단가" /></div></div>
    </div>
  );
  const sumLines = [
    ...dedItems.map((i) => `${i.ms.name} 1회 차감 · 잔여 ${i.left - 1}회`),
    ...lines.filter((l) => !covered.has(l.program_id)).map((l) => `${l.name} 단건 ${won(price(l.program_id))}원`),
    ...(sell ? [`${sell.name} 판매 ${won(sellAmt)}원`] : []),
    ...gLines.map((x) => `${x.g.name} ${x.qty}개 ${won(x.qty * x.g.price)}원`),
    ...(freeAmt > 0 ? [`${pName} ${pQty}개 ${won(freeAmt)}원`] : []),
    ...(extra > 0 || vat ? [`추가금 ${won(extra)}원${vat ? " · 부가세 포함" : ""}`] : []),
    ...(discount > 0 ? [`${discT} ${won(discount)}원`] : []),
  ];
  const goLabel = busy ? "저장 중…" : fail ? `다시 결제 · ${won(due)}원` : `결제 완료${sessions ? ` · ${sessions}` : ""}`;

  const host = typeof document !== "undefined" ? document.querySelector(".app") : null;
  const ui = (
    <>
      <div className="dim" style={{ zIndex: 50 }} onClick={onClose} />
      <div className="pv" role="dialog" aria-label="결제하기">
        <div className="pv-hd">
          <b>결제하기</b>
          <span className="num">{md(rsv.day)} ({DOW[dow(rsv.day)]}) {rsv.start_time.slice(0, 5)} 예약에서</span>
          <span className="sp" />
          <button className="pv-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="pv-cols">
          <div className="pv-l">
            {head && <div className="rd pv-head">{head}</div>}
            {fail && (
              <div className="pv-fail mo" role="alert">
                <p><b>{/카드|승인|card/i.test(fail) ? "카드 승인이 안 됐어요" : "결제를 저장하지 못했어요"}</b> · {fail}<br />결제·차감은 아직 안 됐어요. 입력은 그대로예요.</p>
                <div className="bt">
                  <button className="btn sm p" disabled={busy} onClick={() => { setFail(""); submit(); }}>다시 시도</button>
                  {pay.card > 0 && <button className="btn sm" onClick={() => { setFail(""); setTouched(true); setPay((p) => ({ ...p, cash: p.cash + p.card, card: 0 })); }}>다른 수단</button>}
                </div>
              </div>
            )}
            <div className="pv-f"><label>매출 일시</label><div className="v">
              <span className="inp num" style={{ width: 132 }}>{rsv.day} ({DOW[dow(rsv.day)]})</span>
              <span className="inp num" style={{ width: 64 }}>{now}</span>
              {rsv.staff_name && <span className="inp" style={{ width: 96 }}>{rsv.staff_name}</span>}
            </div></div>
            {!ctx && !err && <p className="pm-empty">불러오는 중…</p>}
            {ctx && <>
              {sec("cnt", sell?.kind === "회차", "회차회원권 판매", sellList("회차"))}
              {sec("per", sell?.kind === "기간", "기간회원권 판매", sellList("기간"))}
              {sec("prod", prodAmt > 0, "제품 판매", prodBody)}
              <div className={`pv-sec on ${open.svc ? "open" : ""}`}>
                <button className="pv-sh" onClick={() => setOpen((o) => ({ ...o, svc: !o.svc }))}>
                  <i className={`cbx ${lines.length ? "on" : ""}`} /><b>관리 결제</b><span className="d">예약에서 {lines.length}건</span><span className="sp" />
                  <b className="num">{won(svcAmt)}원</b><span className="arw">{open.svc ? "▾" : "▸"}</span>
                </button>
                {open.svc && <div className="pv-in">
                  {lines.map((l, n) => {
                    const opts = lineItems(l.program_id);
                    const cur = dedItems.find((i) => i.program_id === l.program_id);
                    return (
                      <div key={n} className="pv-pr">
                        <span className="pb" style={{ background: `${pc(l.program_id)}22`, color: pc(l.program_id) }}>{l.name}</span>
                        <span className="pv-pick">
                          {cur ? <>{cur.total - cur.left + 1}회차 · {cur.ms.name} 차감 <span className="d">{cur.left}회 → {cur.left - 1}회</span></> : <>1회 · 단건</>}
                          {opts.length > 0 && (
                            <select aria-label={`${l.name} 차감 방법`} value={cur?.id ?? ""} onChange={(e) => pickFor(l.program_id, e.target.value)}>
                              {opts.map((i) => <option key={i.id} value={i.id}>{i.ms.name} 차감 · 잔여 {i.left}회{i.ms.shared ? ` (${i.ms.owner ?? "다른 고객"})` : ""}</option>)}
                              <option value="">단건 결제</option>
                            </select>
                          )}
                        </span>
                        <b className="num">{won(covered.has(l.program_id) ? 0 : price(l.program_id))}원</b>
                        <button className="pv-del" onClick={() => setLines(lines.filter((_, j) => j !== n))} aria-label="빼기">✕</button>
                      </div>
                    );
                  })}
                  <div className="pv-pr">
                    <span className="pv-add">+</span>
                    <select className="pv-addsel" value={addPick} onChange={(e) => { const p = svcProgs.find((x) => x.id === e.target.value); if (p) setLines([...lines, { program_id: p.id, name: p.name }]); setAddPick(""); }}>
                      <option value="">관리 추가</option>
                      {svcProgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {won(price(p.id))}원</option>)}
                    </select>
                  </div>
                  <div className="pv-pr">
                    <i className={`cbx ${extra > 0 || vat ? "on" : ""}`} />
                    <span>추가금 <span className="d">+ 항목 · 부가세 추가</span></span>
                    <span className="pv-amt"><Num v={extra} on={setExtra} label="추가금" /><label className="pv-vat"><input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} />부가세</label></span>
                  </div>
                  <div className="pv-pr">
                    <i className={`cbx ${disc > 0 ? "on" : ""}`} />
                    <span>할인 <span className="d">금액 · 사유</span></span>
                    <span className="pv-amt"><Num v={disc} on={setDisc} label="할인" /><select className="sel" value={discT} onChange={(e) => setDiscT(e.target.value)}>{DISC.map((d) => <option key={d}>{d}</option>)}</select></span>
                  </div>
                  <div className="pv-pr">
                    <i className={`cbx ${showShared ? "on" : ""}`} />
                    <span>공유 회원권</span>
                    <button className="btn sm" disabled={shared.length === 0} onClick={() => setShowShared((v) => !v)}>{shared.length === 0 ? "공유 회원권 없음" : showShared ? "타인 회원권 숨기기" : "타인 회원권 사용"}</button>
                  </div>
                </div>}
              </div>
            </>}
          </div>

          <div className="pv-r">
            {fail && (
              <div className="pv-fail pc" role="alert">
                <p><b>{/카드|승인|card/i.test(fail) ? "카드 승인이 안 됐어요" : "결제를 저장하지 못했어요"}</b> · {fail}<br />결제·차감은 아직 안 됐어요. 입력은 그대로예요.</p>
                <div className="bt">
                  <button className="btn sm p" disabled={busy} onClick={() => { setFail(""); submit(); }}>다시 시도</button>
                  {pay.card > 0 && <button className="btn sm" onClick={() => { setFail(""); setTouched(true); setPay((p) => ({ ...p, cash: p.cash + p.card, card: 0 })); }}>다른 수단</button>}
                </div>
              </div>
            )}
            <div className="pv-rh">결제 수단</div>
            {PAYS.map(([k, l]) => (
              <div key={k} className="pv-tn">
                <button className={`cbx ${pay[k] > 0 ? "on" : ""}`} onClick={() => togglePay(k)} aria-label={`${l} 사용`} />
                <span>{l}</span>
                <Num v={pay[k]} on={setP(k)} label={l} />
              </div>
            ))}
            <div className="pv-tn">
              <button className={`cbx ${owe ? "on" : ""}`} onClick={() => setOwe((v) => !v)} aria-label="미수금 처리" />
              <span>미수금 처리</span>
              <Num v={owe ? Math.max(unpaid, 0) : 0} ro label="미수금" />
            </div>
            <div className="pv-f m"><label>메모</label><textarea className="inp" rows={2} placeholder="결제 메모" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
            <div className="pv-rh">차감 요약</div>
            <div className="pv-sum">{sumLines.length ? sumLines.map((t, i) => <div key={i}>{t}</div>) : <div className="d">아직 고른 내용이 없어요</div>}</div>
            <span className="sp" />
            <div className="pv-due">
              <label>받을 금액</label>
              <b className="num">{won(due)}원</b>
              {unpaid < 0 ? <span className="bad">{won(-unpaid)}원 많아요 · 결제수단 금액을 맞춰 주세요</span>
                : short ? <span className="bad">{won(unpaid)}원 모자라요 · 결제수단 금액을 맞춰 주세요</span>
                : owe && unpaid > 0 ? <span className="warn">{won(unpaid)}원은 미수금으로 남겨요</span>
                : <span className="ok">✓ 받을 금액과 일치{fail ? " · 승인 대기" : ""}</span>}
            </div>
          </div>
        </div>
        <div className="pv-ft">
          <button className="btn" onClick={onClose}>뒤로가기</button>
          <span className="sp" />
          {err && <p className="pv-err" role="alert">{err}</p>}
          <button className="btn p" disabled={busy || !ctx || unpaid < 0 || short} onClick={submit}>{goLabel}</button>
        </div>
      </div>
    </>
  );
  return host ? createPortal(ui, host) : ui;
}
