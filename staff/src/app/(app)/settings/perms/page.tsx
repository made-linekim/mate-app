"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, type Perm, type Staff } from "@/lib/sb";
import { useMe } from "@/lib/me";
import { Check, Head, Msg, useSetBranch } from "../ui";

type Draft = Record<string, Record<string, boolean>>; // staff id → perms

/* 권한 (시안 11-12): 할 수 있는 일 × 사람 표.
   대표관리자 · 관리자 열은 등급으로 정해져 바꿀 수 없고, 직원은 사람마다 켜요.
   규칙은 직원 세부설정과 같아요: 관리자는 '대표관리자만' 칸을 못 바꾸고, 그 칸은 대상의 원래 값을 지켜요. */
export default function PermsPage() {
  const me = useMe();
  const isOwner = me.tier === "owner";
  const isAdmin = isOwner || me.tier === "manager";
  const branch = useSetBranch(true);
  const [list, setList] = useState<Staff[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: s, error }, { data: p }] = await Promise.all([
      sb.from("staff_accounts").select("*").order("tier").order("name"),
      sb.from("perm_catalog").select("*").order("sort"),
    ]);
    if (error) setMsg(error.message);
    const rows = (s ?? []) as Staff[];
    setList(rows); setPerms((p ?? []) as Perm[]);
    setDraft(Object.fromEntries(rows.map((r) => [r.id, { ...(r.perms ?? {}) }])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const cols = useMemo(() => list.filter((s) => s.tier === "staff" && s.status !== "resigned" && (branch === "all" || s.branch === branch)), [list, branch]);
  const menus = useMemo(() => {
    const m = new Map<string, Perm[]>();
    perms.forEach((x) => m.set(x.menu, [...(m.get(x.menu) ?? []), x]));
    return [...m.entries()];
  }, [perms]);

  const canEdit = (t: Staff) => isOwner || (me.tier === "manager" && t.tier === "staff");
  const locked = (x: Perm) => x.owner_only && !isOwner;
  // 저장할 값: 관리자는 '대표관리자만' 권한을 대상의 기존 값 그대로 둬요 (세부설정 mergeFor 와 같음)
  const finalFor = (s: Staff) => {
    const d = draft[s.id] ?? {};
    const out: Record<string, boolean> = {};
    // 대표가 저장할 땐 세부설정처럼 목록에 없는 값도 그대로 둬요
    if (isOwner) Object.keys(d).forEach((k) => { if (d[k] && !perms.some((x) => x.key === k)) out[k] = true; });
    perms.forEach((x) => {
      const v = x.owner_only && !isOwner ? !!s.perms?.[x.key] : !!d[x.key];
      if (v) out[x.key] = true;
    });
    return out;
  };
  const same = (a: Record<string, boolean>, b: Record<string, boolean>) => {
    return perms.every((x) => !!a[x.key] === !!b[x.key]);
  };
  const changed = cols.filter((s) => canEdit(s) && !same(finalFor(s), s.perms ?? {}));
  const rowChanged = (x: Perm) => changed.some((s) => !!draft[s.id]?.[x.key] !== !!s.perms?.[x.key]);

  const toggle = (s: Staff, key: string, v: boolean) => {
    const n = { ...(draft[s.id] ?? {}) };
    if (v) n[key] = true; else delete n[key];
    setDraft({ ...draft, [s.id]: n });
  };

  async function save() {
    setMsg(""); setBusy(true);
    try {
      for (const s of changed) {
        const { error } = await sb.from("staff_accounts").update({ perms: finalFor(s) }).eq("id", s.id);
        if (error) throw new Error(`${s.name}: ${error.message}`);
      }
      setMsg("저장했어요"); await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Head title="권한">
        <Msg text={msg} />
        {changed.length > 0 && <span className="st-ro">{changed.length}명 바뀜</span>}
        {isAdmin && <button className="btn p" disabled={busy || changed.length === 0} onClick={save}>{busy ? "저장 중…" : "저장"}</button>}
      </Head>
      <div className="st-tbl st-perm">
        <table className="t">
          <thead>
            <tr>
              <th>할 수 있는 일</th>
              <th className="c"><span className="who">대표관리자</span></th>
              <th className="c"><span className="who">관리자</span></th>
              {cols.map((s) => <th key={s.id} className="c"><span className="who">{s.name}<small>{s.title || "직원"}</small></span></th>)}
            </tr>
          </thead>
          <tbody>
            {menus.map(([menu, ps]) => [
              <tr key={menu} className="grp"><td colSpan={3 + cols.length}>{menu}</td></tr>,
              ...ps.map((x) => (
                <tr key={x.key} className={rowChanged(x) ? "chg" : ""}>
                  <td>{x.label}{x.owner_only && <span className="badge">대표관리자만</span>}</td>
                  <td className="c"><Check on fixed label={`대표관리자 ${x.label}`} /></td>
                  <td className="c"><Check on={!x.owner_only} fixed label={`관리자 ${x.label}`} /></td>
                  {cols.map((s) => (
                    <td key={s.id} className="c">
                      <Check on={!!draft[s.id]?.[x.key]} disabled={!canEdit(s) || locked(x)} label={`${s.name} ${x.label}`}
                        onChange={(v) => toggle(s, x.key, v)} />
                    </td>
                  ))}
                </tr>
              )),
            ])}
            {cols.length === 0 && perms.length > 0 && <tr><td colSpan={3} className="none">이 지점에 직원 등급 직원이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="st-foot">대표관리자 · 관리자 열은 바꿀 수 없어요. 관리자는 &lsquo;대표관리자만&rsquo; 권한을 뺀 전부를 써요. 직원은 사람마다 켜고, 한 사람씩 자세히 볼 땐 직원 › 세부설정을 써요.</p>
    </>
  );
}
