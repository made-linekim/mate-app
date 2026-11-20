"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, callFn, BRANCHES, LOGIN_ID_RE, STATUS_LABEL, TIER_LABEL, type Perm, type Staff, type Tier } from "@/lib/sb";
import { useMe } from "@/lib/me";

type StatusFilter = "active" | "leave" | "resigned" | "all";

export default function StaffPage() {
  const me = useMe();
  const isAdmin = me.tier === "owner" || me.tier === "manager";
  const [list, setList] = useState<Staff[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [branch, setBranch] = useState<string>(me.tier === "owner" ? "all" : me.branch);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: p }] = await Promise.all([
      sb.from("staff_accounts").select("*").order("tier").order("name"),
      sb.from("perm_catalog").select("*").order("sort"),
    ]);
    if (error) setErr(error.message);
    setList((s ?? []) as Staff[]);
    setPerms((p ?? []) as Perm[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => list.filter((s) =>
    (status === "all" || s.status === status) && (branch === "all" || s.branch === branch)), [list, status, branch]);

  const canEdit = (t: Staff) => me.tier === "owner" || (me.tier === "manager" && t.tier === "staff");

  return (
    <>
      <header className="top">
        <h1>직원 관리</h1>
        <span className="sub num">{shown.length}명</span>
        <div style={{ flex: 1 }} />
        {isAdmin && <button className="btn p" onClick={() => setCreating(true)}>직원 등록</button>}
      </header>
      <div className="page">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div className="seg">
            {(["active", "leave", "resigned", "all"] as StatusFilter[]).map((k) => (
              <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>
                {k === "all" ? "전체" : STATUS_LABEL[k]}
              </button>
            ))}
          </div>
          {me.tier === "owner" && ["all", ...BRANCHES].map((b) => (
            <button key={b} className={`chip ${branch === b ? "on" : ""}`} onClick={() => setBranch(b)}>{b === "all" ? "전 지점" : b}</button>
          ))}
        </div>
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="t">
            <thead>
              <tr><th style={{ width: 28 }} /><th>이름</th><th>아이디</th><th>직책</th><th>지점</th><th>등급</th><th>상태</th><th>입사일</th><th>권한</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: s.color ?? "#DDD" }} /></td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.login_id}</td>
                  <td>{s.title ?? "-"}</td>
                  <td>{s.branch}</td>
                  <td><span className={`badge ${s.tier === "staff" ? "" : "em"}`}>{TIER_LABEL[s.tier]}</span></td>
                  <td><span className={`badge ${s.status === "active" ? "ok" : s.status === "leave" ? "warn" : ""}`}>{STATUS_LABEL[s.status]}</span></td>
                  <td className="num">{s.hired_on ?? "-"}</td>
                  <td className="num" style={{ color: "var(--ink-3)", fontSize: 13 }}>
                    {s.tier === "staff" ? `${Object.values(s.perms ?? {}).filter(Boolean).length}개 켜짐` : "전체 권한"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {canEdit(s) && <button className="btn sm" onClick={() => setEditing(s)}>세부설정</button>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--ink-3)" }}>직원이 없어요</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {creating && <CreateDrawer onClose={() => setCreating(false)} onDone={load} />}
      {editing && (
        <EditDrawer target={editing} all={list} perms={perms}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}

/* ---------- 직원 등록 ---------- */
function CreateDrawer({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: "", login_id: "", title: "", branch: me.branch, tier: "staff" as Tier, hired_on: "", color: "#94597F" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setMsg("");
    if (!f.name.trim()) return setMsg("이름을 넣어 주세요");
    if (!LOGIN_ID_RE.test(f.login_id.trim().toLowerCase())) return setMsg("아이디는 영문 소문자·숫자·_ 4~20자예요");
    setBusy(true);
    try {
      const r = await callFn<{ setup_code: string }>("staff-admin", {
        action: "create",
        staff: { ...f, name: f.name.trim(), title: f.title.trim() || null, hired_on: f.hired_on || null, perms: {} },
      });
      setCode(r.setup_code);
      onDone();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="직원 등록">
        <div className="hd">직원 등록</div>
        <div className="bd">
          {code ? (
            <div>
              <p style={{ marginTop: 0 }}><b>{f.name}</b> 님 계정을 만들었어요. 아래 코드를 직원에게 직접 전해 주세요.</p>
              <div className="card" style={{ textAlign: "center", fontSize: 32, fontWeight: 700, letterSpacing: 6 }}>{code}</div>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                직원은 로그인 화면의 &lsquo;첫 로그인&rsquo;에서 아이디 <b>{f.login_id.trim().toLowerCase()}</b>와 이 코드로 비밀번호를 정해요.
                코드는 72시간 동안 쓸 수 있고, 이 창을 닫으면 다시 볼 수 없어요(세부설정에서 새로 발급 가능).
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>권한은 모두 꺼진 상태로 시작해요. 세부설정에서 켜 주세요.</p>
            </div>
          ) : (
            <>
              <Row label="이름 *"><input className="inp" value={f.name} onChange={set("name")} /></Row>
              <Row label="아이디 *" help="영문 소문자·숫자·_ 4~20자. 로그인할 때 써요"><input className="inp" autoCapitalize="none" value={f.login_id} onChange={set("login_id")} /></Row>
              <Row label="직책" help="예: 실장, 원장, 트레이너"><input className="inp" value={f.title} onChange={set("title")} /></Row>
              <Row label="지점">
                <select className="sel" value={f.branch} onChange={set("branch")} disabled={me.tier !== "owner"}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </Row>
              <Row label="등급" help="관리자: 전체 권한(매출·광고비·엑셀 제외) · 직원: 켠 권한만">
                <select className="sel" value={f.tier} onChange={set("tier")} disabled={me.tier !== "owner"}>
                  <option value="staff">직원</option>
                  <option value="manager">관리자</option>
                </select>
              </Row>
              <Row label="입사일"><input className="inp" type="date" value={f.hired_on} onChange={set("hired_on")} /></Row>
              <Row label="예약표 색"><input type="color" value={f.color} onChange={set("color")} style={{ width: 48, height: 40, border: 0, background: "none" }} /></Row>
              {msg && <p style={{ color: "var(--red)", fontSize: 13 }}>{msg}</p>}
            </>
          )}
        </div>
        <div className="ft">
          {code ? <button className="btn p" onClick={onClose}>닫기</button> : (
            <>
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn p" onClick={submit} disabled={busy}>{busy ? "등록 중…" : "등록하고 코드 받기"}</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- 세부설정 (기본정보 + 권한 + 다른 직원에게 동일 적용) ---------- */
function EditDrawer({ target, all, perms, onClose, onDone }:
  { target: Staff; all: Staff[]; perms: Perm[]; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const isOwner = me.tier === "owner";
  const isSelf = target.id === me.id;
  const [f, setF] = useState({
    name: target.name, title: target.title ?? "", status: target.status, tier: target.tier,
    hired_on: target.hired_on ?? "", color: target.color ?? "#DDDDDD", branch: target.branch,
  });
  const [p, setP] = useState<Record<string, boolean>>({ ...(target.perms ?? {}) });
  const [others, setOthers] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const menus = useMemo(() => {
    const m = new Map<string, Perm[]>();
    perms.forEach((x) => m.set(x.menu, [...(m.get(x.menu) ?? []), x]));
    return [...m.entries()];
  }, [perms]);
  const locked = (x: Perm) => x.owner_only && !isOwner;
  // 같은 권한을 받을 수 있는 다른 직원: 직원 등급, 내가 고칠 수 있는 지점
  const candidates = all.filter((s) => s.id !== target.id && s.tier === "staff" && s.status !== "resigned" && (isOwner || s.branch === me.branch));

  // 관리자가 저장할 땐 대표 전용 권한은 대상의 기존 값을 그대로 둠
  const mergeFor = (s: Staff) => {
    if (isOwner) return { ...p };
    const keep: Record<string, boolean> = {};
    perms.filter((x) => x.owner_only).forEach((x) => { if (s.perms?.[x.key]) keep[x.key] = true; });
    const mine: Record<string, boolean> = {};
    perms.filter((x) => !x.owner_only).forEach((x) => { if (p[x.key]) mine[x.key] = true; });
    return { ...mine, ...keep };
  };

  async function save() {
    setMsg(""); setBusy(true);
    try {
      if (!f.name.trim()) throw new Error("이름을 넣어 주세요");
      const row: Partial<Staff> = {
        name: f.name.trim(), title: f.title.trim() || null, hired_on: f.hired_on || null, color: f.color,
        ...(isSelf ? {} : { status: f.status }),
        ...(isOwner && !isSelf ? { tier: f.tier, branch: f.branch } : {}),
        ...(f.tier === "staff" ? { perms: mergeFor(target) } : {}),
      };
      const { error } = await sb.from("staff_accounts").update(row).eq("id", target.id);
      if (error) throw new Error(error.message);
      for (const id of others) {
        const s = all.find((x) => x.id === id)!;
        const { error: e2 } = await sb.from("staff_accounts").update({ perms: mergeFor(s) }).eq("id", id);
        if (e2) throw new Error(`${s.name}: ${e2.message}`);
      }
      onDone();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function reissue() {
    setMsg("");
    try {
      const r = await callFn<{ setup_code: string }>("staff-admin", { action: "reissue_code", staff_id: target.id });
      setCode(r.setup_code);
    } catch (e) { setMsg((e as Error).message); }
  }

  const setAll = (list: Perm[], v: boolean) => {
    const n = { ...p };
    list.filter((x) => !locked(x)).forEach((x) => { if (v) n[x.key] = true; else delete n[x.key]; });
    setP(n);
  };

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer lg" role="dialog" aria-label="직원 세부설정">
        <div className="hd">{target.name} 세부설정</div>
        <div className="bd">
          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>기본 정보</h3>
          <Row label="이름"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Row>
          <Row label="아이디"><span>{target.login_id}</span></Row>
          <Row label="직책"><input className="inp" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Row>
          {isOwner && !isSelf && (
            <>
              <Row label="지점">
                <select className="sel" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </Row>
              <Row label="등급">
                <select className="sel" value={f.tier} onChange={(e) => setF({ ...f, tier: e.target.value as Tier })}>
                  <option value="staff">직원</option><option value="manager">관리자</option>
                </select>
              </Row>
            </>
          )}
          {!isSelf && (
            <Row label="상태" help="퇴사로 바꾸면 로그인할 수 없어요">
              <select className="sel" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Staff["status"] })}>
                <option value="active">재직</option><option value="leave">휴직</option><option value="resigned">퇴사</option>
              </select>
            </Row>
          )}
          <Row label="입사일"><input className="inp" type="date" value={f.hired_on} onChange={(e) => setF({ ...f, hired_on: e.target.value })} /></Row>
          <Row label="예약표 색"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} style={{ width: 48, height: 40, border: 0, background: "none" }} /></Row>
          {!isSelf && (
            <Row label="로그인 코드" help="비밀번호를 잊었거나 코드가 만료됐을 때 새로 발급해요">
              <div>
                <button className="btn sm" onClick={reissue}>새 코드 발급</button>
                {code && <span style={{ marginLeft: 12, fontSize: 20, fontWeight: 700, letterSpacing: 4 }} className="num">{code}</span>}
              </div>
            </Row>
          )}

          <h3 style={{ margin: "24px 0 4px", fontSize: 16 }}>권한</h3>
          {f.tier !== "staff" ? (
            <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
              {f.tier === "owner" ? "대표관리자는 모든 권한이 있어요." : "관리자는 전체 권한이에요. 매출·결제취소·경비·광고비 설정·인쇄/엑셀은 대표관리자만 줄 수 있어요."}
            </p>
          ) : (
            <>
              {menus.map(([menu, list]) => (
                <div key={menu} style={{ borderBottom: "1px solid var(--line)", padding: "12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <b>{menu}</b>
                    <div style={{ flex: 1 }} />
                    <button className="btn t sm" onClick={() => setAll(list, true)}>모두 켜기</button>
                    <button className="btn t sm" onClick={() => setAll(list, false)}>모두 끄기</button>
                  </div>
                  {list.map((x) => (
                    <div key={x.key} style={{ display: "flex", alignItems: "center", minHeight: 40, gap: 8 }}>
                      <span style={{ flex: 1, color: locked(x) ? "var(--ink-4)" : "var(--ink)" }}>
                        {x.label}{x.owner_only && <span className="badge" style={{ marginLeft: 8 }}>대표관리자만</span>}
                      </span>
                      <Switch on={!!p[x.key]} disabled={locked(x)}
                        onChange={(v) => { const n = { ...p }; if (v) n[x.key] = true; else delete n[x.key]; setP(n); }} />
                    </div>
                  ))}
                </div>
              ))}

              <h3 style={{ margin: "24px 0 4px", fontSize: 16 }}>선택한 권한을 다른 직원에게도 똑같이 적용</h3>
              <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 8px" }}>체크한 직원의 권한이 위 설정과 똑같이 바뀌어요.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {candidates.length === 0 && <span style={{ color: "var(--ink-4)", fontSize: 13 }}>같이 적용할 직원이 없어요</span>}
                {candidates.map((s) => {
                  const on = others.includes(s.id);
                  return (
                    <button key={s.id} className={`chip ${on ? "on" : ""}`}
                      onClick={() => setOthers(on ? others.filter((o) => o !== s.id) : [...others, s.id])}>
                      {on ? "✓ " : ""}{s.name}{s.title ? ` · ${s.title}` : ""}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {msg && <p style={{ color: "var(--red)", fontSize: 13 }}>{msg}</p>}
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn p" onClick={save} disabled={busy}>
            {busy ? "저장 중…" : others.length ? `저장 (${others.length + 1}명에게 적용)` : "저장"}
          </button>
        </div>
      </div>
    </>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="frow">
      <div><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>{help && <div className="help">{help}</div>}</div>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 0, padding: 2, position: "relative",
        background: on ? "var(--red)" : "var(--line-strong)", opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}>
      <span style={{ display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff", transform: on ? "translateX(20px)" : "none", transition: "transform .15s" }} />
    </button>
  );
}
