-- 041 직급 · 세부설정 (헬보 v148 r10 권한 시안 방식) · 2026-11-21
-- Supabase SQL 편집기에서 한 번에 실행하세요. 한 덩어리(트랜잭션)로 돌아가요.
-- 바뀌는 것
--  1) staff_title_perms 표 새로 만듦: 직급(직책 이름)마다 기본 세부설정. '@manager' = 관리자 등급 기본값.
--  2) can() 고침: (a) 값이 {"mode":"request"} 면 '요청 보내기'라서 직접 실행은 막음
--                 (b) 관리자도 대표관리자가 켜 준 '대표관리자만' 권한은 쓸 수 있게 (예전엔 켜도 무시됐음)
--  3) can_request(key), perm_opt(key) 함수 추가 (요청 보내기 · 조회 범위/기간 같은 하위 선택을 서버에서 읽을 때)
-- 고객 데이터는 건드리지 않아요.

begin;

create table if not exists public.staff_title_perms (
  name text primary key,
  perms jsonb not null default '{}'::jsonb,
  sort int not null default 100,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.staff_title_perms enable row level security;
grant select, insert, update, delete on public.staff_title_perms to authenticated, service_role;

drop policy if exists stp_read on public.staff_title_perms;
create policy stp_read on public.staff_title_perms for select to authenticated
  using ((select m.id from public.me() m) is not null);
drop policy if exists stp_write on public.staff_title_perms;
create policy stp_write on public.staff_title_perms for all to authenticated
  using ((select m.tier from public.me() m) in ('owner','manager'))
  with check ((select m.tier from public.me() m) in ('owner','manager'));

-- 관리자: '@manager'(관리자 기본값)는 못 바꾸고, '대표관리자만' 권한은 못 바꿈. 바뀐 내용은 permission_logs 에 남김.
create or replace function public.staff_title_perms_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor public.staff_accounts; bad text;
begin
  select * into actor from public.me();
  if actor.id is null then
    if auth.uid() is null then return coalesce(new, old); end if;
    raise exception 'not staff';
  end if;
  if actor.tier = 'manager' then
    if coalesce(new.name, old.name) = '@manager' or (tg_op = 'UPDATE' and old.name = '@manager') then
      raise exception '관리자 기본값은 대표관리자만 바꿀 수 있어요';
    end if;
    select string_agg(c.key, ', ') into bad from public.perm_catalog c
     where c.owner_only
       and coalesce(case when tg_op = 'DELETE' then null else new.perms -> c.key end, 'false'::jsonb)
           is distinct from coalesce(case when tg_op = 'INSERT' then null else old.perms -> c.key end, 'false'::jsonb);
    if bad is not null then raise exception '대표관리자만 줄 수 있는 권한이에요: %', bad; end if;
  elsif actor.tier <> 'owner' then
    raise exception '권한이 없어요';
  end if;
  if tg_op <> 'DELETE' then new.updated_by := actor.id; new.updated_at := now(); end if;
  insert into public.permission_logs(id, at, actor_id, actor_name, target_type, target_key, target_name, summary, before_txt, after_txt)
  values (gen_random_uuid(), now(), actor.id::text, actor.name, 'staff_title',
          coalesce(new.name, old.name), coalesce(new.name, old.name), tg_op,
          case when tg_op <> 'INSERT' then old.perms::text end,
          case when tg_op <> 'DELETE' then new.perms::text end);
  return coalesce(new, old);
end $$;

drop trigger if exists staff_title_perms_guard on public.staff_title_perms;
create trigger staff_title_perms_guard before insert or update or delete on public.staff_title_perms
  for each row execute function public.staff_title_perms_guard();

-- 켜짐: 값이 있고 false 가 아니고 '요청 보내기'가 아님
create or replace function public.can(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    case
      when m.tier = 'owner' then true
      when m.tier = 'manager' and not exists (select 1 from public.perm_catalog c where c.key = p_key and c.owner_only) then true
      else (m.perms ? p_key and m.perms -> p_key <> 'false'::jsonb
            and coalesce(m.perms -> p_key ->> 'mode', '') <> 'request')
    end, false)
  from public.me() m
$$;

-- 요청 보내기만 가능한지
create or replace function public.can_request(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(m.tier = 'staff' or m.tier = 'manager', false)
     and coalesce(m.perms -> p_key ->> 'mode', '') = 'request'
  from public.me() m
$$;

-- 하위 선택 (조회 범위 scope · 조회 기간 period · 보이는 값 show 등). 대표관리자는 빈 값 = 제한 없음.
create or replace function public.perm_opt(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when m.tier = 'owner' then '{}'::jsonb
              when jsonb_typeof(m.perms -> p_key) = 'object' then m.perms -> p_key
              else '{}'::jsonb end
  from public.me() m
$$;

revoke all on function public.can(text), public.can_request(text), public.perm_opt(text) from public, anon;
grant execute on function public.can(text), public.can_request(text), public.perm_opt(text) to authenticated, service_role;

-- 처음 값: 관리자 기본값(대표관리자만 권한 모두 꺼짐) + '직원' 직급
insert into public.staff_title_perms(name, perms, sort) values ('@manager', '{}'::jsonb, 0), ('직원', '{}'::jsonb, 10)
on conflict (name) do nothing;

commit;

-- 확인용 (실행 결과에 2줄 나오면 OK)
select name, sort from public.staff_title_perms order by sort;
