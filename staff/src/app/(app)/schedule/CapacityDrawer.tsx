"use client";
import { useState } from "react";
import { sb } from "@/lib/sb";
import type { Program } from "@/lib/schedule";

// 프로그램별 같은 시간 정원 설정 (설정 변경 권한)
export default function CapacityDrawer({ programs, onClose, onSaved }: { programs: Program[]; onClose: () => void; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(programs.map((p) => [p.id, p.capacity])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const changed = programs.filter((p) => vals[p.id] !== p.capacity);

  const save = async () => {
    setBusy(true); setErr("");
    for (const p of changed) {
      const { error } = await sb.rpc("rsv_program_set_capacity", { p_id: p.id, p_capacity: vals[p.id] });
      if (error) { setBusy(false); return setErr(`${p.name}: ${error.message}`); }
    }
    setBusy(false);
    onSaved();
  };

  return (
    <>
      <div className="dim" style={{ zIndex: 20 }} onClick={onClose} />
      <aside className="drawer" style={{ zIndex: 21 }} role="dialog" aria-label="정원 설정">
        <div className="hd">정원 설정<div style={{ flex: 1 }} /><button className="btn t sm" onClick={onClose}>닫기</button></div>
        <div className="bd">
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginTop: 0 }}>같은 시간에 몇 명까지 받을 수 있는지 정해요. 두 지점에 같이 적용돼요.</p>
          {programs.map((p) => (
            <div key={p.id} className="frow" style={{ gridTemplateColumns: "1fr 120px", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{p.parent_id ? "└ " : ""}{p.name}</div>
                <div className="help num">{p.grp} · {p.minutes}분</div>
              </div>
              <input type="number" min={1} max={50} className="inp num" value={vals[p.id]}
                onChange={(e) => setVals({ ...vals, [p.id]: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          ))}
          {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        </div>
        <div className="ft">
          <button className="btn p" disabled={busy || changed.length === 0} onClick={save}>{changed.length ? `${changed.length}개 저장` : "저장"}</button>
        </div>
      </aside>
    </>
  );
}
