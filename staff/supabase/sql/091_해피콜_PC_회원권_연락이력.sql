-- 091 해피콜 PC 목록 (대표님 11/21): 고객마다 보유 회원권(남은 회차) · 유효기간 · 마지막 방문일
--     + 우리가 했던 연락 이력 1차~4차 (예: 1차 통화, 2차 부재)
-- 새 함수 1개만 만들어요. 표는 바꾸지 않아요. 읽기 전용.
--   happycall_extra(p_branch, p_keys) : 고객 key 목록 → [{key, membership, min_remaining, ends_on, last_visit_on, calls:[{n, result, note, at, by}]}]
--   calls = 해피콜 기록(work_items kind '해피콜', 결과가 남은 것) 중 최근 4번, 오래된 것부터. n = 그 고객의 몇 번째 연락인지.
-- 권한: customer.happycall 이 있고 자기 지점만 (대표관리자는 모든 지점).
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run.
begin;

create or replace function public.happycall_extra(p_branch text, p_keys text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can('customer.happycall') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  if coalesce(array_length(p_keys, 1), 0) = 0 then return '[]'::jsonb; end if;
  if array_length(p_keys, 1) > 500 then raise exception 'TOO_MANY'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', c.key, 'membership', c.membership, 'min_remaining', c.min_remaining,
      'ends_on', c.ends_on, 'last_visit_on', c.last_visit_on,
      'calls', coalesce((
        select jsonb_agg(jsonb_build_object('n', h.n, 'result', h.result_code, 'note', nullif(h.note, ''), 'at', h.logged_at, 'by', h.handler) order by h.n)
        from (
          select x.*, row_number() over (order by x.logged_at) n, count(*) over () total
          from public.work_items x
          where x.kind = '해피콜' and x.branch = c.branch and x.customer_key = c.key
            and x.result_code is not null and x.result_code <> '해당없음' and x.logged_at is not null
        ) h
        where h.n > h.total - 4
      ), '[]'::jsonb)
    ))
    from public.customers c
    where c.branch = p_branch and c.key = any(p_keys)
  ), '[]'::jsonb);
end $$;

revoke all on function public.happycall_extra(text, text[]) from public, anon;
grant execute on function public.happycall_extra(text, text[]) to authenticated, service_role;

commit;

-- 확인: select proname from pg_proc where proname = 'happycall_extra';
