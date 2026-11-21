-- 057 설정 › 계정 · 연결 · 네이버 예약 (2026-11-21)
-- 056 다음에 SQL 편집기에서 실행하세요. 표 변경 없음, 읽기 함수만 있어요.
--  account_list()        : 대표관리자만. 직원 계정 + 최근 접속(auth.users.last_sign_in_at). 비밀번호·이메일은 돌려주지 않아요.
--  conn_status(p_branch) : 관리자 이상. 광고 계정(ad_accounts) 연결 여부 + 마지막 수집일. 키 값은 돌려주지 않아요(끝 4자리도 없음).
--  naver_status(p_branch): 네이버 예약 연동은 아직 없어서 '연결 안 됨'을 돌려줘요. 연동이 생기면 이 함수만 바꾸면 돼요.

begin;

create or replace function public.account_list()
returns table(id uuid, name text, login_id text, tier text, branch text, status text, last_sign_in_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.name, s.login_id, s.tier, s.branch, s.status, u.last_sign_in_at
    from staff_accounts s left join auth.users u on u.id = s.id
   where (select tier from public.me()) = 'owner'
   order by case s.tier when 'owner' then 0 when 'manager' then 1 else 2 end, s.branch, s.name
$$;

create or replace function public.conn_status(p_branch text)
returns table(channel text, connected boolean, key_tail text, last_at timestamptz, manual boolean)
language sql stable security definer set search_path to 'public' as $$
  with ok as (select (select tier from public.me()) in ('owner','manager') and (p_branch is null or public.branch_ok(p_branch)) v),
  ch(channel, api, ord, manual) as (values ('메타','메타',1,false), ('네이버 검색광고','네이버',2,false), ('당근','당근',3,true))
  select ch.channel,
         coalesce((select bool_or(a.active) from ad_accounts a where a.channel = ch.api), false),
         null::text,
         (select max(s.day)::timestamptz from ad_daily_stats s join ad_campaigns c on c.id = s.campaign_id join ad_accounts a on a.id = c.account_id
           where a.channel = ch.api and (p_branch is null or coalesce(s.branch, '') in ('', p_branch))),
         ch.manual
    from ch, ok where ok.v order by ch.ord
$$;

create or replace function public.naver_status(p_branch text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when public.branch_ok(p_branch) then
    jsonb_build_object('connected', false, 'key_tail', null, 'last_at', null, 'products', '[]'::jsonb) end
$$;

revoke all on function public.account_list(), public.conn_status(text), public.naver_status(text) from public, anon;
grant execute on function public.account_list(), public.conn_status(text), public.naver_status(text) to authenticated, service_role;

commit;
