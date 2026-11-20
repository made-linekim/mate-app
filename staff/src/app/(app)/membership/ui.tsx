"use client";
import { BRANCHES } from "@/lib/sb";
import { useMe } from "@/lib/me";

/* 지점 고르기: 대표관리자만 보임, 나머지는 자기 지점 고정 */
export function useBranchPick(): string {
  const me = useMe();
  return me.branch || BRANCHES[0];
}

export function BranchOne({ value, onChange }: { value: string; onChange: (b: string) => void }) {
  const me = useMe();
  if (me.tier !== "owner") return null;
  return (
    <div className="seg">
      {BRANCHES.map((b) => (
        <button key={b} className={value === b ? "on" : ""} onClick={() => onChange(b)}>{b}</button>
      ))}
    </div>
  );
}

/* KPI 칸: 폭을 똑같이 나눠 한쪽으로 쏠리지 않게 */
export function Kpis({ items }: { items: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 12, margin: "16px 0" }}>
      {items.map((k) => (
        <div key={k.label} className="card" style={{ minHeight: "var(--kpi-h)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>{k.label}</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 700, color: k.strong ? "var(--red)" : "var(--ink)" }}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}

export const friendly = (m: string) =>
  /permission|denied|권한/i.test(m) ? "이 화면을 볼 권한이 없어요" : "불러오지 못했어요. 잠시 뒤 다시 시도해 주세요";
