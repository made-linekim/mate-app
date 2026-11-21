"use client";
import { useEffect, useState } from "react";
import { BRANCHES, type Staff } from "@/lib/sb";

// 상단바 지점 선택 (대표관리자만 바꿀 수 있어요). 다른 화면은 useTopBranch(me)로 같은 값을 써요.
const KEY = "mera.topBranch";
const EV = "branch:change";

export function readTopBranch(me: Pick<Staff, "tier" | "branch">): string {
  if (me.tier !== "owner") return me.branch;
  try { const v = localStorage.getItem(KEY); if (v && (BRANCHES as readonly string[]).includes(v)) return v; } catch {}
  return me.branch;
}

export function setTopBranch(b: string) {
  try { localStorage.setItem(KEY, b); } catch {}
  window.dispatchEvent(new CustomEvent(EV, { detail: b }));
}

export function useTopBranch(me: Pick<Staff, "tier" | "branch">): [string, (b: string) => void] {
  const [b, setB] = useState(me.branch);
  useEffect(() => {
    setB(readTopBranch(me));
    const on = (e: Event) => setB((e as CustomEvent<string>).detail);
    window.addEventListener(EV, on);
    return () => window.removeEventListener(EV, on);
  }, [me]);
  return [b, setTopBranch];
}

/** 화면 안의 지점 값이 상단바 지점을 따라가게 해요 (처음 열 때 + 바꿀 때마다) */
export function useFollowTop(me: Pick<Staff, "tier" | "branch">, set: (b: string) => void) {
  const [top] = useTopBranch(me);
  useEffect(() => { set(top); }, [top]); // eslint-disable-line react-hooks/exhaustive-deps
}
