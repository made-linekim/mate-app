import { sb } from "@/lib/sb";
import type { Cond } from "./cond";

export type Row = {
  key: string; branch: string; customer_no: string | null; name: string; phone: string | null; manager: string | null;
  registered_on: string | null; last_visit_on: string | null; membership: string | null; has_membership: boolean | null;
  min_remaining: number | null; ends_on: string | null; source: string | null; tags: string | null; total: number;
};

// 조건으로 찾기. customer_search 가 아직 없으면 예전 customer_list 로 되는 조건만 찾아요.
export async function searchCustomers(conds: Cond[], q: string, branch: string | null, limit: number, offset: number) {
  const r = await sb.rpc("customer_search", { p_branch: branch, p_conds: conds, p_q: q || null, p_limit: limit, p_offset: offset });
  if (!r.error || !/customer_search|function|schema cache/i.test(r.error.message)) return { data: (r.data ?? []) as Row[], error: r.error?.message ?? "" };
  const map: Record<string, string> = { member: "member", period_hold: "member", dormant: "dormant", count_left: "expiring" };
  const f = conds.length === 0 ? "all" : conds.length === 1 ? map[conds[0].t] : undefined;
  if (!f) return { data: [] as Row[], error: "NEED_SQL" };
  const o = await sb.rpc("customer_list", { p_q: q || null, p_branch: branch, p_filter: f, p_limit: limit, p_offset: offset });
  return { data: (o.data ?? []) as Row[], error: o.error?.message ?? "" };
}

