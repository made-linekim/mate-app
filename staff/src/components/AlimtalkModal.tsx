"use client";
// 알림톡 1명 보내기: 카카오 승인 템플릿 고르기 → 빈칸 채우기 → 미리보기 → 보내기
import { useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/sb";
import "./alimtalk.css";

type Tpl = { code: string; name: string; content: string; vars: string[] };
const LABEL: Record<string, string> = {
  name: "고객 이름", reservation_date: "예약 날짜", reservation_time: "예약 시간", program_name: "프로그램",
  expiry_date: "종료일", days_left: "남은 일수", remaining_sessions: "잔여 회차", remaining_points: "마일리지",
  payment_datetime: "결제 일시", payment_amount: "결제 금액", payment_method: "결제 수단", trial_date: "체험일",
};

async function call(url: string, body?: unknown) {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "요청이 실패했어요");
  return j;
}

export default function AlimtalkModal({ customerKey, prefill, suggest, onClose, onSent }: {
  customerKey: string; prefill: Record<string, string>; suggest?: string; onClose: () => void; onSent?: (msg: string) => void;
}) {
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string>("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [testNo, setTestNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    call("/api/msg/alimtalk/templates").then((j) => {
      const l = j.templates as Tpl[]; setTpls(l);
      setCode((suggest && l.find((t) => t.code === suggest)?.code) || l[0]?.code || "");
    }).catch((e) => setErr((e as Error).message));
  }, [suggest]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const tpl = tpls?.find((t) => t.code === code);
  useEffect(() => { if (tpl) setVals(Object.fromEntries(tpl.vars.map((v) => [v, prefill[v] ?? ""]))); }, [tpl?.code]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (tpl?.content ?? "").replace(/#\{([^}]+)\}/g, (_, k) => vals[k] || `[${LABEL[k] ?? k}]`), [tpl, vals]);
  const missing = tpl?.vars.some((v) => !vals[v]?.trim());

  const send = async (test: boolean) => {
    setBusy(true); setErr(null);
    try {
      await call("/api/msg/alimtalk", { customerKey, templateCode: code, params: vals, testNo: test ? testNo : null });
      const m = test ? "내 휴대폰으로 보냈어요" : "알림톡을 보냈어요";
      setDone(m); onSent?.(m);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <>
      <div className="dim at-dim" onClick={onClose} />
      <div className="at-modal" role="dialog" aria-label="알림톡 보내기">
        <h3>알림톡 보내기</h3>
        {!tpls && !err && <p className="h">템플릿을 불러오는 중…</p>}
        {tpls && tpls.length === 0 && <p className="h">카카오 승인된 템플릿이 없어요.</p>}
        {tpls && tpls.length > 0 && (
          <>
            <div className="at-chips">
              {tpls.map((t) => <button key={t.code} className={`chip ${t.code === code ? "on" : ""}`} onClick={() => setCode(t.code)}>{t.name}</button>)}
            </div>
            {tpl && tpl.vars.length > 0 && (
              <div className="at-grid">
                {tpl.vars.map((v) => (
                  <label key={v}><span>{LABEL[v] ?? v}</span>
                    <input className="inp" value={vals[v] ?? ""} onChange={(e) => setVals({ ...vals, [v]: e.target.value })} /></label>
                ))}
              </div>
            )}
            <div className="at-prev">{preview}</div>
            <div className="at-test">
              <input className="inp" inputMode="tel" placeholder="내 번호로 먼저 받아 보기 010-0000-0000" value={testNo} onChange={(e) => setTestNo(e.target.value)} />
              <button className="btn" disabled={busy || !tpl || testNo.replace(/\D/g, "").length < 10} onClick={() => send(true)}>테스트</button>
            </div>
          </>
        )}
        {err && <p className="err">{err}</p>}
        {done && <p className="ok">{done}</p>}
        <div className="ft">
          <button className="btn" onClick={onClose}>닫기</button>
          <button className="btn p" disabled={busy || !tpl || !!missing} onClick={() => send(false)}>{busy ? "보내는 중…" : "고객에게 보내기"}</button>
        </div>
      </div>
    </>
  );
}
