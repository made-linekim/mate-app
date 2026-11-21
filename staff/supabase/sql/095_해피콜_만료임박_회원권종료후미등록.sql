-- 095 해피콜 분류 고치기 (대표님 11/21): 잔여 0회·기간 끝난 고객이 '만료 임박'에 들어가던 것
--   1) 만료 임박(low) = 1~2회 남았거나 7일 안에 끝나는 회원권만 (회원권 화면과 같은 기준). 다른 사용 중 회원권이 있으면 빼요.
--   2) 새 분류 '회원권 종료 후 미등록'(ended) = 회원권이 모두 끝났고(잔여 0회·기간 지남·끝남) 새 회원권 없음, 다음 예약 없음.
--      끝난 날(ended_on) = 마지막 만료일과 마지막 방문일 중 늦은 날. 1년 안에 끝난 고객까지 보내고, 기간은 화면에서 골라요(기본 30일).
--   3) happycall_log 가 'ended' 결과를 받도록.
--   4) 장기 미방문 빼기: '다음 예약 없음'은 마지막 방문 7~90일 전만. 예전에 옮겨 온 해피콜 할 일도 마지막 방문 90일 넘은 고객은 빼요
--      (1,300~2,100일 전 고객이 75명 뜨던 것). 그런 고객은 고객 > 고객 목록 '장기 미방문' 칩에서 봐요.
-- 표는 바꾸지 않아요. happycall_board 는 돌려주는 칸(ended_on)이 하나 늘어서 지웠다가 다시 만들어요.
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run. 중간에 실패하면 아무것도 바뀌지 않아요.
begin;

drop function if exists public.happycall_board(text);
create or replace function public.happycall_board(p_branch text default null)
returns table(
  kind text, item_id uuid, customer_key text, branch text, name text, phone text,
  membership text, min_remaining int, last_visit_on date, registered_on date, next_rsv text,
  manager text, assignee text, why_a text, why_n text, why_b text, ended_on date,
  tags text, ad_consent text, kakao_url text,
  done boolean, result text, result_note text, log_id uuid
)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me()),
  d as (select (now() at time zone 'Asia/Seoul')::date as today),
  ok as (select public.can('customer.happycall') as v, public.can('customer.phone_full') as pf),
  c as (
    select c.* from public.customers c, m, ok
    where ok.v and (m.tier = 'owner' or c.branch = m.branch)
      and (p_branch is null or c.branch = p_branch)
  ),
  -- 회원권 상태 (회원권 화면과 같은 기준, 032): expired = 끝남·기간 지남·회차 다 씀, soon = 7일 안 끝남·1~2회 남음
  ms as (
    select m.id, m.branch, m.customer_key, m.end_on, m.kind, m.status,
      (select coalesce(sum(greatest(i.total - i.used, 0) + coalesce(i.service, 0)), 0) from public.rsv_membership_items i where i.membership_id = m.id) remain_cnt,
      (select coalesce(sum(i.total), 0) from public.rsv_membership_items i where i.membership_id = m.id) total_cnt
    from public.rsv_memberships m join c on c.key = m.customer_key and c.branch = m.branch
  ),
  ms2 as (
    select ms.*, case
      when ms.status = '끝남' or (ms.end_on is not null and ms.end_on < d.today) or (ms.kind = '회차' and ms.total_cnt > 0 and ms.remain_cnt <= 0) then 'expired'
      when (ms.end_on is not null and ms.end_on <= d.today + 7) or (ms.kind = '회차' and ms.remain_cnt between 1 and 2) then 'soon'
      else 'active' end st
    from ms, d
  ),
  mst as (
    select x.branch, x.customer_key,
      bool_or(x.st = 'soon') soon, bool_or(x.st = 'active') act, bool_or(x.st = 'expired') exp,
      max(x.end_on) filter (where x.st = 'expired' and x.end_on < d.today) exp_end,
      min(x.remain_cnt) filter (where x.st = 'soon' and x.kind = '회차' and x.total_cnt > 0) soon_left,
      min(x.end_on) filter (where x.st = 'soon') soon_end
    from ms2 x, d group by x.branch, x.customer_key
  ),
  nxt as (
    select distinct on (r.branch, r.customer_key) r.branch, r.customer_key, r.day, r.start_time
    from public.rsv_reservations r, d
    where r.customer_key is not null and r.status = '예약' and r.day >= d.today
    order by r.branch, r.customer_key, r.day, r.start_time
  ),
  today_log as (
    select distinct on (w.branch, w.customer_key) w.id, w.branch, w.customer_key, w.result_code, w.note, w.source, w.source_id, w.target
    from public.work_items w, d
    where w.kind = '해피콜' and w.customer_key is not null and w.result_code is not null
      and (w.logged_at at time zone 'Asia/Seoul')::date = d.today
    order by w.branch, w.customer_key, w.logged_at desc
  ),
  rest as (
    select distinct w.branch, w.customer_key from public.work_items w, d
    where w.kind = '해피콜' and w.customer_key is not null
      and ((w.done_at >= now() - interval '14 days') or (w.status = '진행' and coalesce(w.follow_day, d.today) > d.today))
  ),
  consult as (
    select n.customer_key, max(n.day) as day from public.consult_notes n group by n.customer_key
  ),
  todo as (
    select distinct on (w.branch, w.customer_key) w.id item_id, w.customer_key, w.branch, w.target, w.assignee, w.title,
      (w.due_at at time zone 'Asia/Seoul')::date due_day
    from public.work_items w, m, ok, d
    where ok.v and w.kind = '해피콜' and w.source <> 'mera' and w.customer_key is not null
      and (m.tier = 'owner' or w.branch = m.branch)
      and (p_branch is null or w.branch = p_branch)
      and (w.status in ('대기','기한지남') or (w.status = '진행' and coalesce(w.follow_day, d.today) <= d.today))
    order by w.branch, w.customer_key, w.due_at desc
  ),
  calc as (
    select distinct on (x.branch, x.key) x.kind, x.key, x.branch from (
      select 1 pr, 'new'::text kind, c.key, c.branch from c, d
      where c.registered_on >= d.today - 13
        and not exists (select 1 from nxt where nxt.branch = c.branch and nxt.customer_key = c.key)
      union all
      -- 만료 임박: 1~2회 남았거나 7일 안에 끝나는 회원권 (다른 사용 중 회원권이 있으면 빼요)
      select 2, 'low', c.key, c.branch from c join mst s on s.branch = c.branch and s.customer_key = c.key
      where s.soon and not s.act
      union all
      -- 회원권 종료 후 미등록: 회원권이 모두 끝났고 새 회원권 없음, 다음 예약 없음 (1년 안에 끝난 고객까지, 기간은 화면에서 골라요)
      select 3, 'ended', c.key, c.branch from c join mst s on s.branch = c.branch and s.customer_key = c.key, d
      where s.exp and not s.soon and not s.act
        and greatest(s.exp_end, c.last_visit_on) >= d.today - 365
        and not exists (select 1 from nxt where nxt.branch = c.branch and nxt.customer_key = c.key)
      union all
      select 4, 'norsv', c.key, c.branch from c, d
      -- 다음 예약 없음: 마지막 방문 7~90일 전만. 90일 넘은 고객은 '장기 미방문'이라 해피콜에서 빼요 (고객 목록 칩으로 봐요)
      where c.has_membership and c.last_visit_on between d.today - 90 and d.today - 7
        and not exists (select 1 from nxt where nxt.branch = c.branch and nxt.customer_key = c.key)
      union all
      select 5, 'consult', c.key, c.branch from c join consult k on k.customer_key = c.key, d
      where not coalesce(c.has_membership, false) and k.day between d.today - 60 and d.today - 1
    ) x
    order by x.branch, x.key, x.pr
  ),
  allr as (
    -- 예전 할 일 (같은 고객이 계산 대상이어도 할 일 한 줄로)
    select coalesce((select k.kind from calc k where k.branch = t.branch and k.key = t.customer_key),
      case t.target when '다음 예약 없음' then 'norsv' when '상담 후 미등록' then 'consult' else 'todo' end) kind,
      t.item_id, t.customer_key, t.branch, t.target, t.assignee, t.title, t.due_day,
      false done, null::text result, null::text result_note, null::uuid log_id
    from todo t cross join d
    left join c on c.key = t.customer_key and c.branch = t.branch
    where not exists (select 1 from today_log l where l.branch = t.branch and l.customer_key = t.customer_key)
      -- 예전에 옮겨 온 할 일 중 마지막 방문이 90일 넘은 고객(장기 미방문)은 빼요. 이번 분류에 걸린 고객은 그대로 둬요
      and (exists (select 1 from calc k where k.branch = t.branch and k.key = t.customer_key)
        or coalesce(c.last_visit_on, t.due_day) >= d.today - 90)
    union all
    select k.kind, null, k.key, k.branch, null, null, null, null, false, null, null, null
    from calc k
    where not exists (select 1 from rest where rest.branch = k.branch and rest.customer_key = k.key)
      and not exists (select 1 from today_log t where t.branch = k.branch and t.customer_key = k.key)
      and not exists (select 1 from todo t where t.branch = k.branch and t.customer_key = k.key)
    union all
    select case when l.source = 'mera' then split_part(l.source_id, ':', 1)
                when l.target = '다음 예약 없음' then 'norsv' when l.target = '상담 후 미등록' then 'consult' else 'todo' end,
      null, l.customer_key, l.branch, l.target, null, null, null, true, l.result_code, l.note, l.id
    from today_log l, m
    where (m.tier = 'owner' or l.branch = m.branch) and (p_branch is null or l.branch = p_branch)
  ),
  r2 as (
    select r.*, case when r.kind in ('new','low','norsv','consult','ended') then r.kind else 'todo' end k2,
      s.soon_left, s.soon_end, greatest(s.exp_end, c.last_visit_on) ended_on,
      c.name cname, c.phone, c.membership, c.min_remaining, c.last_visit_on, c.registered_on, c.manager, c.tags,
      c.ad_consent, c.kakao_room_url, c.key ckey, ks.day consult_day, n.day nday, n.start_time ntime, d.today
    from allr r cross join d
    left join c on c.key = r.customer_key and c.branch = r.branch
    left join consult ks on ks.customer_key = r.customer_key
    left join nxt n on n.customer_key = r.customer_key and n.branch = r.branch
    left join mst s on s.customer_key = r.customer_key and s.branch = r.branch
  )
  select r.k2, r.item_id, r.customer_key, r.branch, coalesce(r.cname, r.title),
    case when ok.pf then r.phone else regexp_replace(coalesce(r.phone,''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end,
    r.membership, case when r.k2 = 'low' then coalesce(r.soon_left, r.min_remaining) else r.min_remaining end, r.last_visit_on, r.registered_on,
    case when r.nday is null then null else to_char(r.nday, 'MM/DD') || ' ' || left(r.ntime, 5) end,
    r.manager, coalesce(r.assignee, r.manager),
    case r.k2 when 'new' then '등록 ' when 'low' then case when r.soon_left between 1 and 2 then '남은 횟수 ' else '회원권 끝나는 날까지 ' end
      when 'ended' then '회원권 끝난 뒤 '
      when 'norsv' then case when r.last_visit_on is null then '다음 예약 없음' else '마지막 이용 뒤 ' end
      when 'consult' then '상담 뒤 ' else coalesce(nullif(r.target, ''), '예약표 할 일') end,
    case r.k2 when 'new' then (r.today - r.registered_on + 1) || '일째'
      when 'low' then case when r.soon_left between 1 and 2 then r.soon_left || '회' else coalesce((r.soon_end - r.today) || '일', '') end
      when 'ended' then coalesce((r.today - r.ended_on) || '일', '')
      when 'norsv' then case when r.last_visit_on is null then '' else (r.today - r.last_visit_on) || '일' end
      when 'consult' then coalesce((r.today - coalesce(r.consult_day, r.registered_on, r.due_day)) || '일', '')
      else '' end,
    case r.k2 when 'new' then ', 다음 예약 없음' when 'low' then ', 재등록 안내 시점' when 'ended' then ' · 새 회원권 없음'
      when 'norsv' then case when r.last_visit_on is null then '' else ' 동안 예약 없음' end
      when 'consult' then ' 동안 등록 안 함' else '' end,
    case when r.k2 = 'ended' then r.ended_on end,
    r.tags, r.ad_consent,
    coalesce(nullif(r.kakao_room_url, ''),
      (select v.value from public.config_values v where v.key = 'kakao.channel_url' and (v.scope = r.branch or coalesce(v.scope, '') = '')
        order by (v.scope = r.branch) desc nulls last, v.effective_from desc nulls last limit 1)),
    r.done, r.result, r.result_note, r.log_id
  from r2 r cross join ok
  where ok.v and (r.done or ((r.ckey is not null or r.item_id is not null)
    and coalesce(r.tags, '') not like '%연락 원치 않음%'))
$$;


-- ───────── 3) happycall_log (결과 한 번 누르기) ─────────
create or replace function public.happycall_log(
  p_item uuid, p_customer_key text, p_branch text, p_kind text, p_result text,
  p_note text default '', p_follow_day date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.staff_accounts;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_status text;
  v_follow date;
  v_id uuid;
  v_branch text;
  v_name text;
begin
  select * into m from public.me();
  if m.id is null or not public.can('customer.happycall') then
    raise exception 'NO_PERMISSION' using errcode = '42501';
  end if;
  if p_result not in ('예약완료','통화완료','답장대기','부재','거절','해당없음') then
    raise exception 'BAD_RESULT';
  end if;
  v_status := case p_result when '부재' then '진행' when '답장대기' then '진행' when '해당없음' then '해당없음' else '완료' end;
  v_follow := case when v_status = '진행' then coalesce(p_follow_day, v_today + 1) else p_follow_day end;

  if p_item is not null then
    select branch into v_branch from public.work_items where id = p_item and kind = '해피콜';
    if v_branch is null then raise exception 'NOT_FOUND'; end if;
    if m.tier <> 'owner' and v_branch <> m.branch then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
    update public.work_items set
      status = v_status, result_code = p_result, note = coalesce(p_note,''),
      handler = m.name, actor = m.login_id, logged_at = now(),
      done_at = case when v_status = '진행' then null else now() end,
      follow_day = v_follow
    where id = p_item returning id into v_id;
    return v_id;
  end if;

  if p_kind not in ('expiring','lapsed','new','norsv','low','consult','ended') then raise exception 'BAD_KIND'; end if;
  if m.tier <> 'owner' and p_branch <> m.branch then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  select name into v_name from public.customers where key = p_customer_key and branch = p_branch;
  if v_name is null then raise exception 'NOT_FOUND'; end if;

  insert into public.work_items(kind, branch, assignee, actor, assigned_day, due_at, status, result_code,
    customer_key, source, source_id, metric_goal, title, target, note, follow_day, handler, done_at, logged_at)
  values ('해피콜', p_branch, m.name, m.login_id, v_today, now(), v_status, p_result,
    p_customer_key, 'mera', p_kind||':'||p_customer_key, '예약전환', v_name,
    case p_kind when 'expiring' then '회원권 만료 임박' when 'low' then '잔여 적음' when 'lapsed' then '장기 미방문'
      when 'norsv' then '다음 예약 없음' when 'ended' then '회원권 종료 후 미등록' when 'consult' then '상담 후 미등록' else '신규 케어' end,
    coalesce(p_note,''), v_follow, m.name, case when v_status = '진행' then null else now() end, now())
  on conflict (kind, source, source_id, assigned_day) do update set
    status = excluded.status, result_code = excluded.result_code, note = excluded.note,
    follow_day = excluded.follow_day, handler = excluded.handler, actor = excluded.actor,
    done_at = excluded.done_at, logged_at = excluded.logged_at
  returning id into v_id;
  return v_id;
end $$;


revoke all on function public.happycall_board(text) from public, anon;
revoke all on function public.happycall_log(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.happycall_board(text) to authenticated, service_role;
grant execute on function public.happycall_log(uuid, text, text, text, text, text, date) to authenticated, service_role;

commit;

-- 확인: select kind, count(*) from public.happycall_board('의정부점') group by kind;
