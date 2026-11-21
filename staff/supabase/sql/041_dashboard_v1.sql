-- 041 대시보드 (한눈에 · 목표 · 직원 성장 · 팀전) · 2026-11-21
-- SQL 편집기에서 한 번에 실행해요. 표 3개 추가(목표, 목표 변경 이력, 팀) + 함수 9개. 기존 표는 바꾸지 않아요.
-- 권한(3단계):
--   매출 숫자(월 매출 막대·매출 목표 금액·팀 매출)는 can('sales.others') 인 사람만. 대표관리자는 항상, 관리자·직원은 대표관리자가 켜 줬을 때만.
--   직원별 매출 순위·직원별 달성률·지점 직원 순위는 대표관리자·관리자만.
--   직원은 내 목표(방문·재등록)와 내 레벨(점수 출처는 비율로만)만 봐요.
--   목표·팀 정하기는 대표관리자·관리자(settings.edit). 관리자는 자기 지점만.

begin;

-- 1) 표 ---------------------------------------------------------------
create table if not exists public.dash_goals (
  branch text not null,
  month date not null,                         -- 그 달 1일
  metric text not null check (metric in ('sales','visit','rereg')),
  staff_key text not null default '',          -- '' = 지점 전체, 아니면 staff_accounts.id
  target bigint not null check (target >= 0),
  updated_by text, updated_at timestamptz not null default now(),
  primary key (branch, month, metric, staff_key)
);
create table if not exists public.dash_goal_logs (
  id uuid primary key default gen_random_uuid(),
  branch text not null, month date not null, metric text not null, staff_key text not null default '',
  before bigint, after bigint, by_name text, by_tier text, at timestamptz not null default now()
);
create table if not exists public.dash_teams (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  branch text not null,
  name text not null,
  members uuid[] not null default '{}',
  target int not null default 800,
  created_by text, created_at timestamptz not null default now()
);
alter table public.dash_goals enable row level security;
alter table public.dash_goal_logs enable row level security;
alter table public.dash_teams enable row level security;
-- 화면은 아래 함수로만 읽고 써요. 직접 select 는 열지 않아요.
grant select, insert, update, delete on public.dash_goals, public.dash_goal_logs, public.dash_teams to service_role;

-- 2) 내부: 이번 달 점수 (직접 호출 금지) ---------------------------------
create or replace function public.dash_rules() returns jsonb language sql stable security definer set search_path = public as $$
  select '{"sales_per":100000,"sales_pt":5,"rereg":30,"call":2,"log":2,"review":20,"levels":[0,500,1000,1500,2000],"names":["새싹","성장","숙련","고수","마스터"]}'::jsonb
    || coalesce((select value from public.rsv_settings where key = 'dash_score' and scope = 'all'), '{}'::jsonb)
$$;

create or replace function public.dash_scores(p_branch text, p_month date)
returns table(staff_id uuid, name text, title text, tier text, branch text,
  sales bigint, rereg int, calls int, logs int, reviews int,
  s_sales int, s_rereg int, s_call int, s_log int, s_review int, score int)
language sql stable security definer set search_path = public as $$
  with r as (select public.dash_rules() j),
  d as (select date_trunc('month', p_month)::date a, (date_trunc('month', p_month) + interval '1 month')::date b),
  s as (select * from public.staff_accounts x where x.status = 'active' and (p_branch is null or x.branch = p_branch)),
  agg as (
    select s.id, s.name, s.title, s.tier, s.branch,
      coalesce((select sum(case when p.is_refund then -p.amount else p.amount end) from public.payments p, d
        where p.voided_at is null and p.staff_name = s.name and p.branch = s.branch and p.day >= d.a and p.day < d.b), 0)::bigint sales,
      (select count(*) from public.rsv_memberships m, d
        where m.branch = s.branch and m.sold_by in (s.name, s.id::text, s.login_id)
          and (m.sold_at at time zone 'Asia/Seoul')::date >= d.a and (m.sold_at at time zone 'Asia/Seoul')::date < d.b
          and exists (select 1 from public.rsv_memberships o where o.customer_key = m.customer_key and o.id <> m.id and o.start_on < m.start_on))::int rereg,
      (select count(*) from public.work_items w, d
        where w.kind = '해피콜' and w.branch = s.branch and (w.actor = s.login_id or w.handler = s.name)
          and (w.logged_at at time zone 'Asia/Seoul')::date >= d.a and (w.logged_at at time zone 'Asia/Seoul')::date < d.b)::int calls,
      (select count(*) from public.exercise_logs e, d
        where e.branch = s.branch and e.staff_name = s.name and e.day >= d.a and e.day < d.b)::int logs,
      0 reviews  -- 후기 데이터가 생기면 여기에 더해요
    from s
  )
  select a.id, a.name, a.title, a.tier, a.branch, a.sales, a.rereg, a.calls, a.logs, a.reviews,
    x.ss, x.sr, x.sc, x.sl, x.sv, x.ss + x.sr + x.sc + x.sl + x.sv
  from agg a, r,
  lateral (select
    (greatest(a.sales, 0) / greatest((r.j->>'sales_per')::int, 1) * (r.j->>'sales_pt')::int)::int ss,
    a.rereg * (r.j->>'rereg')::int sr, a.calls * (r.j->>'call')::int sc,
    a.logs * (r.j->>'log')::int sl, a.reviews * (r.j->>'review')::int sv) x
$$;
revoke all on function public.dash_rules() from public, anon, authenticated;
revoke all on function public.dash_scores(text, date) from public, anon, authenticated;

-- 3) 한눈에 ----------------------------------------------------------
create or replace function public.dash_glance(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_a date; v_b date; v_sales boolean; v_lead boolean; v_cust boolean; v_all boolean; out jsonb;
begin
  select * into m from public.me();
  if m.id is null or not public.branch_ok(p_branch) then raise exception '이 지점을 볼 수 없어요.'; end if;
  v_a := date_trunc('month', v_today)::date; v_b := (v_a + interval '1 month')::date;
  v_sales := public.can('sales.others'); v_lead := m.tier in ('owner','manager');
  v_cust := public.can('customer.view'); v_all := public.can('schedule.view_others');

  out := jsonb_build_object(
    'today', v_today, 'tier', m.tier, 'show_sales', v_sales, 'show_rank', v_sales and v_lead, 'show_customers', v_cust,
    'rsv_today', (select count(*) from public.rsv_reservations r where r.branch = p_branch and r.day = v_today
        and r.customer_key is not null and r.status not in ('취소') and (v_all or r.staff_id = m.id::text)),
    'visit_today', (select count(distinct r.customer_key) from public.rsv_reservations r where r.branch = p_branch and r.day = v_today
        and r.status = '완료' and (v_all or r.staff_id = m.id::text)),
    'rereg_done', (select count(*) from public.rsv_memberships x where x.branch = p_branch
        and (x.sold_at at time zone 'Asia/Seoul')::date >= v_a and (x.sold_at at time zone 'Asia/Seoul')::date < v_b
        and exists (select 1 from public.rsv_memberships o where o.customer_key = x.customer_key and o.id <> x.id and o.start_on < x.start_on)),
    'rereg_due', (select count(distinct x.customer_key) from public.rsv_memberships x where x.branch = p_branch
        and x.end_on >= v_a and x.end_on < v_b),
    'risk_count', (select count(*) from public.customers c where c.branch = p_branch and c.has_membership
        and ((c.last_visit_on is not null and c.last_visit_on < v_today - 21) or (c.ends_on between v_today and v_today + 14))
        and not exists (select 1 from public.rsv_reservations r where r.customer_key = c.key and r.day >= v_today and r.status = '예약'))
  );

  if v_cust then
    out := out || jsonb_build_object(
      'rsv_list', coalesce((select jsonb_agg(t order by t.time) from (
          select r.start_time time, r.customer_key key, coalesce(nullif(r.customer_name, ''), c.name, '') customer,
            coalesce(s.name, '') staff, r.status
          from public.rsv_reservations r left join public.customers c on c.key = r.customer_key
          left join public.staff_accounts s on s.id::text = r.staff_id
          where r.branch = p_branch and r.day = v_today and r.customer_key is not null and r.status not in ('취소')
            and (v_all or r.staff_id = m.id::text) limit 30) t), '[]'::jsonb),
      'expire_list', coalesce((select jsonb_agg(t order by t.end_on) from (
          select x.customer_key key, coalesce(c.name, '') customer, x.kind, x.amount_left left_n, x.end_on
          from public.rsv_memberships x left join public.customers c on c.key = x.customer_key
          where x.branch = p_branch and x.status = '사용중'
            and (x.end_on between v_today and v_today + 30 or (x.kind = '회차' and x.amount_left between 1 and 2))
          order by x.end_on limit 30) t), '[]'::jsonb),
      'risk_list', coalesce((select jsonb_agg(t) from (
          select c.key, c.name customer,
            case when c.ends_on between v_today and v_today + 14 then '만료 D-' || (c.ends_on - v_today)
                 else (v_today - c.last_visit_on) || '일 미방문' end reason,
            case when c.ends_on between v_today and v_today + 14 then '재등록' else '해피콜' end action
          from public.customers c where c.branch = p_branch and c.has_membership
            and ((c.last_visit_on is not null and c.last_visit_on < v_today - 21) or (c.ends_on between v_today and v_today + 14))
            and not exists (select 1 from public.rsv_reservations r where r.customer_key = c.key and r.day >= v_today and r.status = '예약')
          order by coalesce(c.ends_on, '2999-01-01'), c.last_visit_on nulls last limit 30) t), '[]'::jsonb));
  end if;

  if v_sales then
    out := out || jsonb_build_object('monthly', (select jsonb_agg(jsonb_build_object('m', g.mm,
        'this', coalesce((select sum(case when p.is_refund then -p.amount else p.amount end) from public.payments p
          where p.branch = p_branch and p.voided_at is null and extract(year from p.day) = extract(year from v_today) and extract(month from p.day) = g.mm), 0),
        'last', coalesce((select sum(case when p.is_refund then -p.amount else p.amount end) from public.payments p
          where p.branch = p_branch and p.voided_at is null and extract(year from p.day) = extract(year from v_today) - 1 and extract(month from p.day) = g.mm), 0)
      ) order by g.mm) from generate_series(1, extract(month from v_today)::int) g(mm)));
  end if;
  if v_sales and v_lead then
    out := out || jsonb_build_object('rank', coalesce((select jsonb_agg(t order by t.amount desc) from (
        select p.staff_name name, sum(case when p.is_refund then -p.amount else p.amount end) amount
        from public.payments p where p.branch = p_branch and p.voided_at is null and p.day >= v_a and p.day < v_b and coalesce(p.staff_name, '') <> ''
        group by p.staff_name order by 2 desc limit 8) t), '[]'::jsonb));
  end if;
  return out;
end $$;

-- 4) 목표 ------------------------------------------------------------
create or replace function public.dash_goal(p_branch text, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; v_a date := date_trunc('month', p_month)::date; v_b date; v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_sales boolean; v_lead boolean; v_closed jsonb; v_left int; out jsonb;
begin
  select * into m from public.me();
  if m.id is null or not public.branch_ok(p_branch) then raise exception '이 지점을 볼 수 없어요.'; end if;
  v_b := (v_a + interval '1 month')::date;
  v_sales := public.can('sales.others'); v_lead := m.tier in ('owner','manager');
  v_closed := coalesce((select value from public.rsv_settings where key = 'closed_weekdays' and scope = p_branch), '[]'::jsonb);
  select count(*) into v_left from generate_series(greatest(v_today, v_a), v_b - 1, interval '1 day') g(d)
    where not v_closed @> to_jsonb(extract(dow from g.d)::int)
      and not coalesce((select (h->>'open')::boolean = false from public.rsv_settings s, jsonb_array_elements(s.value->'days') h
        where s.key = 'hours' and s.scope = p_branch and (h->>'d')::int = extract(dow from g.d)::int limit 1), extract(dow from g.d) = 0);

  out := jsonb_build_object('month', v_a, 'tier', m.tier, 'show_sales', v_sales, 'show_staff', v_lead,
    'can_edit', v_lead and public.can('settings.edit'), 'days_left', v_left);

  if v_lead then
    out := out || jsonb_build_object(
      'branch', jsonb_build_object(
        'sales', case when v_sales then jsonb_build_object('target', (select target from public.dash_goals where branch = p_branch and month = v_a and metric = 'sales' and staff_key = ''),
          'actual', (select coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0) from public.payments p where p.branch = p_branch and p.voided_at is null and p.day >= v_a and p.day < v_b)) end,
        'visit', jsonb_build_object('target', (select target from public.dash_goals where branch = p_branch and month = v_a and metric = 'visit' and staff_key = ''),
          'actual', (select count(*) from public.rsv_reservations r where r.branch = p_branch and r.status = '완료' and r.day >= v_a and r.day < v_b)),
        'rereg', jsonb_build_object('target', (select target from public.dash_goals where branch = p_branch and month = v_a and metric = 'rereg' and staff_key = ''),
          'actual', (select sum(rereg) from public.dash_scores(p_branch, v_a)))),
      'staff', coalesce((select jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', s.name,
          'sales', case when v_sales then jsonb_build_object('target', g.ts, 'actual', s.sales) end,
          'visit', jsonb_build_object('target', g.tv, 'actual', (select count(*) from public.rsv_reservations r where r.branch = p_branch and r.status = '완료' and r.staff_id = s.staff_id::text and r.day >= v_a and r.day < v_b)),
          'rereg', jsonb_build_object('target', g.tr, 'actual', s.rereg)) order by s.score desc)
        from public.dash_scores(p_branch, v_a) s
        left join lateral (select max(target) filter (where metric = 'sales') ts, max(target) filter (where metric = 'visit') tv, max(target) filter (where metric = 'rereg') tr
          from public.dash_goals where branch = p_branch and month = v_a and staff_key = s.staff_id::text) g on true), '[]'::jsonb),
      'logs', coalesce((select jsonb_agg(t order by t.at desc) from (
          select l.at, l.by_name, l.by_tier, l.metric, l.before, l.after, coalesce(s.name, '') staff
          from public.dash_goal_logs l left join public.staff_accounts s on s.id::text = l.staff_key
          where l.branch = p_branch and (v_sales or l.metric <> 'sales') order by l.at desc limit 20) t), '[]'::jsonb));
  else
    out := out || jsonb_build_object('mine', jsonb_build_object(
      'visit', jsonb_build_object('target', (select target from public.dash_goals where branch = p_branch and month = v_a and metric = 'visit' and staff_key = m.id::text),
        'actual', (select count(*) from public.rsv_reservations r where r.branch = p_branch and r.status = '완료' and r.staff_id = m.id::text and r.day >= v_a and r.day < v_b)),
      'rereg', jsonb_build_object('target', (select target from public.dash_goals where branch = p_branch and month = v_a and metric = 'rereg' and staff_key = m.id::text),
        'actual', (select rereg from public.dash_scores(p_branch, v_a) where staff_id = m.id))));
  end if;
  return out;
end $$;

create or replace function public.dash_goal_set(p_branch text, p_month date, p_metric text, p_staff text, p_target bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; v_a date := date_trunc('month', p_month)::date; v_old bigint; v_key text := coalesce(p_staff, '');
begin
  select * into m from public.me();
  if m.id is null or m.tier not in ('owner','manager') or not public.can('settings.edit') or not public.branch_ok(p_branch) then
    raise exception '목표는 대표관리자·관리자만 정할 수 있어요.'; end if;
  if p_metric not in ('sales','visit','rereg') then raise exception '목표 종류가 잘못됐어요.'; end if;
  if p_metric = 'sales' and not public.can('sales.others') then raise exception '매출 목표는 매출 권한이 있어야 정할 수 있어요.'; end if;
  if v_key <> '' and not exists (select 1 from public.staff_accounts where id::text = v_key and branch = p_branch) then raise exception '직원을 찾지 못했어요.'; end if;
  select target into v_old from public.dash_goals where branch = p_branch and month = v_a and metric = p_metric and staff_key = v_key;
  if p_target is null then
    delete from public.dash_goals where branch = p_branch and month = v_a and metric = p_metric and staff_key = v_key;
  else
    if p_target < 0 then raise exception '목표는 0 이상이에요.'; end if;
    insert into public.dash_goals(branch, month, metric, staff_key, target, updated_by, updated_at)
    values (p_branch, v_a, p_metric, v_key, p_target, m.id::text, now())
    on conflict (branch, month, metric, staff_key) do update set target = excluded.target, updated_by = excluded.updated_by, updated_at = now();
  end if;
  if v_old is distinct from p_target then
    insert into public.dash_goal_logs(branch, month, metric, staff_key, before, after, by_name, by_tier)
    values (p_branch, v_a, p_metric, v_key, v_old, p_target, m.name, m.tier);
  end if;
end $$;

-- 5) 직원 성장 --------------------------------------------------------
create or replace function public.dash_growth(p_branch text, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; v_a date := date_trunc('month', p_month)::date; v_lead boolean; v_sales boolean; r jsonb := public.dash_rules();
begin
  select * into m from public.me();
  if m.id is null or not public.branch_ok(p_branch) then raise exception '이 지점을 볼 수 없어요.'; end if;
  v_lead := m.tier in ('owner','manager'); v_sales := public.can('sales.others');
  return jsonb_build_object('month', v_a, 'tier', m.tier, 'rules', r, 'show_staff', v_lead,
    'me', (select jsonb_build_object('name', s.name, 'score', s.score,
        'parts', case when v_sales or v_lead then jsonb_build_object('sales', s.s_sales, 'rereg', s.s_rereg, 'call', s.s_call, 'log', s.s_log, 'review', s.s_review)
          else jsonb_build_object('sales', round(100.0 * s.s_sales / nullif(s.score, 0)), 'rereg', round(100.0 * s.s_rereg / nullif(s.score, 0)),
            'call', round(100.0 * s.s_call / nullif(s.score, 0)), 'log', round(100.0 * s.s_log / nullif(s.score, 0)), 'review', round(100.0 * s.s_review / nullif(s.score, 0))) end,
        'parts_pct', not (v_sales or v_lead))
      from public.dash_scores(m.branch, v_a) s where s.staff_id = m.id),
    'staff', case when v_lead then coalesce((select jsonb_agg(jsonb_build_object('id', s.staff_id, 'name', s.name, 'title', s.title, 'tier', s.tier, 'score', s.score) order by s.score desc, s.name)
      from public.dash_scores(p_branch, v_a) s), '[]'::jsonb) end);
end $$;

-- 6) 팀전 -------------------------------------------------------------
create or replace function public.dash_team(p_month date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; v_a date := date_trunc('month', p_month)::date; v_sales boolean;
begin
  select * into m from public.me();
  if m.id is null then raise exception '로그인이 필요해요.'; end if;
  v_sales := public.can('sales.others');
  return jsonb_build_object('month', v_a, 'tier', m.tier, 'show_sales', v_sales,
    'can_edit', m.tier in ('owner','manager') and public.can('settings.edit'), 'rules', public.dash_rules(),
    'teams', coalesce((select jsonb_agg(t order by t.score desc, t.name) from (
      select tm.id, tm.branch, tm.name, tm.target, tm.members,
        coalesce((select sum(s.score) from public.dash_scores(null, v_a) s where s.staff_id = any(tm.members)), 0) score,
        case when v_sales then (select sum(s.sales) from public.dash_scores(null, v_a) s where s.staff_id = any(tm.members)) end sales,
        coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'title', s.title)) from public.staff_accounts s where s.id = any(tm.members)), '[]'::jsonb) people
      from public.dash_teams tm where tm.month = v_a) t), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(t order by t.score desc) from (
      select s.staff_id id, s.name, tm.name team, s.score,
        array_to_string(array_remove(array[case when s.s_sales > 0 then '매출' end, case when s.s_rereg > 0 then '재등록' end,
          case when s.s_call > 0 then '해피콜' end, case when s.s_log > 0 then '운동일지' end, case when s.s_review > 0 then '후기' end], null), ' · ') parts
      from public.dash_scores(null, v_a) s join public.dash_teams tm on tm.month = v_a and s.staff_id = any(tm.members)) t), '[]'::jsonb),
    'staff_pick', case when m.tier in ('owner','manager') then coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'branch', s.branch, 'title', s.title) order by s.branch, s.name)
      from public.staff_accounts s where s.status = 'active'), '[]'::jsonb) end);
end $$;

create or replace function public.dash_team_save(p_id uuid, p_month date, p_branch text, p_name text, p_members uuid[], p_target int)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; v_id uuid := p_id;
begin
  select * into m from public.me();
  if m.id is null or m.tier not in ('owner','manager') or not public.can('settings.edit') or not public.branch_ok(p_branch) then
    raise exception '팀은 대표관리자·관리자만 정할 수 있어요.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '팀 이름을 적어 주세요.'; end if;
  if v_id is null then
    insert into public.dash_teams(month, branch, name, members, target, created_by)
    values (date_trunc('month', p_month)::date, p_branch, trim(p_name), coalesce(p_members, '{}'), greatest(coalesce(p_target, 800), 1), m.id::text) returning id into v_id;
  else
    update public.dash_teams set branch = p_branch, name = trim(p_name), members = coalesce(p_members, '{}'), target = greatest(coalesce(p_target, 800), 1)
    where id = v_id and public.branch_ok(branch);
    if not found then raise exception '팀을 찾지 못했어요.'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.dash_team_del(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts;
begin
  select * into m from public.me();
  if m.id is null or m.tier not in ('owner','manager') or not public.can('settings.edit') then raise exception '팀은 대표관리자·관리자만 지울 수 있어요.'; end if;
  delete from public.dash_teams where id = p_id and public.branch_ok(branch);
end $$;

-- 7) 실행 권한 -------------------------------------------------------
revoke all on function public.dash_glance(text), public.dash_goal(text, date), public.dash_goal_set(text, date, text, text, bigint),
  public.dash_growth(text, date), public.dash_team(date), public.dash_team_save(uuid, date, text, text, uuid[], int), public.dash_team_del(uuid)
  from public, anon;
grant execute on function public.dash_glance(text), public.dash_goal(text, date), public.dash_goal_set(text, date, text, text, bigint),
  public.dash_growth(text, date), public.dash_team(date), public.dash_team_save(uuid, date, text, text, uuid[], int), public.dash_team_del(uuid)
  to authenticated;

commit;
