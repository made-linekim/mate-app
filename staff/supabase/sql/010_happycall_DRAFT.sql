-- 해피콜 대상 화면용 RPC 초안 (2026-11-18, 해피콜 스레드)
-- 테이블 변경 없음. work_items(kind='해피콜')를 그대로 씀.
-- 1) 권한 키 추가  2) happycall_list  3) happycall_log  4) GRANT

-- 1) 권한 키: 해피콜 보기·결과 기록 (관리자는 자동 허용, 직원은 스위치)
insert into public.perm_catalog(key, menu, label, owner_only, sort)
values ('customer.happycall', '고객', '해피콜 대상 보기·결과 기록', false,
        coalesce((select max(sort) from public.perm_catalog where menu = '고객'), 0) + 1)
on conflict (key) do nothing;

-- 2) 해피콜 대상 목록
--   kind: todo(뷰티사랑넷에서 가져온 해피콜 할 일) / expiring(회원권 만료 임박)
--         lapsed(회원권 있는데 22~120일 미방문, 그보다 오래된 건 이탈로 보고 제외) / new(신규 첫 방문 후 14일 이내)
--   최근 14일 안에 MERA에서 같은 사유로 통화 기록이 있으면 계산 대상(expiring/lapsed/new)에서 뺌
create or replace function public.happycall_list(p_branch text default null)
returns table(
  kind text, item_id uuid, customer_key text, branch text, name text, phone text, manager text,
  reason text, status text, due_day date, follow_day date, assignee text,
  membership text, min_remaining integer, ends_on date, last_visit_on date, registered_on date,
  last_result text, last_note text, last_called_at timestamptz, last_handler text
)
language sql stable security definer set search_path to 'public' as $$
  with m as (select * from public.me()),
  d as (select (now() at time zone 'Asia/Seoul')::date as today),
  ok as (select public.can('customer.happycall') as v, public.can('customer.phone_full') as pf),
  c as (
    select c.* from public.customers c, m, ok
    where ok.v and (m.tier = 'owner' or c.branch = m.branch)
      and (p_branch is null or c.branch = p_branch)
  ),
  last_call as (
    select distinct on (w.branch, w.customer_key) w.branch, w.customer_key, w.result_code, w.note, w.done_at, w.handler, w.source, w.source_id
    from public.work_items w
    where w.kind = '해피콜' and w.done_at is not null and w.customer_key is not null
    order by w.branch, w.customer_key, w.done_at desc
  ),
  todo as (
    select 'todo'::text kind, w.id item_id, w.customer_key, w.branch, w.target reason, w.status,
           (w.due_at at time zone 'Asia/Seoul')::date due_day, w.follow_day, w.assignee, w.title
    from public.work_items w, m, ok, d
    where ok.v and w.kind = '해피콜'
      and (m.tier = 'owner' or w.branch = m.branch)
      and (p_branch is null or w.branch = p_branch)
      and (w.status in ('대기','기한지남') or (w.status = '진행' and coalesce(w.follow_day, d.today) <= d.today))
  ),
  calc as (
    select x.kind, x.key, x.branch, x.reason from (
      select 'expiring'::text kind, c.key, c.branch,
             case when c.min_remaining <= 2 then '잔여 '||c.min_remaining||'회' else '만료 '||to_char(c.ends_on,'MM/DD') end reason
      from c, d where c.has_membership and (c.min_remaining <= 2 or c.ends_on between d.today and d.today + 14)
      union all
      select 'lapsed', c.key, c.branch, (d.today - c.last_visit_on)||'일 미방문'
      from c, d where c.has_membership and c.last_visit_on between d.today - 120 and d.today - 22
      union all
      select 'new', c.key, c.branch, '첫 방문 후 '||(d.today - c.last_visit_on)||'일'
      from c, d where c.registered_on >= d.today - 14 and c.last_visit_on < d.today
    ) x, d
    where not exists (
      select 1 from public.work_items w
      where w.kind = '해피콜' and w.source = 'mera' and w.source_id = x.kind||':'||x.key
        and w.branch = x.branch and w.customer_key = x.key
        and (w.done_at >= now() - interval '14 days' or w.status = '진행')  -- 부재로 진행 중인 건 '오늘 할 일'로 다시 뜸
    )
  )
  select t.kind, t.item_id, t.customer_key, t.branch, coalesce(c.name, t.title) as name,
    case when ok.pf then c.phone else regexp_replace(coalesce(c.phone,''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end as phone,
    c.manager, t.reason, t.status, t.due_day, t.follow_day, t.assignee,
    c.membership, c.min_remaining, c.ends_on, c.last_visit_on, c.registered_on,
    lc.result_code, lc.note, lc.done_at, lc.handler
  from todo t cross join ok
  left join c on c.key = t.customer_key and c.branch = t.branch
  left join last_call lc on lc.customer_key = t.customer_key and lc.branch = t.branch
  union all
  select k.kind, null::uuid, k.key, k.branch, c.name,
    case when ok.pf then c.phone else regexp_replace(coalesce(c.phone,''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end as phone,
    c.manager, k.reason, '대기', null, null, c.manager,
    c.membership, c.min_remaining, c.ends_on, c.last_visit_on, c.registered_on,
    lc.result_code, lc.note, lc.done_at, lc.handler
  from calc k cross join ok
  join c on c.key = k.key and c.branch = k.branch
  left join last_call lc on lc.customer_key = k.key and lc.branch = k.branch
$$;

-- 3) 통화 결과 기록
--   p_item 있으면 그 할 일을 갱신, 없으면 MERA 계산 대상이라 새 줄을 만듦(source='mera', source_id=kind:고객키)
--   결과: 예약완료 / 통화완료 / 부재 / 거절 / 해당없음
--   부재는 '진행' 상태로 두고 다음 연락일(기본 내일)에 다시 뜸
create or replace function public.happycall_log(
  p_item uuid, p_customer_key text, p_branch text, p_kind text,
  p_result text, p_note text default '', p_follow_day date default null
) returns uuid
language plpgsql volatile security definer set search_path to 'public' as $$
declare
  m public.staff_accounts;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_status text;
  v_id uuid;
  v_branch text;
  v_name text;
begin
  select * into m from public.me();
  if m.id is null or not public.can('customer.happycall') then
    raise exception 'NO_PERMISSION' using errcode = '42501';
  end if;
  if p_result not in ('예약완료','통화완료','부재','거절','해당없음') then
    raise exception 'BAD_RESULT';
  end if;
  v_status := case p_result when '부재' then '진행' when '해당없음' then '해당없음' else '완료' end;

  if p_item is not null then
    select branch into v_branch from public.work_items where id = p_item and kind = '해피콜';
    if v_branch is null then raise exception 'NOT_FOUND'; end if;
    if m.tier <> 'owner' and v_branch <> m.branch then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
    update public.work_items set
      status = v_status, result_code = p_result, note = coalesce(p_note,''),
      handler = m.name, actor = m.login_id,
      done_at = case when v_status = '진행' then null else now() end,
      follow_day = case when v_status = '진행' then coalesce(p_follow_day, v_today + 1) else p_follow_day end
    where id = p_item returning id into v_id;
    return v_id;
  end if;

  if p_kind not in ('expiring','lapsed','new') then raise exception 'BAD_KIND'; end if;
  if m.tier <> 'owner' and p_branch <> m.branch then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  select name into v_name from public.customers where key = p_customer_key and branch = p_branch;
  if v_name is null then raise exception 'NOT_FOUND'; end if;

  insert into public.work_items(kind, branch, assignee, actor, assigned_day, due_at, status, result_code,
    customer_key, source, source_id, metric_goal, title, target, note, follow_day, handler, done_at)
  values ('해피콜', p_branch, m.name, m.login_id, v_today, now(), v_status, p_result,
    p_customer_key, 'mera', p_kind||':'||p_customer_key, '예약전환', v_name,
    case p_kind when 'expiring' then '회원권 만료 임박' when 'lapsed' then '장기 미방문' else '신규 케어' end,
    coalesce(p_note,''),
    case when v_status = '진행' then coalesce(p_follow_day, v_today + 1) else p_follow_day end,
    m.name, case when v_status = '진행' then null else now() end)
  on conflict (kind, source, source_id, assigned_day) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- 4) 권한: RPC만 열고 work_items 직접 접근은 그대로 막음
revoke all on function public.happycall_list(text) from public, anon;
revoke all on function public.happycall_log(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.happycall_list(text) to authenticated, service_role;
grant execute on function public.happycall_log(uuid, text, text, text, text, text, date) to authenticated, service_role;
