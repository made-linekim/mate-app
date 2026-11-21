"use client";
import { useState } from "react";
import { sb, callFn, BRANCHES, LOGIN_ID_RE, type Staff, type Tier } from "@/lib/sb";
import { MANAGER, type Preset } from "../perms/Detail";
import { useMe } from "@/lib/me";

/* 직원 등록 · 세부설정 드로어 (예전 /staff 화면에서 옮김, 권한 규칙은 그대로) */
/* ---------- 직원 등록 ---------- */
export function CreateDrawer({ titles, presets, onClose, onDone }: { titles: string[]; presets: Preset[]; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const [f, setF] = useState({ name: "", login_id: "", title: titles.find((t) => t !== MANAGER) ?? "직원", branch: me.branch, tier: "staff" as Tier, hired_on: "", color: "#94597F" });
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
        staff: { ...f, name: f.name.trim(), title: f.title.trim() || null, hired_on: f.hired_on || null,
          perms: presets.find((x) => x.name === (f.tier === "manager" ? MANAGER : f.title.trim() || "직원"))?.perms ?? {} },
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
              <div className="st-code num">{code}</div>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
                직원은 로그인 화면의 &lsquo;첫 로그인&rsquo;에서 아이디 <b>{f.login_id.trim().toLowerCase()}</b>와 이 코드로 비밀번호를 정해요.
                코드는 72시간 동안 쓸 수 있고, 이 창을 닫으면 다시 볼 수 없어요(세부설정에서 새로 발급 가능).
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-3)" }}>권한은 고른 직급의 세부설정으로 시작해요. 한 사람만 다르게 하려면 직원 목록의 [세부설정]을 눌러요.</p>
            </div>
          ) : (
            <>
              <Row label="이름 *"><input className="inp" value={f.name} onChange={set("name")} /></Row>
              <Row label="아이디 *" help="영문 소문자·숫자·_ 4~20자. 로그인할 때 써요"><input className="inp" autoCapitalize="none" value={f.login_id} onChange={set("login_id")} /></Row>
              <Row label="직급" help="고르거나 새 이름을 써요. 그 직급 세부설정이 그대로 들어가요">
                <input className="inp" list="st-titles" value={f.title} onChange={set("title")} />
                <TitleList titles={titles} />
              </Row>
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
              <Row label="예약표 색"><input type="color" value={f.color} onChange={set("color")} className="inp" style={{ width: 80, padding: 4 }} /></Row>
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

/* ---------- 직원 수정 (이름 · 직급 · 지점 · 상태). 권한은 [세부설정] 창에서 ---------- */
export function EditDrawer({ target, titles, presets, onDetail, onClose, onDone }:
  { target: Staff; titles: string[]; presets: Preset[]; onDetail?: () => void; onClose: () => void; onDone: () => void }) {
  const me = useMe();
  const isOwner = me.tier === "owner";
  const isSelf = target.id === me.id;
  const [f, setF] = useState({
    name: target.name, title: target.title ?? "", status: target.status, tier: target.tier,
    hired_on: target.hired_on ?? "", color: target.color ?? "#DDDDDD", branch: target.branch,
  });
  const [follow, setFollow] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const oldKey = target.tier === "manager" ? MANAGER : target.title || "직원";
  const newKey = f.tier === "manager" ? MANAGER : f.title.trim() || "직원";
  const moved = target.tier !== "owner" && newKey !== oldKey;

  async function save() {
    setMsg(""); setBusy(true);
    try {
      if (!f.name.trim()) throw new Error("이름을 넣어 주세요");
      const row: Partial<Staff> = {
        name: f.name.trim(), title: f.title.trim() || null, hired_on: f.hired_on || null, color: f.color,
        ...(isSelf ? {} : { status: f.status }),
        ...(isOwner && !isSelf ? { tier: f.tier, branch: f.branch } : {}),
        ...(moved && follow ? { perms: presets.find((x) => x.name === newKey)?.perms ?? {} } : {}),
      };
      const { error } = await sb.from("staff_accounts").update(row).eq("id", target.id);
      if (error) throw new Error(error.message);
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

  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="직원 수정">
        <div className="hd">직원 수정 · {target.name}</div>
        <div className="bd">
          <Row label="이름"><input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Row>
          <Row label="아이디"><span>{target.login_id}</span></Row>
          {target.tier !== "owner" && (
            <Row label="직급" help="고르거나 새 이름을 써요">
              <input className="inp" list="st-titles" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
              <TitleList titles={titles} />
            </Row>
          )}
          {moved && (
            <label className="pd-cb" style={{ margin: "4px 0 12px" }}>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />세부설정도 새 직급 기본값으로 맞추기
            </label>
          )}
          {isOwner && !isSelf && (
            <>
              <Row label="지점">
                <select className="sel" value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
                  {BRANCHES.map((b) => <option key={b}>{b}</option>)}
                </select>
              </Row>
              <Row label="등급" help="관리자: 기본 기능 전부 + 대표관리자가 켜 준 것 · 직원: 켠 것만">
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
          <Row label="예약표 색"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="inp" style={{ width: 80, padding: 4 }} /></Row>
          {!isSelf && (
            <Row label="로그인 코드" help="비밀번호를 잊었거나 코드가 만료됐을 때 새로 발급해요">
              <div>
                <button className="btn sm" onClick={reissue}>새 코드 발급</button>
                {code && <span style={{ marginLeft: 12, fontSize: 20, fontWeight: 700, letterSpacing: 4 }} className="num">{code}</span>}
              </div>
            </Row>
          )}
          <Row label="세부설정" help="켠 메뉴 · 기능만 보여요">
            {target.tier === "owner" ? <span style={{ color: "var(--ink-3)" }}>대표관리자는 모든 권한이에요</span>
              : onDetail ? <button className="pl-det" onClick={onDetail}>세부설정 열기</button>
              : <span style={{ color: "var(--ink-3)" }}>대표관리자만 바꿀 수 있어요</span>}
          </Row>
          {msg && <p style={{ color: "var(--red)", fontSize: 13 }}>{msg}</p>}
        </div>
        <div className="ft">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn p" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </>
  );
}

function TitleList({ titles }: { titles: string[] }) {
  return <datalist id="st-titles">{titles.filter((t) => t !== MANAGER).map((t) => <option key={t} value={t} />)}</datalist>;
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="frow">
      <div><div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>{help && <div className="help">{help}</div>}</div>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}
