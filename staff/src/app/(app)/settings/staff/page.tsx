"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, STATUS_LABEL, TIER_LABEL, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { Head, Ico, IconBtn, useSetBranch } from "../ui";
import { CreateDrawer, EditDrawer } from "./drawers";
import Detail, { titleOf, type Preset } from "../perms/Detail";
import { isOn } from "@/lib/perm";

type StatusFilter = "all" | "active" | "leave" | "resigned";
const FILTERS: StatusFilter[] = ["all", "active", "leave", "resigned"];

export default function StaffSettings() {
  const me = useMe();
  const isAdmin = me.tier === "owner" || me.tier === "manager";
  const branch = useSetBranch(true);
  const [list, setList] = useState<Staff[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [err, setErr] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [detail, setDetail] = useState<Staff | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: p }, tp] = await Promise.all([
      sb.from("staff_accounts").select("*").order("tier").order("name"),
      sb.from("perm_catalog").select("*").order("sort"),
      sb.from("staff_title_perms").select("name,perms,sort").order("sort"),
    ]);
    setPresets((tp.data ?? []) as Preset[]);
    if (error) setErr(error.message);
    setList((s ?? []) as Staff[]);
    setPerms((p ?? []) as Perm[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const inBranch = useMemo(() => list.filter((s) => branch === "all" || s.branch === branch), [list, branch]);
  const shown = inBranch.filter((s) => status === "all" || s.status === status);
  const n = (k: StatusFilter) => inBranch.filter((s) => k === "all" || s.status === k).length;
  const canEdit = (t: Staff) => me.tier === "owner" || (me.tier === "manager" && t.tier === "staff");
  // 직급 기본값과 다른 칸 수 (예외)
  const excN = (s: Staff) => {
    const t = titleOf(s); if (!t) return 0;
    const base = presets.find((x) => x.name === t)?.perms ?? {};
    return perms.filter((x) => (s.tier === "staff" || x.owner_only) && JSON.stringify(isOn(s.perms?.[x.key]) ? s.perms[x.key] : null) !== JSON.stringify(isOn(base[x.key]) ? base[x.key] : null)).length;
  };
  const permText = (s: Staff) => (s.tier === "owner" ? "모든 권한" : s.tier === "manager" ? "관리자 권한" : `${perms.filter((x) => isOn(s.perms?.[x.key])).length}개 켬`) + (excN(s) ? ` · 예외 ${excN(s)}` : "");
  const titles = [...new Set(["@manager", ...presets.map((x) => x.name), ...list.filter((x) => x.tier === "staff").map((x) => x.title || "직원")])];
  const canDetail = (t: Staff) => t.tier !== "owner" && t.id !== me.id && (me.tier === "owner" || (me.tier === "manager" && t.tier === "staff" && t.branch === me.branch));
  const tierBadge = (s: Staff) => <span className={`badge ${s.tier === "staff" ? "" : "em"}`}>{TIER_LABEL[s.tier]}</span>;
  const stBadge = (s: Staff) => <span className={`badge ${s.status === "active" ? "ok" : s.status === "leave" ? "warn" : ""}`}>{STATUS_LABEL[s.status]}</span>;

  return (
    <>
      <Head title="직원" meta="직원 등록 · 직급" />
      <div className="st-bar">
        {FILTERS.map((k) => (
          <button key={k} className={`chip ${status === k ? "on" : ""}`} onClick={() => setStatus(k)}>
            {k === "all" ? "전체" : STATUS_LABEL[k]} <i>{n(k)}</i>
          </button>
        ))}
        {isAdmin && <div className="st-right"><button className="btn p" onClick={() => setCreating(true)}><Ico n="plus" />직원 추가</button></div>}
      </div>
      {err && <p className="st-msg">{err}</p>}
      {note && <p className="st-msg ok">{note}</p>}

      <div className="st-tbl st-pc">
        <table className="t">
          <thead><tr><th>이름</th><th>등급</th><th>직급</th><th>아이디</th><th>근무</th><th>입사일</th><th>세부설정</th><th>상태</th><th style={{ width: 64 }}>수정</th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td className="nm"><span className="st-dot" style={{ background: s.color ?? undefined }} />{s.name}</td>
                <td>{tierBadge(s)}</td>
                <td>{s.title ?? "-"}</td>
                <td>{s.login_id}</td>
                <td>{s.branch}</td>
                <td className="num">{s.hired_on ?? "-"}</td>
                <td className="st-detcell">{canDetail(s) ? <button className="pl-det" onClick={() => setDetail(s)}>세부설정</button> : null}<span>{permText(s)}</span></td>
                <td>{stBadge(s)}</td>
                <td>{canEdit(s) && <IconBtn n="edit" label="직원 수정" onClick={() => setEditing(s)} />}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="none">직원이 없어요</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="st-m">
        <div className="st-list">
          {shown.map((s) => (
            <div key={s.id} className="st-mrow">
              <button disabled={!canEdit(s)} onClick={() => setEditing(s)}>
                <span className="sq" style={{ background: s.color ?? "var(--line-strong)", borderRadius: "50%" }} />
                <span className="tx"><b>{s.name}{tierBadge(s)}</b><span>{[s.title, s.branch, STATUS_LABEL[s.status], permText(s)].filter(Boolean).join(" · ")}</span></span>
              </button>
              {canDetail(s) && <button className="pl-det" onClick={() => setDetail(s)}>세부설정</button>}
            </div>
          ))}
          {shown.length === 0 && <p className="st-foot">직원이 없어요</p>}
        </div>
      </div>

      {creating && <CreateDrawer titles={titles} presets={presets} onClose={() => setCreating(false)} onDone={load} />}
      {detail && (
        <Detail mode="person" target={detail.id} list={list} perms={perms} presets={presets} titles={titles}
          onClose={() => setDetail(null)} onDone={(m) => { setDetail(null); setNote(m); load(); }} />
      )}
      {editing && (
        <EditDrawer target={editing} titles={titles} presets={presets}
          onDetail={canDetail(editing) ? () => { const t = editing; setEditing(null); setDetail(t); } : undefined}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}
