-- 046 문자·알림톡 실제 발송 (NHN Cloud) · 2026-11-21
-- 발송은 서버(/api/msg/*)에서만 해요. 브라우저는 고객 번호를 절대 받지 않아요.
--   1) 직원 로그인으로 msg_sms_begin / msg_alimtalk_begin 호출 → 권한·지점·시간 검사 + 발송 기록 1줄 생성
--   2) 서버가 서버 열쇠(MSG_SERVER_SECRET)와 함께 msg_targets(id) 로 받는 번호를 꺼내 NHN에 보냄
--   3) 서버가 msg_finish 로 결과(성공·실패 수) 기록
-- 설정 값(config_values, scope = 지점):
--   sms.send_no      NHN에 등록된 발신번호 (예: 0318xxxxxxx)
--   sms.optout_080   NHN 080 수신거부 번호 (광고 문자에 꼭 필요)
--   alimtalk.sender_key 는 비밀이 아니지만 Vercel 환경변수 NHN_ALIMTALK_SENDER_KEY 로 둬요.

create table if not exists public.msg_send_log (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  channel text not null check (channel in ('sms', 'alimtalk')),
  is_ad boolean not null default false,
  is_test boolean not null default false,
  title text,
  body text not null,
  template_code text,
  params jsonb,
  customer_key text,          -- 알림톡 1명 발송일 때
  test_no text,               -- 나에게 테스트 받는 번호 (직원 본인 번호)
  target_count int not null default 0,
  ok_count int,
  fail_count int,
  status text not null default '준비' check (status in ('준비', '보냄', '일부 실패', '실패')),
  nhn_request_id text,
  error text,
  by_id uuid,
  by_name text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists msg_send_log_branch_idx on public.msg_send_log(branch, created_at desc);
alter table public.msg_send_log enable row level security;
grant select, insert, update on public.msg_send_log to service_role;

insert into public.perm_catalog(key, menu, label, owner_only, sort)
select 'common.sms_send', '공통', '문자·알림톡 보내기', false, 90
where not exists (select 1 from public.perm_catalog where key = 'common.sms_send');

create or replace function public.msg_cfg(p_key text, p_branch text)
returns text language sql stable security definer set search_path to 'public' as $$
  select value from public.config_values
  where key = p_key and (scope = p_branch or scope is null or scope = '전체')
  order by (scope = p_branch) desc nulls last, effective_from desc nulls last limit 1;
$$;

-- 받을 고객: 광고 수신 '동의' + 번호가 휴대폰(010…) 모양. 번호 중복은 1번만.
create or replace function public.msg_ad_targets_count(p_branch text)
returns int language sql stable security definer set search_path to 'public' as $$
  select count(distinct regexp_replace(c.phone, '\D', '', 'g'))::int from public.customers c
  where c.branch = p_branch and c.ad_consent = '동의'
    and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') ~ '^01[016789]\d{7,8}$';
$$;

-- 1) 광고 문자 시작 (직원 로그인으로 호출)
create or replace function public.msg_sms_begin(p_branch text, p_text text, p_test_no text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; h int; v_send text; v_080 text; v_body text; v_cnt int; v_id uuid; v_test text;
begin
  select * into v from public.me();
  if v.id is null then raise exception 'NOT_SIGNED_IN' using errcode = '42501'; end if;
  if not (public.can('marketing.edit') and public.can('common.sms_send')) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if p_branch is null or not public.branch_ok(p_branch) then raise exception 'NO_BRANCH' using errcode = '42501'; end if;
  if coalesce(btrim(p_text), '') = '' or length(p_text) > 900 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  h := extract(hour from (now() at time zone 'Asia/Seoul'));
  if h >= 21 or h < 8 then raise exception 'NIGHT_AD' using errcode = '22023'; end if;
  v_send := public.msg_cfg('sms.send_no', p_branch);
  v_080 := public.msg_cfg('sms.optout_080', p_branch);
  if coalesce(v_send, '') = '' then raise exception 'NO_SEND_NO' using errcode = '22023'; end if;
  if coalesce(v_080, '') = '' then raise exception 'NO_080' using errcode = '22023'; end if;
  -- 광고 필수 문구: 첫 줄 (광고), 마지막 줄 무료수신거부 080…
  v_body := '(광고) 메이드라인 ' || p_branch || E'\n' || btrim(regexp_replace(p_text, '^\s*\(광고\)\s*', '')) || E'\n무료수신거부 ' || regexp_replace(v_080, '\D', '', 'g');
  if p_test_no is not null then
    v_test := regexp_replace(p_test_no, '\D', '', 'g');
    if v_test !~ '^01[016789]\d{7,8}$' then raise exception 'BAD_PHONE' using errcode = '22023'; end if;
    v_cnt := 1;
  else
    v_cnt := public.msg_ad_targets_count(p_branch);
    if v_cnt = 0 then raise exception 'NO_TARGET' using errcode = '22023'; end if;
    -- 같은 지점 광고 문자는 10분에 1번만 (두 번 누름 방지)
    if exists (select 1 from public.msg_send_log where branch = p_branch and channel = 'sms' and is_ad and not is_test
               and created_at > now() - interval '10 minutes' and status <> '실패') then
      raise exception 'TOO_SOON' using errcode = '22023'; end if;
  end if;
  insert into public.msg_send_log(branch, channel, is_ad, is_test, title, body, test_no, target_count, by_id, by_name)
  values (p_branch, 'sms', true, v_test is not null, '메이드라인 ' || p_branch, v_body, v_test, v_cnt, v.id, v.name)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'count', v_cnt, 'send_no', regexp_replace(v_send, '\D', '', 'g'), 'body', v_body, 'title', '메이드라인 ' || p_branch);
end $$;

-- 1') 알림톡 1명 (예약 안내·해피콜 등 정보성, 카카오 검수 받은 템플릿만)
create or replace function public.msg_alimtalk_begin(p_customer_key text, p_template_code text, p_params jsonb default '{}'::jsonb, p_test_no text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_branch text; v_phone text; v_id uuid; v_test text;
begin
  select * into v from public.me();
  if v.id is null then raise exception 'NOT_SIGNED_IN' using errcode = '42501'; end if;
  if not public.can('common.sms_send') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if coalesce(btrim(p_template_code), '') = '' then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  if p_test_no is not null then
    v_test := regexp_replace(p_test_no, '\D', '', 'g');
    if v_test !~ '^01[016789]\d{7,8}$' then raise exception 'BAD_PHONE' using errcode = '22023'; end if;
    v_branch := v.branch;
  else
    select branch, phone into v_branch, v_phone from public.customers where key = p_customer_key limit 1;
    if v_branch is null then raise exception 'NOT_FOUND'; end if;
    if not public.branch_ok(v_branch) then raise exception 'NO_BRANCH' using errcode = '42501'; end if;
    if regexp_replace(coalesce(v_phone, ''), '\D', '', 'g') !~ '^01[016789]\d{7,8}$' then raise exception 'BAD_PHONE' using errcode = '22023'; end if;
  end if;
  insert into public.msg_send_log(branch, channel, is_ad, is_test, body, template_code, params, customer_key, test_no, target_count, by_id, by_name)
  values (v_branch, 'alimtalk', false, v_test is not null, '(템플릿 ' || p_template_code || ')', p_template_code,
          coalesce(p_params, '{}'::jsonb), case when v_test is null then p_customer_key end, v_test, 1, v.id, v.name)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'count', 1);
end $$;

-- 서버 열쇠: Vercel 환경변수 MSG_SERVER_SECRET 의 sha256 (원래 값은 Vercel에만 있어요)
create or replace function public.msg_secret_ok(p text)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(encode(sha256(convert_to(p, 'UTF8')), 'hex') = '1d3a0ed1f8da3a50357a9adedc11f20312d301c94d6ddde6bf061df05b99c99e', false);
$$;

-- 2) 받는 번호 (서버 전용: 서버 열쇠 없으면 안 열려요)
create or replace function public.msg_targets(p_id uuid, p_secret text)
returns table(phone text) language plpgsql stable security definer set search_path to 'public' as $$
declare l public.msg_send_log;
begin
  if not public.msg_secret_ok(p_secret) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  select * into l from public.msg_send_log where id = p_id;
  if l.id is null or l.by_id is distinct from (select id from public.me()) or l.status <> '준비' or l.created_at < now() - interval '10 minutes' then raise exception 'NOT_FOUND'; end if;
  if l.test_no is not null then return query select l.test_no; return; end if;
  if l.channel = 'alimtalk' then
    return query select regexp_replace(c.phone, '\D', '', 'g') from public.customers c where c.key = l.customer_key limit 1;
  else
    return query select distinct regexp_replace(c.phone, '\D', '', 'g') from public.customers c
      where c.branch = l.branch and c.ad_consent = '동의'
        and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') ~ '^01[016789]\d{7,8}$';
  end if;
end $$;

-- 3) 결과 기록 (서버 전용)
create or replace function public.msg_finish(p_id uuid, p_secret text, p_ok int, p_fail int, p_request_id text, p_error text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.msg_secret_ok(p_secret) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  update public.msg_send_log set ok_count = p_ok, fail_count = p_fail, nhn_request_id = p_request_id, error = left(p_error, 500),
    status = case when coalesce(p_ok, 0) = 0 then '실패' when coalesce(p_fail, 0) > 0 then '일부 실패' else '보냄' end,
    finished_at = now()
  where id = p_id and status = '준비';
end $$;

-- 화면용: 설정 상태 + 최근 발송 기록 (번호는 안 보여 줘요)
create or replace function public.msg_status(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch);
  return jsonb_build_object(
    'send_no', public.msg_cfg('sms.send_no', p_branch) is not null,
    'optout_080', public.msg_cfg('sms.optout_080', p_branch),
    'can_send', public.can('marketing.edit') and public.can('common.sms_send'),
    'targets', public.msg_ad_targets_count(p_branch),
    'recent', (select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('at', created_at, 'channel', channel, 'test', is_test, 'count', target_count,
        'ok', ok_count, 'fail', fail_count, 'status', status, 'by', by_name) x
      from public.msg_send_log where branch = p_branch order by created_at desc limit 10) s));
end $$;

revoke all on function public.msg_cfg(text, text), public.msg_ad_targets_count(text), public.msg_secret_ok(text) from public, anon, authenticated;
-- 서버 라우트는 직원 로그인 토큰으로 부르고, 서버 열쇠로 한 번 더 막아요
revoke all on function public.msg_targets(uuid, text), public.msg_finish(uuid, text, int, int, text, text) from public, anon;
grant execute on function public.msg_targets(uuid, text), public.msg_finish(uuid, text, int, int, text, text) to authenticated, service_role;
revoke all on function public.msg_sms_begin(text, text, text), public.msg_alimtalk_begin(text, text, jsonb, text), public.msg_status(text) from public, anon;
grant execute on function public.msg_sms_begin(text, text, text), public.msg_alimtalk_begin(text, text, jsonb, text), public.msg_status(text) to authenticated, service_role;

-- 발신번호: NHN에 등록된 번호 (2025-05-12 등록, 사용 Y). 두 지점 같은 번호로 시작해요.
insert into public.config_values(key, scope, value, effective_from, changed_by, changed_at, note)
select 'sms.send_no', b, '01084400204', (now() at time zone 'Asia/Seoul')::date, 'claude', now(), 'NHN 등록 발신번호'
from unnest(array['의정부점', '양주점']) b
where not exists (select 1 from public.config_values where key = 'sms.send_no' and scope = b);
-- 080 수신거부 번호는 NHN에서 신청한 뒤 아래처럼 넣어요 (아직 없음):
-- insert into public.config_values(key, scope, value, effective_from, changed_by, changed_at, note)
-- select 'sms.optout_080', b, '080XXXXXXX', (now() at time zone 'Asia/Seoul')::date, '대표관리자', now(), 'NHN 080 수신거부'
-- from unnest(array['의정부점', '양주점']) b;
