"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { todayKST } from "@/lib/sales";
import { SearchIcon } from "./ui";

/* 회원권 판매 창 (시안 01-07 결제 창 모양 · 흐름은 뷰티사랑넷 판매 입력: 고객 → 상품 → 결제 수단별 금액 → 담당자 → 저장) */

type Cust = { key: string; name: string; phone: string | null; membership: string | null; min_remaining: number | null };
type Item = { program_id: string; program: string; count: number };
type Prod = { id: string; name: string; kind: string; valid_days: number | null; price: number; items: Item[] };
type Have = { id: string; name: string; kind: string; end_on: string | null; items: { program: string; left: number }[] };
type Ctx = { customer: { name: string } | null; memberships: Have[]; products: Prod[] };
type StaffRow = { id: string; name: string; title: string | null };
type PayK = "card" | "cash" | "account" | "local";
const PAYS: { k: PayK; l: string }[] = [
  { k: "card", l: "카드" }, { k: "cash", l: "현금" }, { k: "account", l: "계좌이체" }, { k: "local", l: "지역화폐" },
];
const won = (n: number) => Math.max(0, Math.round(n)).toLocaleString();
const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const addD = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const ymd = (d: string) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
const period = (days: number | null) => {
  const d = days ?? 90;
  return d % 30 === 0 ? `${d / 30}개월` : `${d}일`;
};

function Money({ value, onChange, disabled, label }: { value: number; onChange: (n: number) => void; disabled?: boolean; label: string }) {
  return (
    <input className="inp num sm-money" inputMode="numeric" aria-label={label} disabled={disabled}
      value={value ? value.toLocaleString() : ""} placeholder="0" onChange={(e) => onChange(num(e.target.value))} />
  );
}

export default function SellModal({ branch, init, onClose, onDone }: {
  branch: string; init?: { key: string; name?: string } | null; onClose: () => void; onDone: () => void;
}) {
  const me = useMe();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadErr, setLoadErr] = useState("");
  // 고객
  const [cust, setCust] = useState<{ key: string; name: string } | null>(init?.key ? { key: init.key, name: init.name ?? "" } : null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Cust[] | null>(null);
  // 상품
  const [pq, setPq] = useState("");
  const [prodId, setProdId] = useState("");
  const [start, setStart] = useState(todayKST());
  const [svc, setSvc] = useState<Record<string, number>>({});
  const [price, setPrice] = useState(0);
  const [disc, setDisc] = useState(0);
  const [staff, setStaff] = useState(me.name);
  const [memo, setMemo] = useState("");
  const [pay, setPay] = useState<Record<PayK, number>>({ card: 0, cash: 0, account: 0, local: 0 });
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { cust: { key: string; name: string }; prod: string; total: number; unpaid: number }>(null);

  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  useEffect(() => {
    sb.from("staff_accounts").select("id,name,title").eq("branch", branch).eq("status", "active").order("name")
      .then(({ data }) => setStaffs((data ?? []) as StaffRow[]));
  }, [branch]);

  // 고객을 고르면 그 고객이 가진 회원권 + 파는 회원권 상품을 불러와요 (pay_context, 040 결제와 같은 서버)
  const custKey = cust?.key ?? "";
  useEffect(() => {
    setCtx(null); setLoadErr("");
    if (!custKey) return;
    sb.rpc("pay_context", { p_branch: branch, p_key: custKey }).then(({ data, error }) => {
      if (error) setLoadErr(/pay_context|function/i.test(error.message)
        ? "판매 서버가 아직 준비 중이에요. 040 결제 SQL을 실행하면 바로 쓸 수 있어요."
        : /permission|권한/i.test(error.message) ? "회원권을 팔 권한이 없어요. 대표관리자에게 결제 권한을 요청해 주세요." : "불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.");
      else {
        const c = data as Ctx;
        setCtx(c);
        const n = c.customer?.name;
        if (n) setCust((x) => (x && !x.name ? { ...x, name: n } : x));
      }
    });
  }, [custKey, branch]);

  useEffect(() => {
    if (cust || q.trim().length < 1) { setFound(null); return; }
    const t = setTimeout(async () => {
      const { data } = await sb.rpc("customer_list", { p_q: q.trim(), p_branch: branch, p_filter: "all", p_limit: 12, p_offset: 0 });
      setFound((data ?? []) as Cust[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, cust, branch]);

  const prods = useMemo(() => {
    const s = pq.trim();
    return (ctx?.products ?? []).filter((p) => !s || p.name.includes(s) || p.items.some((i) => i.program.includes(s)));
  }, [ctx, pq]);
  const prod = ctx?.products.find((p) => p.id === prodId) ?? null;
  const pick = (p: Prod) => { setProdId(p.id); setPrice(p.price); setDisc(0); setSvc({}); setPay({ card: 0, cash: 0, account: 0, local: 0 }); };

  const total = Math.max(price - Math.min(disc, price), 0);
  const recv = PAYS.reduce((a, p) => a + pay[p.k], 0);
  const unpaid = total - recv;
  const fill = (k: PayK) => setPay((p) => ({ ...p, [k]: p[k] + Math.max(unpaid, 0) }));
  const end = prod ? addD(start, (prod.valid_days ?? 90) - 1) : null;
  const sessions = prod ? prod.items.reduce((a, i) => a + i.count + (svc[i.program_id] ?? 0), 0) : 0;

  const ready = !!cust && !!prod && unpaid >= 0 && !busy;
  const save = async () => {
    setErr("");
    if (!cust) return setErr("고객을 골라 주세요.");
    if (!prod) return setErr("회원권을 골라 주세요.");
    if (unpaid < 0) return setErr(`받은 금액이 ${won(-unpaid)}원 많아요.`);
    setBusy(true);
    const { error } = await sb.rpc("pay_checkout", {
      p_branch: branch, p_key: cust.key, p_rsv: null, p: {
        sell: {
          product_id: prod.id, name: prod.name, kind: prod.kind === "기간" ? "기간" : "회차", start_on: start,
          valid_days: prod.valid_days ?? 90, price,
          items: prod.items.map((i) => ({ program_id: i.program_id, total: i.count, service: svc[i.program_id] ?? 0 })),
        },
        discount: disc, pay, memo, staff,
      },
    });
    setBusy(false);
    if (error) return setErr(/pay_checkout|function/i.test(error.message) ? "판매 서버가 아직 준비 중이에요. 040 결제 SQL을 실행해 주세요." : error.message);
    setDone({ cust, prod: prod.name, total, unpaid });
    onDone();
  };
  const again = () => {
    setDone(null); setCust(null); setQ(""); setProdId(""); setPrice(0); setDisc(0); setSvc({}); setMemo("");
    setPay({ card: 0, cash: 0, account: 0, local: 0 }); setStart(todayKST());
  };

  return (
    <>
      <div className="dim" style={{ zIndex: 40 }} onClick={onClose} />
      <div className={`sm-modal ${done ? "sm-narrow" : ""}`} role="dialog" aria-label="회원권 판매">
        {done ? (
          <div className="sm-done">
            <div className="ic" aria-hidden>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </div>
            <h2>판매 완료</h2>
            <p><b>{done.cust.name}</b> 님 · {done.prod}</p>
            <p className="amt">{won(done.total)}원{done.unpaid > 0 && <span className="red"> · 미수 {won(done.unpaid)}원</span>}</p>
            <div className="btns">
              <Link className="btn" href={`/customers/chart?b=${encodeURIComponent(branch)}&k=${encodeURIComponent(done.cust.key)}`}>고객 차트 보기</Link>
              <button className="btn" onClick={again}>한 건 더 판매</button>
              <button className="btn p" onClick={onClose}>닫기</button>
            </div>
          </div>
        ) : (
          <div className="sm-grid">
            {/* 왼쪽: 고객 · 회원권 · 조건 */}
            <section className="sm-left">
              <div className="sm-hd">
                <div>
                  <h2>회원권 판매</h2>
                  <p>{branch} · {ymd(todayKST())} · 판매 {staff || me.name}</p>
                </div>
                <button className="sm-x only-m" onClick={onClose} aria-label="닫기">×</button>
              </div>
              {loadErr && <p className="sm-warn">{loadErr}</p>}

              <div className="sm-row">
                <div className="sm-l"><Ic d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />고객</div>
                <div className="sm-v">
                  {cust ? (
                    <div className="sm-pick">
                      <b>{cust.name || "고객"}</b>
                      <button className="btn sm" onClick={() => { setCust(null); setQ(""); setProdId(""); }}>바꾸기</button>
                      {ctx && (
                        <div className="sm-have">
                          {ctx.memberships.length === 0 ? <span className="mute">지금 쓰는 회원권 없음</span>
                            : ctx.memberships.map((m) => (
                              <span key={m.id} className="badge">{m.name}{m.kind === "회차" ? ` · ${m.items.reduce((a, i) => a + Number(i.left), 0)}회 남음` : ""}{m.end_on ? ` · ${ymd(m.end_on)}` : ""}</span>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <label className="sm-search"><SearchIcon />
                        <input className="inp" autoFocus placeholder="이름 · 전화 뒤 4자리" value={q} onChange={(e) => setQ(e.target.value)} />
                      </label>
                      {found && (
                        <div className="sm-list">
                          {found.length === 0 && <div className="sm-none">찾는 고객이 없어요</div>}
                          {found.map((c) => (
                            <button key={c.key} onClick={() => setCust({ key: c.key, name: c.name })}>
                              <b>{c.name}</b><span className="num">{c.phone ?? ""}</span>
                              <em>{c.membership ? `${c.membership}${c.min_remaining != null ? ` · ${c.min_remaining}회 남음` : ""}` : "회원권 없음"}</em>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="sm-row">
                <div className="sm-l"><Ic d="M3 7h18v10H3zM3 11h18" />회원권</div>
                <div className="sm-v">
                  {prod ? (
                    <div className="sm-pick">
                      <b>{prod.name}</b>
                      <span className="mute">{prod.items.map((i) => `${i.program} ${i.count}회`).join(" · ")} · {period(prod.valid_days)}</span>
                      <button className="btn sm" onClick={() => setProdId("")}>바꾸기</button>
                    </div>
                  ) : (
                    <>
                      <label className="sm-search"><SearchIcon />
                        <input className="inp" disabled={!ctx} placeholder="회원권 · 관리 이름" value={pq} onChange={(e) => setPq(e.target.value)} />
                      </label>
                      <div className="sm-prods">
                        {prods.map((p) => (
                          <button key={p.id} onClick={() => pick(p)}>
                            <b>{p.name}</b>
                            <span>{p.items.map((i) => `${i.program} ${i.count}회`).join(" · ") || p.kind} · {period(p.valid_days)}</span>
                            <em className="num">{won(p.price)}원</em>
                          </button>
                        ))}
                        {ctx && prods.length === 0 && <div className="sm-none">판매 중인 회원권이 없어요. 설정 &gt; 회원권 상품에서 추가해 주세요.</div>}
                        {!cust && <div className="sm-none">고객을 먼저 골라 주세요</div>}
                        {cust && !ctx && !loadErr && <div className="sm-none">불러오는 중</div>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {prod && (
                <>
                  <div className="sm-row">
                    <div className="sm-l"><Ic d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />기간</div>
                    <div className="sm-v sm-inline">
                      <input type="date" className="inp sm-date" value={start} onChange={(e) => setStart(e.target.value || todayKST())} aria-label="시작일" />
                      <span className="mute">부터</span>
                      <b className="num">{end && ymd(end)} 만료</b>
                      <span className="mute">({period(prod.valid_days)})</span>
                    </div>
                  </div>
                  {prod.items.length > 0 && (
                    <div className="sm-row">
                      <div className="sm-l"><Ic d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />서비스 회차</div>
                      <div className="sm-v sm-svcs">
                        {prod.items.map((i) => {
                          const n = svc[i.program_id] ?? 0;
                          return (
                            <div key={i.program_id} className="sm-svc">
                              <span>{i.program} <b className="num">{i.count}회</b></span>
                              <div className="sm-step">
                                <button aria-label="빼기" disabled={n <= 0} onClick={() => setSvc((s) => ({ ...s, [i.program_id]: n - 1 }))}>−</button>
                                <b className="num">+{n}</b>
                                <button aria-label="더하기" onClick={() => setSvc((s) => ({ ...s, [i.program_id]: n + 1 }))}>+</button>
                              </div>
                              <i className="num">{n > 0 ? `총 ${i.count + n}회` : "서비스 없음"}</i>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="sm-row">
                    <div className="sm-l"><Ic d="M4 7h16M4 12h16M4 17h10" />금액</div>
                    <div className="sm-v sm-two">
                      <label><span>판매가</span><Money label="판매가" value={price} onChange={setPrice} /></label>
                      <label><span>할인</span><Money label="할인" value={disc} onChange={(n) => setDisc(Math.min(n, price))} /></label>
                    </div>
                  </div>
                </>
              )}

              <div className="sm-row">
                <div className="sm-l"><Ic d="M16 11a4 4 0 1 0-8 0M3 20a9 9 0 0 1 18 0" />담당자</div>
                <div className="sm-v">
                  <select className="sel" value={staff} onChange={(e) => setStaff(e.target.value)}>
                    {!staffs.some((s) => s.name === staff) && <option value={staff}>{staff}</option>}
                    {staffs.map((s) => <option key={s.id} value={s.name}>{s.name}{s.title ? ` · ${s.title}` : ""}</option>)}
                  </select>
                </div>
              </div>
              <div className="sm-row last">
                <div className="sm-l"><Ic d="M5 4h14v16H5zM8 9h8M8 13h8M8 17h5" />메모</div>
                <div className="sm-v"><input className="inp" placeholder="결제 메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} /></div>
              </div>
            </section>

            {/* 오른쪽: 결제 수단 */}
            <section className="sm-right">
              <div className="sm-hd">
                <h2>결제 수단</h2>
                <button className="sm-info" onClick={() => setInfo((v) => !v)} aria-label="도움말">i</button>
                <span style={{ flex: 1 }} />
                <button className="sm-x only-pc" onClick={onClose} aria-label="닫기">×</button>
              </div>
              {info && <p className="sm-hint">카드·현금 같은 이름을 누르면 남은 금액이 한 번에 들어가요. 덜 받은 금액은 미수로 남아요.</p>}
              <div className="sm-pays">
                {PAYS.map((p) => (
                  <div key={p.k} className="sm-pay">
                    <button className="sm-pl" disabled={!prod} onClick={() => fill(p.k)}>{p.l}</button>
                    <Money label={p.l} value={pay[p.k]} disabled={!prod} onChange={(n) => setPay((x) => ({ ...x, [p.k]: n }))} />
                  </div>
                ))}
                <div className="sm-pay">
                  <span className="sm-pl static">미수금</span>
                  <div className={`inp num sm-money ro ${unpaid > 0 ? "red" : ""}`}>{unpaid < 0 ? `-${won(-unpaid)}` : won(unpaid)}</div>
                </div>
              </div>
              <div className="sm-sum">
                <div><span>회원권</span><b>{prod ? `${prod.name}${sessions ? ` · ${sessions}회` : ""}` : "-"}</b></div>
                <div><span>판매가</span><b className="num">{won(price)}</b></div>
                <div><span>할인</span><b className="num">{disc ? `-${won(disc)}` : "0"}</b></div>
                <div><span>받은 금액</span><b className="num">{won(recv)}</b></div>
              </div>
              <div className="sm-total">
                <span>받을 금액</span>
                <b className="num">{won(total)}<small>원</small></b>
              </div>
              {err && <p className="sm-err">{err}</p>}
              <button className="btn p sm-go" disabled={!ready || !!loadErr} onClick={save}>
                {busy ? "저장 중" : !cust ? "고객을 골라 주세요" : !prod ? "회원권을 골라 주세요" : unpaid < 0 ? "받은 금액이 많아요"
                  : `판매 완료 · ${won(total)}원${unpaid > 0 ? ` (미수 ${won(unpaid)})` : ""}`}
              </button>
            </section>
          </div>
        )}
      </div>
    </>
  );
}

function Ic({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
