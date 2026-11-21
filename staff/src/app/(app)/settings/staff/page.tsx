"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, STATUS_LABEL, TIER_LABEL, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { Chip, HelpD, Msg, PageH, useBranch } from "../kit";
import { CreateDrawer, EditDrawer } from "./drawers";
import { titleOf, type Preset } from "../perms/roles";
import { isOn } from "@/lib/perm";

type StatusFilter = "all" | "active" | "leave" | "resigned";
const FILTERS: StatusFilter[] = ["all", "active", "leave", "resigned"];

export default function StaffSettings() {
  const me = useMe();
  const isAdmin = me.tier === "owner" || me.tier === "manager";
  const { branch, pick } = useBranch();
  const [list, setList] = useState<Staff[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [err, setErr] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
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
  const shown = inBranch.filter((s) => s.status !== "resigned");
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

  const roleName = (s: Staff) => TIER_LABEL[s.tier];
  const ext = (s: Staff) => s as Staff & { team?: string | null; level?: number | null };
  const total = inBranch.filter((s) => s.tier !== "owner" && s.status !== "resigned");

  return (
    <div className="ct">
      <PageH title="직원" sub={`${branch === "all" ? "전 지점" : branch} · 역할과 직무, 팀`}>
        <Msg text={note || err} />
        {isAdmin && <button className="btn p sm" onClick={() => setCreating(true)}>직원 등록</button>}
      </PageH>
      {pick}
      <div className="body">
        <div className="ltool">
          <span className="help">{branch === "all" ? "전 지점" : branch} · {total.length}명</span>
        </div>
        <div className="v3card">
          <table className="tbl">
            <tbody>
              <tr><th>이름</th><th>역할</th><th>직무</th><th>팀</th><th className="num">레벨</th><th>근무 지점</th><th>상태</th></tr>
              {shown.filter((s) => s.tier !== "owner").map((s) => (
                <tr key={s.id} style={canEdit(s) ? { cursor: "pointer" } : undefined} onClick={() => canEdit(s) && setEditing(s)} title={permText(s)}>
                  <td>{s.name}</td><td>{roleName(s)}</td><td>{s.title ?? "—"}</td><td>{ext(s).team || "—"}</td>
                  <td className="num">{ext(s).level ?? "—"}</td><td>{s.branch}</td>
                  <td><span className={`badge ${s.status === "active" ? "ok" : s.status === "leave" ? "caution" : ""}`}>{STATUS_LABEL[s.status]}</span></td>
                </tr>
              ))}
              {shown.filter((s) => s.tier !== "owner").length === 0 && <tr><td colSpan={7}>직원이 없어요</td></tr>}
            </tbody>
          </table>
        </div>
        <HelpD>{[shown.filter((s) => s.tier !== "owner" && !ext(s).team).map((s) => s.name).join("·") && `${shown.filter((s) => s.tier !== "owner" && !ext(s).team).map((s) => s.name).join("·")}은 아직 팀에 넣지 않았어요.`, "대표관리자는 이 지점 목록에 두지 않아요. 줄을 누르면 고칠 수 있어요. 권한은 설정 › 권한에서 봐요."].filter(Boolean).join(" ")}</HelpD>
      </div>

      {creating && <CreateDrawer titles={titles} presets={presets} onClose={() => setCreating(false)} onDone={load} />}
      {editing && (
        <EditDrawer target={editing} titles={titles} presets={presets}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
