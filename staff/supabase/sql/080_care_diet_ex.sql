-- 080 식단 케어 · 운동 케어 (11/21 대표님 요청) : SQL 편집기에서 한 번에 실행하세요.
-- 1) care_links        : 고객 개인 링크(웹 식단 기록 + MADELINE 앱 연결에 같이 씀)
-- 2) care_prefs        : 식단 코칭 원치 않음 / 운동 코칭 원치 않음 (따로 체크)
-- 3) diet_certs        : 이미 있는 식단 표에 끼니·사진·출처 열 추가 (고객이 올린 식단)
-- 4) care_health_daily : 걸음·수면·체중·운동 시간 (MADELINE 앱이 애플 건강 / 헬스 커넥트에서 읽어 보냄)
-- 5) care_logs         : 직원이 남긴 케어 한마디 (고객 링크 화면에도 보여요)
-- 6) 사진 저장소 care-photos (비공개, 5MB, 이미지만)
-- 7) 직원 RPC : care_board · care_link_issue · care_pref_set · care_log · care_log_undo · care_meal_feedback
-- 8) 고객 RPC (링크 토큰으로만) : care_me · care_consent · care_meal_add · care_meal_del · care_health_push
-- 고객 데이터는 모두 security definer 함수로만. 새 표에는 직접 권한을 주지 않아요.

begin;

-- ───────── 1) 고객 개인 링크 ─────────
create table if not exists public.care_links (
  token text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  branch text not null,
  customer_key text not null,
  created_by text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  app_linked_at timestamptz
);
create unique index if not exists care_links_one_active on public.care_links (branch, customer_key) where revoked_at is null;
alter table public.care_links enable row level security;

-- ───────── 2) 코칭 원치 않음 ─────────
create table if not exists public.care_prefs (
  branch text not null,
  customer_key text not null,
  diet_off boolean not null default false,
  ex_off boolean not null default false,
  diet_note text,
  ex_note text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (branch, customer_key)
);
alter table public.care_prefs enable row level security;

-- ───────── 3) 식단 (이미 있는 diet_certs 에 열 추가) ─────────
alter table public.diet_certs add column if not exists meal text;        -- 아침 · 점심 · 저녁 · 간식
alter table public.diet_certs add column if not exists photo_path text;  -- care-photos 안 경로
alter table public.diet_certs add column if not exists link_token text;
create index if not exists diet_certs_cust_day on public.diet_certs (branch, customer_key, day desc);
alter table public.diet_certs enable row level security;

-- ───────── 4) 웨어러블 하루 값 ─────────
create table if not exists public.care_health_daily (
  branch text not null,
  customer_key text not null,
  day date not null,
  steps int,
  sleep_min int,
  weight_kg numeric(5,1),
  workout_min int,
  active_kcal int,
  source text,                 -- apple_health · health_connect
  updated_at timestamptz not null default now(),
  primary key (branch, customer_key, day)
);
alter table public.care_health_daily enable row level security;

-- ───────── 5) 직원 케어 기록 ─────────
create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  customer_key text not null,
  kind text not null check (kind in ('diet','ex')),
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  result text not null,        -- 한마디 보냄 · 통화함 · 부재 · 해당없음
  note text,
  staff text,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists care_logs_cust on public.care_logs (branch, customer_key, kind, day desc);
alter table public.care_logs enable row level security;

-- 이 프로젝트는 새 표에 기본 권한이 없어요. 함수(security definer, 소유자 postgres)로만 씀.
grant select, insert, update, delete on public.care_links, public.care_prefs, public.care_health_daily, public.care_logs to service_role;

-- ───────── 6) 사진 저장소 ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('care-photos', 'care-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create or replace function public.care_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.care_links where token = p_token and revoked_at is null);
$$;
revoke all on function public.care_token_ok(text) from public;
grant execute on function public.care_token_ok(text) to anon, authenticated;

-- 고객: 자기 토큰 폴더에만 올리기 (경로 = 토큰/날짜/파일)
drop policy if exists care_photos_upload on storage.objects;
create policy care_photos_upload on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'care-photos' and public.care_token_ok((storage.foldername(name))[1]));
-- 고객이 자기 사진 보기 / 직원(해피콜 권한) 보기
drop policy if exists care_photos_read on storage.objects;
create policy care_photos_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'care-photos' and (
    public.care_token_ok((storage.foldername(name))[1])
    or (auth.role() = 'authenticated' and public.can('customer.happycall'))
  ));

-- ───────── 공통: 직원이 이 고객을 볼 수 있는지 ─────────
create or replace function public.care_staff_ok(p_branch text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can('customer.happycall') and exists (
    select 1 from public.me() m where m.tier = 'owner' or m.branch = p_branch);
$$;
revoke all on function public.care_staff_ok(text) from public, anon;
grant execute on function public.care_staff_ok(text) to authenticated;

-- ───────── 7) 직원 RPC ─────────

drop function if exists public.care_board(text, text);
-- 케어 목록 (p_kind 'diet' | 'ex')
--   연결됨: 링크가 있는 고객 (기록 리듬 · 최근 기록 · 오늘 남긴 한마디)
--   아직 연결 안 함: 회원권 있고 30일 안에 왔는데 링크가 없는 고객 → 링크 보내기
--   원치 않음: 해당 코칭을 거부한 고객 (따로 표시, 연락하지 않음)
create or replace function public.care_board(p_branch text default null, p_kind text default 'diet')
returns table(
  customer_key text, branch text, name text, phone text, manager text, membership text, last_visit_on date,
  grp text,                -- linked · nolink · off
  off_note text, token text, linked_at timestamptz, app_linked boolean, last_seen_at timestamptz,
  days7 int,               -- 최근 7일 중 기록 있는 날
  last_day date,           -- 마지막 기록 날
  recent jsonb,            -- 식단: 최근 3일 끼니 / 운동: 최근 7일 값
  days_on date[],          -- 최근 7일 중 기록 있는 날
  visits14 int,            -- 최근 14일 방문(운동일지·관리)
  done_today boolean, log_id uuid, log_result text, log_note text
)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me()),
  d as (select (now() at time zone 'Asia/Seoul')::date as today),
  ok as (select public.can('customer.happycall') as v, public.can('customer.phone_full') as pf),
  c as (
    select c.* from public.customers c, m, ok
    where ok.v and c.deleted_at is null and (m.tier = 'owner' or c.branch = m.branch)
      and (p_branch is null or c.branch = p_branch)
  ),
  l as (select * from public.care_links where revoked_at is null),
  pr as (select * from public.care_prefs),
  base as (
    select c.*, l.token, l.created_at linked_at, l.app_linked_at, l.last_seen_at,
      case when (p_kind = 'diet' and coalesce(pr.diet_off,false)) or (p_kind = 'ex' and coalesce(pr.ex_off,false)) then 'off'
           when l.token is not null then 'linked' else 'nolink' end grp,
      case when p_kind = 'diet' then pr.diet_note else pr.ex_note end off_note
    from c
    left join l on l.branch = c.branch and l.customer_key = c.key
    left join pr on pr.branch = c.branch and pr.customer_key = c.key, d
    where l.token is not null
       or (p_kind = 'diet' and coalesce(pr.diet_off,false)) or (p_kind = 'ex' and coalesce(pr.ex_off,false))
       or (c.has_membership and c.last_visit_on >= d.today - 30)
  ),
  dietd as (
    select x.branch, x.customer_key, count(distinct x.day) filter (where x.day >= d.today - 6) days7, max(x.day) last_day,
      array_agg(distinct x.day) filter (where x.day >= d.today - 6) days_on,
      coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'day', x.day, 'meal', x.meal, 'body', x.body, 'photo', x.photo_path,
        'at', x.created_at, 'feedback', x.feedback, 'feedback_by', x.feedback_by) order by x.day desc, x.created_at desc)
        filter (where x.day >= d.today - 2), '[]'::jsonb) recent
    from public.diet_certs x, d where p_kind = 'diet' and x.day >= d.today - 30
    group by x.branch, x.customer_key
  ),
  exd as (
    select h.branch, h.customer_key, count(*) filter (where h.day >= d.today - 6 and (coalesce(h.steps,0) > 0 or coalesce(h.workout_min,0) > 0)) days7,
      max(h.day) last_day,
      array_agg(h.day) filter (where h.day >= d.today - 6 and (coalesce(h.steps,0) > 0 or coalesce(h.workout_min,0) > 0)) days_on,
      coalesce(jsonb_agg(jsonb_build_object('day', h.day, 'steps', h.steps, 'sleep', h.sleep_min, 'weight', h.weight_kg,
        'workout', h.workout_min, 'kcal', h.active_kcal) order by h.day desc) filter (where h.day >= d.today - 6), '[]'::jsonb) recent
    from public.care_health_daily h, d where p_kind = 'ex' and h.day >= d.today - 30
    group by h.branch, h.customer_key
  ),
  vis as (
    select e.branch, e.customer_key, count(distinct e.day) n from public.exercise_logs e, d
    where e.day >= d.today - 13 group by 1, 2
  ),
  lg as (
    select distinct on (g.branch, g.customer_key) g.* from public.care_logs g, d
    where g.kind = p_kind and g.day = d.today and g.undone_at is null
    order by g.branch, g.customer_key, g.created_at desc
  )
  select b.key, b.branch, b.name,
    case when ok.pf then b.phone else regexp_replace(coalesce(b.phone,''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end,
    b.manager, b.membership, b.last_visit_on, b.grp, b.off_note,
    b.token, b.linked_at, b.app_linked_at is not null, b.last_seen_at,
    coalesce(case when p_kind = 'diet' then dd.days7 else ed.days7 end, 0)::int,
    case when p_kind = 'diet' then dd.last_day else ed.last_day end,
    coalesce(case when p_kind = 'diet' then dd.recent else ed.recent end, '[]'::jsonb),
    coalesce(case when p_kind = 'diet' then dd.days_on else ed.days_on end, '{}'::date[]),
    coalesce(v.n, 0)::int,
    lg.id is not null, lg.id, lg.result, lg.note
  from base b cross join ok
  left join dietd dd on dd.branch = b.branch and dd.customer_key = b.key
  left join exd ed on ed.branch = b.branch and ed.customer_key = b.key
  left join vis v on v.branch = b.branch and v.customer_key = b.key
  left join lg on lg.branch = b.branch and lg.customer_key = b.key
  order by case b.grp when 'linked' then 0 when 'nolink' then 1 else 2 end,
    (case when p_kind = 'diet' then dd.last_day else ed.last_day end) desc nulls last, b.name;
$$;

-- 개인 링크 만들기 (이미 있으면 그대로 돌려줌)
create or replace function public.care_link_issue(p_branch text, p_customer_key text)
returns text language plpgsql security definer set search_path = public as $$
declare t text; who text;
begin
  if not public.care_staff_ok(p_branch) then raise exception 'NO_PERMISSION'; end if;
  if not exists (select 1 from public.customers where branch = p_branch and key = p_customer_key and deleted_at is null) then
    raise exception 'NOT_FOUND';
  end if;
  select token into t from public.care_links where branch = p_branch and customer_key = p_customer_key and revoked_at is null;
  if t is not null then return t; end if;
  select name into who from public.me();
  insert into public.care_links (branch, customer_key, created_by) values (p_branch, p_customer_key, who) returning token into t;
  return t;
end $$;

-- 링크 다시 만들기 (예전 링크는 막힘)
create or replace function public.care_link_reset(p_branch text, p_customer_key text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.care_staff_ok(p_branch) then raise exception 'NO_PERMISSION'; end if;
  update public.care_links set revoked_at = now() where branch = p_branch and customer_key = p_customer_key and revoked_at is null;
  return public.care_link_issue(p_branch, p_customer_key);
end $$;

-- 코칭 원치 않음 체크 / 해제 (p_kind 'diet' | 'ex')
create or replace function public.care_pref_set(p_branch text, p_customer_key text, p_kind text, p_off boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not public.care_staff_ok(p_branch) then raise exception 'NO_PERMISSION'; end if;
  if p_kind not in ('diet','ex') then raise exception 'BAD_KIND'; end if;
  select name into who from public.me();
  insert into public.care_prefs (branch, customer_key, updated_by) values (p_branch, p_customer_key, who)
  on conflict (branch, customer_key) do nothing;
  if p_kind = 'diet' then
    update public.care_prefs set diet_off = p_off, diet_note = case when p_off then left(nullif(trim(p_note),''), 200) end,
      updated_by = who, updated_at = now() where branch = p_branch and customer_key = p_customer_key;
  else
    update public.care_prefs set ex_off = p_off, ex_note = case when p_off then left(nullif(trim(p_note),''), 200) end,
      updated_by = who, updated_at = now() where branch = p_branch and customer_key = p_customer_key;
  end if;
end $$;

-- 케어 결과 남기기
create or replace function public.care_log(p_branch text, p_customer_key text, p_kind text, p_result text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare who text; i uuid;
begin
  if not public.care_staff_ok(p_branch) then raise exception 'NO_PERMISSION'; end if;
  if p_kind not in ('diet','ex') then raise exception 'BAD_KIND'; end if;
  if p_result not in ('한마디 보냄','통화함','부재','해당없음') then raise exception 'BAD_RESULT'; end if;
  select name into who from public.me();
  insert into public.care_logs (branch, customer_key, kind, result, note, staff)
  values (p_branch, p_customer_key, p_kind, p_result, left(nullif(trim(p_note),''), 500), who) returning id into i;
  return i;
end $$;

create or replace function public.care_log_undo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b text;
begin
  select branch into b from public.care_logs where id = p_id;
  if b is null or not public.care_staff_ok(b) then raise exception 'NO_PERMISSION'; end if;
  update public.care_logs set undone_at = now() where id = p_id and created_at > now() - interval '1 day';
end $$;

-- 끼니 하나에 한마디 (고객 링크 화면에 보여요)
create or replace function public.care_meal_feedback(p_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare b text; who text;
begin
  select branch into b from public.diet_certs where id = p_id;
  if b is null or not public.care_staff_ok(b) then raise exception 'NO_PERMISSION'; end if;
  select name into who from public.me();
  update public.diet_certs set feedback = left(nullif(trim(p_text),''), 300), feedback_by = who,
    feedback_at = case when nullif(trim(p_text),'') is null then null else now() end where id = p_id;
end $$;

-- ───────── 8) 고객 RPC (링크 토큰) ─────────
create or replace function public.care_me(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.care_links; c public.customers; t date := (now() at time zone 'Asia/Seoul')::date; pr public.care_prefs;
begin
  select * into l from public.care_links where token = p_token and revoked_at is null;
  if l.token is null then raise exception 'BAD_LINK'; end if;
  update public.care_links set last_seen_at = now() where token = p_token;
  select * into c from public.customers where branch = l.branch and key = l.customer_key;
  select * into pr from public.care_prefs where branch = l.branch and customer_key = l.customer_key;
  return jsonb_build_object(
    'name', c.name, 'branch', l.branch, 'today', t,
    'consent', exists (select 1 from public.customer_consents k where k.branch = l.branch and k.customer_key = l.customer_key and k.item = 'care_record' and k.agreed),
    'diet_off', coalesce(pr.diet_off, false), 'ex_off', coalesce(pr.ex_off, false),
    'meals', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'day', x.day, 'meal', x.meal, 'body', x.body, 'photo', x.photo_path,
        'at', x.created_at, 'feedback', case when coalesce(pr.diet_off,false) then null else x.feedback end) order by x.day desc, x.created_at)
      from public.diet_certs x where x.branch = l.branch and x.customer_key = l.customer_key and x.day >= t - 6), '[]'::jsonb),
    'health', coalesce((select jsonb_agg(jsonb_build_object('day', h.day, 'steps', h.steps, 'sleep', h.sleep_min, 'weight', h.weight_kg,
        'workout', h.workout_min) order by h.day desc)
      from public.care_health_daily h where h.branch = l.branch and h.customer_key = l.customer_key and h.day >= t - 6), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('kind', g.kind, 'day', g.day, 'note', g.note, 'staff', g.staff) order by g.created_at desc)
      from (select * from public.care_logs g where g.branch = l.branch and g.customer_key = l.customer_key and g.undone_at is null
              and g.note is not null and g.result = '한마디 보냄' and g.day >= t - 13
              and not (g.kind = 'diet' and coalesce(pr.diet_off,false)) and not (g.kind = 'ex' and coalesce(pr.ex_off,false))
            order by g.created_at desc limit 5) g), '[]'::jsonb)
  );
end $$;

-- 기록 동의 (식단 사진·웨어러블 값을 담당 코치가 보고 관리에 쓰는 것)
create or replace function public.care_consent(p_token text, p_method text default 'web')
returns void language plpgsql security definer set search_path = public as $$
declare l public.care_links;
begin
  select * into l from public.care_links where token = p_token and revoked_at is null;
  if l.token is null then raise exception 'BAD_LINK'; end if;
  if exists (select 1 from public.customer_consents where branch = l.branch and customer_key = l.customer_key and item = 'care_record' and agreed) then return; end if;
  insert into public.customer_consents (customer_key, branch, item, agreed, version, agreed_at, method, recorded_by)
  values (l.customer_key, l.branch, 'care_record', true, 'v1-1121', now(), case when p_method = 'app' then 'app' else 'web' end, 'customer');
  if p_method = 'app' then update public.care_links set app_linked_at = coalesce(app_linked_at, now()) where token = p_token; end if;
end $$;

create or replace function public.care_meal_add(p_token text, p_day date, p_meal text, p_body text, p_photo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.care_links; t date := (now() at time zone 'Asia/Seoul')::date; i uuid;
begin
  select * into l from public.care_links where token = p_token and revoked_at is null;
  if l.token is null then raise exception 'BAD_LINK'; end if;
  if not exists (select 1 from public.customer_consents where branch = l.branch and customer_key = l.customer_key and item = 'care_record' and agreed) then
    raise exception 'NO_CONSENT';
  end if;
  if p_day is null or p_day > t or p_day < t - 3 then raise exception 'BAD_DAY'; end if;
  if p_meal not in ('아침','점심','저녁','간식') then raise exception 'BAD_MEAL'; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> p_token then raise exception 'BAD_PHOTO'; end if;
  if nullif(trim(coalesce(p_body,'')),'') is null and p_photo is null then raise exception 'EMPTY'; end if;
  if (select count(*) from public.diet_certs where link_token = p_token and created_at > now() - interval '1 day') >= 30 then
    raise exception 'TOO_MANY';
  end if;
  insert into public.diet_certs (day, branch, customer_key, kind, body, source, created_by, meal, photo_path, link_token)
  values (p_day, l.branch, l.customer_key, '식단', left(nullif(trim(p_body),''), 500), 'customer', 'customer', p_meal, p_photo, p_token)
  returning id into i;
  return i;
end $$;

create or replace function public.care_meal_del(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.diet_certs where id = p_id and link_token = p_token and created_at > now() - interval '3 days';
end $$;

-- MADELINE 앱 → 웨어러블 하루 값 올리기
-- p_rows: [{"day":"2026-11-21","steps":8123,"sleep_min":410,"weight_kg":61.2,"workout_min":35,"active_kcal":320}]
create or replace function public.care_health_push(p_token text, p_source text, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare l public.care_links; t date := (now() at time zone 'Asia/Seoul')::date; n int;
begin
  select * into l from public.care_links where token = p_token and revoked_at is null;
  if l.token is null then raise exception 'BAD_LINK'; end if;
  if not exists (select 1 from public.customer_consents where branch = l.branch and customer_key = l.customer_key and item = 'care_record' and agreed) then
    raise exception 'NO_CONSENT';
  end if;
  if p_source not in ('apple_health','health_connect') then raise exception 'BAD_SOURCE'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 31 then raise exception 'BAD_ROWS'; end if;
  insert into public.care_health_daily (branch, customer_key, day, steps, sleep_min, weight_kg, workout_min, active_kcal, source, updated_at)
  select l.branch, l.customer_key, (r->>'day')::date,
    case when r->>'steps' is null then null else least(greatest((r->>'steps')::numeric::int, 0), 100000) end,
    case when r->>'sleep_min' is null then null else least(greatest((r->>'sleep_min')::numeric::int, 0), 1440) end,
    case when (r->>'weight_kg')::numeric between 20 and 300 then round((r->>'weight_kg')::numeric, 1) end,
    case when r->>'workout_min' is null then null else least(greatest((r->>'workout_min')::numeric::int, 0), 1440) end,
    case when r->>'active_kcal' is null then null else least(greatest((r->>'active_kcal')::numeric::int, 0), 20000) end,
    p_source, now()
  from jsonb_array_elements(p_rows) r
  where (r->>'day')::date between t - 30 and t
  on conflict (branch, customer_key, day) do update set
    steps = coalesce(excluded.steps, care_health_daily.steps),
    sleep_min = coalesce(excluded.sleep_min, care_health_daily.sleep_min),
    weight_kg = coalesce(excluded.weight_kg, care_health_daily.weight_kg),
    workout_min = coalesce(excluded.workout_min, care_health_daily.workout_min),
    active_kcal = coalesce(excluded.active_kcal, care_health_daily.active_kcal),
    source = excluded.source, updated_at = now();
  get diagnostics n = row_count;
  update public.care_links set app_linked_at = coalesce(app_linked_at, now()), last_seen_at = now() where token = p_token;
  return n;
end $$;

-- ───────── 권한 ─────────
revoke all on function public.care_board(text, text) from public, anon;
revoke all on function public.care_link_issue(text, text) from public, anon;
revoke all on function public.care_link_reset(text, text) from public, anon;
revoke all on function public.care_pref_set(text, text, text, boolean, text) from public, anon;
revoke all on function public.care_log(text, text, text, text, text) from public, anon;
revoke all on function public.care_log_undo(uuid) from public, anon;
revoke all on function public.care_meal_feedback(uuid, text) from public, anon;
grant execute on function public.care_board(text, text) to authenticated;
grant execute on function public.care_link_issue(text, text) to authenticated;
grant execute on function public.care_link_reset(text, text) to authenticated;
grant execute on function public.care_pref_set(text, text, text, boolean, text) to authenticated;
grant execute on function public.care_log(text, text, text, text, text) to authenticated;
grant execute on function public.care_log_undo(uuid) to authenticated;
grant execute on function public.care_meal_feedback(uuid, text) to authenticated;

revoke all on function public.care_me(text) from public;
revoke all on function public.care_consent(text, text) from public;
revoke all on function public.care_meal_add(text, date, text, text, text) from public;
revoke all on function public.care_meal_del(text, uuid) from public;
revoke all on function public.care_health_push(text, text, jsonb) from public;
grant execute on function public.care_me(text) to anon, authenticated;
grant execute on function public.care_consent(text, text) to anon, authenticated;
grant execute on function public.care_meal_add(text, date, text, text, text) to anon, authenticated;
grant execute on function public.care_meal_del(text, uuid) to anon, authenticated;
grant execute on function public.care_health_push(text, text, jsonb) to anon, authenticated;

commit;
