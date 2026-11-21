-- 056 설정 v3 (2026-11-21) : 설정 화면 시안(SET_v3) 20개 메뉴용
-- SQL 편집기에서 한 번에 실행하세요. 한 덩어리(begin~commit)라 중간에 실패하면 아무것도 바뀌지 않아요.
--
-- 바뀌는 것
--  1) settings_logs 표 (누가 · 언제 · 무엇을 바꿨는지) — 화면의 회색 기록 줄
--  2) settings_get : 새 키(기본·예약표·네이버·관리실·직원별 근무·관리 항목 할인/적립·운영·결제·마감·단말기) + 기록 + p_branch='all'(전 지점 공통: 포인트·고객 등급)
--  3) settings_set : p_note(기록 문장) 추가, 새 키 허용, 직급 규칙
--       · 포인트 · 고객 등급 · 관리 항목 할인/적립 · 카드 수수료율 · 주간 리포트 발송 시각 → 대표관리자만
--       · 나머지 → 설정 수정 권한(관리자 기본) + 자기 지점
--  4) 직원 휴무 : staff_offs 표 + staff_off_list / staff_off_request / staff_off_decide
--  5) staff_accounts 에 team(팀), level(레벨) 칸 (비어 있어도 돼요)
-- 표를 새로 만들면 이 프로젝트는 권한이 자동으로 안 붙어요 → 아래 grant 를 꼭 같이 실행해요.

begin;

-- 1) 기록 -------------------------------------------------------------
create table if not exists public.settings_logs (
  id uuid primary key default gen_random_uuid(),
  scope text not null,            -- 지점 이름 또는 'all'
  key text not null,
  note text not null default '',
  before jsonb, after jsonb,
  by_name text, by_tier text,
  at timestamptz not null default now()
);
create index if not exists settings_logs_scope_at on public.settings_logs (scope, at desc);
alter table public.settings_logs enable row level security;
grant select, insert on public.settings_logs to service_role;

-- 5) 직원 팀 · 레벨 ---------------------------------------------------
alter table public.staff_accounts add column if not exists team text;
alter table public.staff_accounts add column if not exists level int;

-- 2) 읽기 -------------------------------------------------------------
create or replace function public.settings_get(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare m public.staff_accounts; v jsonb;
begin
  select * into m from public.me();
  if m.id is null then return null; end if;
  if p_branch = 'all' then
    return jsonb_build_object(
      'points', (select value from rsv_settings where key = 'points' and scope = 'all'),
      'grades', (select value from rsv_settings where key = 'grades' and scope = 'all'),
      'can_edit', m.tier = 'owner', 'is_owner', m.tier = 'owner',
      'logs', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'note', l.note, 'by_name', l.by_name, 'by_tier', l.by_tier, 'at', l.at) order by l.at desc)
        from (select * from settings_logs where scope = 'all' order by at desc limit 30) l), '[]'::jsonb));
  end if;
  if not public.branch_ok(p_branch) then return null; end if;
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v
    from rsv_settings s
   where s.scope = p_branch
     and s.key in ('basic','board','naver','rooms','shifts','prog_flags','ops','pay','close','terminals','closed_weekdays');
  return v || jsonb_build_object(
    'hours', coalesce((select value from rsv_settings where key='hours' and scope=p_branch),
      '{"days":[{"d":0,"open":false,"s":"10:00","e":"21:00"},{"d":1,"open":true,"s":"09:30","e":"21:00"},{"d":2,"open":true,"s":"09:30","e":"21:00"},{"d":3,"open":true,"s":"09:30","e":"21:00"},{"d":4,"open":true,"s":"09:30","e":"21:00"},{"d":5,"open":true,"s":"09:30","e":"21:00"},{"d":6,"open":true,"s":"10:00","e":"18:00"}],"lunch":null}'::jsonb),
    'closed_weekdays', coalesce(v->'closed_weekdays', '[]'::jsonb),
    'can_edit', public.can('settings.edit'),
    'is_owner', m.tier = 'owner',
    -- 결제·수수료 기록은 관리자 이상만
    'logs', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'note', l.note, 'by_name', l.by_name, 'by_tier', l.by_tier, 'at', l.at) order by l.at desc)
      from (select * from settings_logs x where x.scope = p_branch and (x.key <> 'pay' or m.tier in ('owner','manager')) order by x.at desc limit 30) l), '[]'::jsonb));
end $$;

-- 3) 쓰기 -------------------------------------------------------------
drop function if exists public.settings_set(text, text, jsonb);
create or replace function public.settings_set(p_branch text, p_key text, p_value jsonb, p_note text default '')
returns void language plpgsql security definer set search_path to 'public' as $$
declare m public.staff_accounts; v_old jsonb; v_owner boolean;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'permission denied'; end if;
  v_owner := m.tier = 'owner';
  if p_branch = 'all' then
    if p_key not in ('points','grades') then raise exception 'unknown key'; end if;
    if not v_owner then raise exception '포인트와 고객 등급은 대표관리자만 바꿀 수 있어요. 변경 요청을 보내 주세요.'; end if;
  else
    if not (public.can('settings.edit') and public.branch_ok(p_branch)) then raise exception 'permission denied'; end if;
    if p_key not in ('hours','closed_weekdays','basic','board','naver','rooms','shifts','prog_flags','prog_log','ops','pay','close','terminals') then
      raise exception 'unknown key'; end if;
    if p_key in ('prog_flags','prog_log') and not v_owner then raise exception '관리 항목은 대표관리자만 바꿀 수 있어요.'; end if;
  end if;
  select value into v_old from rsv_settings where key = p_key and scope = p_branch;
  -- 관리자는 카드 수수료율 · 주간 리포트 발송 시각을 못 바꿔요
  if not v_owner and p_key = 'pay' and ((v_old->'fee') is distinct from (p_value->'fee') or (v_old->'fee_from') is distinct from (p_value->'fee_from')) then
    raise exception '카드 수수료율은 대표관리자만 바꿀 수 있어요. 변경 요청을 보내 주세요.'; end if;
  if not v_owner and p_key = 'ops' and (coalesce(v_old->'report_day', '"일요일"') is distinct from coalesce(p_value->'report_day', '"일요일"')
      or coalesce(v_old->'report_time', '"20:00"') is distinct from coalesce(p_value->'report_time', '"20:00"')) then
    raise exception '주간 리포트 발송 시각은 대표관리자만 바꿀 수 있어요.'; end if;
  if p_key <> 'prog_log' then
    insert into rsv_settings(key, scope, value, updated_by, updated_at)
    values (p_key, p_branch, p_value, m.name, now())
    on conflict (key, scope) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;
  insert into settings_logs(scope, key, note, before, after, by_name, by_tier)
  values (p_branch, case when p_key = 'prog_log' then 'prog_log' else p_key end, left(coalesce(p_note, ''), 300),
          case when p_key = 'prog_log' then null else v_old end, p_value, m.name, m.tier);
end $$;

-- 4) 직원 휴무 --------------------------------------------------------
create table if not exists public.staff_offs (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  staff_id uuid not null,
  name text not null default '',
  day date not null,
  reason text not null default '',
  status text not null default '대기' check (status in ('대기','승인','반려')),
  decided_by text, decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (staff_id, day)
);
alter table public.staff_offs enable row level security;
grant select, insert, update, delete on public.staff_offs to service_role;

create or replace function public.staff_off_list(p_branch text, p_from date, p_to date)
returns table(id uuid, day date, name text, reason text, status text)
language sql stable security definer set search_path to 'public' as $$
  select o.id, o.day, o.name, o.reason, o.status from staff_offs o
   where public.branch_ok(p_branch) and o.branch = p_branch and o.day between p_from and p_to
     and (o.status = '승인' or (select tier from public.me()) in ('owner','manager') or o.staff_id = (select id from public.me()))
   order by o.day desc limit 200
$$;

-- 본인 휴무 요청 (관리자 이상이 넣으면 바로 승인)
create or replace function public.staff_off_request(p_branch text, p_day date, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare m public.staff_accounts; v uuid;
begin
  select * into m from public.me();
  if m.id is null or not public.branch_ok(p_branch) then raise exception 'permission denied'; end if;
  insert into staff_offs(branch, staff_id, name, day, reason, status, decided_by, decided_at)
  values (p_branch, m.id, m.name, p_day, left(coalesce(p_reason, ''), 100),
          case when m.tier in ('owner','manager') then '승인' else '대기' end,
          case when m.tier in ('owner','manager') then m.name end, case when m.tier in ('owner','manager') then now() end)
  on conflict (staff_id, day) do update set reason = excluded.reason, status = excluded.status
  returning staff_offs.id into v;
  return v;
end $$;

create or replace function public.staff_off_decide(p_id uuid, p_ok boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare m public.staff_accounts; v_branch text;
begin
  select * into m from public.me();
  select branch into v_branch from staff_offs where id = p_id;
  if m.id is null or m.tier not in ('owner','manager') or not public.branch_ok(v_branch) then raise exception 'permission denied'; end if;
  update staff_offs set status = case when p_ok then '승인' else '반려' end, decided_by = m.name, decided_at = now() where id = p_id;
end $$;

revoke all on function public.settings_get(text), public.settings_set(text, text, jsonb, text),
  public.staff_off_list(text, date, date), public.staff_off_request(text, date, text), public.staff_off_decide(uuid, boolean) from public, anon;
grant execute on function public.settings_get(text), public.settings_set(text, text, jsonb, text),
  public.staff_off_list(text, date, date), public.staff_off_request(text, date, text), public.staff_off_decide(uuid, boolean) to authenticated, service_role;

commit;
