"use client";
import type { PermMap } from "./perm";
import { createBrowserClient } from "@supabase/ssr";

export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY!;
export const sb = createBrowserClient(SB_URL, SB_KEY);

// 아이디 → 내부 로그인 이메일 (직원에게는 보이지 않음)
export const emailOf = (id: string) => `${id.trim().toLowerCase()}@staff.mera.local`;
export const LOGIN_ID_RE = /^[a-z0-9_]{4,20}$/;

export type Tier = "owner" | "manager" | "staff";
export type Staff = {
  id: string; login_id: string; name: string; title: string | null; branch: string;
  tier: Tier; perms: PermMap; hired_on: string | null;
  status: "active" | "leave" | "resigned"; color: string | null; updated_at: string;
};
export type Perm = { key: string; menu: string; label: string; owner_only: boolean; sort: number };

export const TIER_LABEL: Record<Tier, string> = { owner: "대표관리자", manager: "관리자", staff: "직원" };
export const STATUS_LABEL = { active: "재직", leave: "휴직", resigned: "퇴사" } as const;
export const BRANCHES = ["의정부점", "양주점"];

export async function callFn<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data: { session } } = await sb.auth.getSession();
  const r = await fetch(`${SB_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", apikey: SB_KEY,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message ?? "요청이 실패했어요");
  return j as T;
}
