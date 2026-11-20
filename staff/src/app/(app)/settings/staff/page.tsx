"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, STATUS_LABEL, TIER_LABEL, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { Head, Ico, IconBtn, useSetBranch } from "../ui";
import { CreateDrawer, EditDrawer } from "./drawers";

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

  const inBranch = useMemo(() => list.filter((s) => branch === "all" || s.branch === branch), [list, branch]);
  const shown = inBranch.filter((s) => status === "all" || s.status === status);
  const n = (k: StatusFilter) => inBranch.filter((s) => k === "all" || s.status === k).length;
  const canEdit = (t: Staff) => me.tier === "owner" || (me.tier === "manager" && t.tier === "staff");
  const permText = (s: Staff) => (s.tier === "staff" ? `${Object.values(s.perms ?? {}).filter(Boolean).length}개 켜짐` : "전체 권한");
  const tierBadge = (s: Staff) => <span className={`badge ${s.tier === "staff" ? "" : "em"}`}>{TIER_LABEL[s.tier]}</span>;
  const stBadge = (s: Staff) => <span className={`badge ${s.status === "active" ? "ok" : s.status === "leave" ? "warn" : ""}`}>{STATUS_LABEL[s.status]}</span>;

  return (
    <>
      <Head title="직원" />
      <div className="st-bar">
        {FILTERS.map((k) => (
          <button key={k} className={`chip ${status === k ? "on" : ""}`} onClick={() => setStatus(k)}>
            {k === "all" ? "전체" : STATUS_LABEL[k]} <i>{n(k)}</i>
          </button>
        ))}
        {isAdmin && <div className="st-right"><button className="btn p" onClick={() => setCreating(true)}><Ico n="plus" />직원 추가</button></div>}
      </div>
      {err && <p className="st-msg">{err}</p>}

      <div className="st-tbl st-pc">
        <table className="t">
          <thead><tr><th>이름</th><th>역할</th><th>직무</th><th>아이디</th><th>근무</th><th>입사일</th><th>권한</th><th>상태</th><th style={{ width: 64 }}>관리</th></tr></thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td className="nm"><span className="st-dot" style={{ background: s.color ?? undefined }} />{s.name}</td>
                <td>{tierBadge(s)}</td>
                <td>{s.title ?? "-"}</td>
                <td>{s.login_id}</td>
                <td>{s.branch}</td>
                <td className="num">{s.hired_on ?? "-"}</td>
                <td className="num" style={{ color: "var(--ink-3)", fontSize: "var(--fs-sm)" }}>{permText(s)}</td>
                <td>{stBadge(s)}</td>
                <td>{canEdit(s) && <IconBtn n="edit" label="세부설정" onClick={() => setEditing(s)} />}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="none">직원이 없어요</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="st-m">
        <div className="st-list">
          {shown.map((s) => (
            <button key={s.id} disabled={!canEdit(s)} onClick={() => setEditing(s)}>
              <span className="sq" style={{ background: s.color ?? "var(--line-strong)", borderRadius: "50%" }} />
              <span className="tx"><b>{s.name}{tierBadge(s)}</b><span>{[s.title, s.branch, STATUS_LABEL[s.status], permText(s)].filter(Boolean).join(" · ")}</span></span>
              {canEdit(s) && <span className="ch"><Ico n="chev" /></span>}
            </button>
          ))}
          {shown.length === 0 && <p className="st-foot">직원이 없어요</p>}
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
