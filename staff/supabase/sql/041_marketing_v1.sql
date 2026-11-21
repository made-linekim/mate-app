-- 041 마케팅 화면 (시안 1120 U-PC-MKT-1~5: 광고 · 채널 · 제안 · 문자 · 제휴) · 2026-11-21
-- 대표님이 SQL 편집기에서 한 번에 실행. 전부 트랜잭션 안에서 돌아요.
-- 새 표 6개(mkt_*) + 권한 키 2개 + 함수 14개. 기존 표는 읽기만 하고, partners/partner_contacts 만 씁니다.
-- 직원 앱은 아래 함수로만 읽고 써요(표 직접 권한 없음). 광고 토큰·키 값은 어디에도 나오지 않아요.
begin;

-- ── 권한 키 ───────────────────────────────────────────────
insert into public.perm_catalog(key, menu, label, owner_only, sort) values
  ('marketing.view', '마케팅', '마케팅 보기', false, 28),
  ('marketing.edit', '마케팅', '마케팅 입력 (키워드·직접 입력·제휴·문구)', false, 29)
on conflict (key) do nothing;

-- ── 새 표 ─────────────────────────────────────────────────
create table if not exists public.mkt_budget (            -- 채널별 월 광고비 (대표관리자만)
  branch text not null, channel text not null, monthly int not null default 0,
  updated_by text, updated_at timestamptz not null default now(),
  primary key (branch, channel));
create table if not exists public.mkt_manual (             -- API 없는 채널 직접 입력 (당근 · 리뷰 등), 주 단위
  branch text not null, week_start date not null, channel text not null,
  spend int not null default 0, inflow int not null default 0, reserve int not null default 0, reg int not null default 0,
  entered_by text, updated_at timestamptz not null default now(),
  primary key (branch, week_start, channel));
create table if not exists public.mkt_keywords (           -- 지점 키워드 (최대 10개)
  id uuid primary key default gen_random_uuid(), branch text not null, keyword text not null, sort int not null default 0,
  blog_rank int, place_rank int, rank_on date, prev_blog_rank int,
  unique (branch, keyword));
create table if not exists public.mkt_tips (               -- 제안 카드 적용/넘김
  key text not null, branch text not null, week_start date not null, status text not null, reason text,
  decided_by text, decided_at timestamptz not null default now(),
  primary key (key, branch, week_start));
create table if not exists public.mkt_sms_templates (      -- 문자 문구
  id uuid primary key default gen_random_uuid(), branch text not null, title text not null, body text not null,
  sort int not null default 0, updated_by text, updated_at timestamptz not null default now());
create table if not exists public.mkt_change_log (         -- 변경 기록 (누가 · 직급 · 내용)
  id bigint generated always as identity primary key, at timestamptz not null default now(),
  branch text, by_name text, by_tier text, body text not null);

alter table public.mkt_budget enable row level security;
alter table public.mkt_manual enable row level security;
alter table public.mkt_keywords enable row level security;
alter table public.mkt_tips enable row level security;
alter table public.mkt_sms_templates enable row level security;
alter table public.mkt_change_log enable row level security;
grant select, insert, update, delete on public.mkt_budget, public.mkt_manual, public.mkt_keywords, public.mkt_tips, public.mkt_sms_templates, public.mkt_change_log to service_role;
grant usage on all sequences in schema public to service_role;

-- 기본 문구 3개 (시안 그대로)
insert into public.mkt_sms_templates(branch, title, body, sort)
select b, t, replace(x, '{지점}', b), s from (values
  ('상담 예약 안내', '안녕하세요, 메이드라인 {지점}입니다. 이번 주 식단 상담 예약이 열려 있습니다. 일정은 고객앱이나 전화로 확인해 주세요.', 1),
  ('휴무 안내', '안녕하세요, 메이드라인 {지점}입니다. 다음 주 월요일은 센터 휴무입니다. 예약은 화요일부터 다시 열립니다.', 2),
  ('재등록 안내', '안녕하세요, 메이드라인 {지점}입니다. 회원권 만료가 가까워져 안내드립니다. 자세한 일정은 센터로 문의해 주세요.', 3)
) v(t, x, s) cross join (values ('의정부점'), ('양주점')) br(b)
where not exists (select 1 from public.mkt_sms_templates);

-- ── 공통 도우미 ───────────────────────────────────────────
create or replace function public.mkt_guard(p_branch text, p_edit boolean default false)
returns public.staff_accounts language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  select * into v from public.me();
  if v.id is null then raise exception 'NOT_SIGNED_IN' using errcode = '42501'; end if;
  if not public.can(case when p_edit then 'marketing.edit' else 'marketing.view' end) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if p_branch is null then
    if v.tier <> 'owner' then raise exception 'NO_BRANCH' using errcode = '42501'; end if;
  elsif not public.branch_ok(p_branch) then raise exception 'NO_BRANCH' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.mkt_log(p_me public.staff_accounts, p_branch text, p_body text)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.mkt_change_log(branch, by_name, by_tier, body) values (p_branch, p_me.name, p_me.tier, p_body)
$$;

-- ── 1. 광고 ──────────────────────────────────────────────
-- p_branch null = 전 지점(대표관리자). 광고 API 자료 중 지점 칸이 빈 것은 '공통'으로 늘 포함돼요.
create or replace function public.mkt_ads(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts; r jsonb; v_m1 date := date_trunc('month', p_to)::date;
begin
  v := public.mkt_guard(p_branch);
  with ch(channel, api, ord) as (values ('메타','메타',1), ('네이버 검색광고','네이버',2), ('당근','당근',3)),
  st as (
    select a.channel api, sum(s.spend) spend, sum(s.impressions) imp, sum(s.clicks) clk
    from public.ad_daily_stats s join public.ad_campaigns c on c.id = s.campaign_id join public.ad_accounts a on a.id = c.account_id
    where s.day between p_from and p_to and (p_branch is null or coalesce(s.branch,'') in ('', p_branch))
    group by 1),
  mt as (
    select a.channel api, sum(s.spend) spend
    from public.ad_daily_stats s join public.ad_campaigns c on c.id = s.campaign_id join public.ad_accounts a on a.id = c.account_id
    where s.day between v_m1 and p_to and (p_branch is null or coalesce(s.branch,'') in ('', p_branch))
    group by 1),
  mn as (
    select channel, sum(spend) spend, sum(inflow) inflow, sum(reserve) reserve, sum(reg) reg
    from public.mkt_manual where week_start between p_from - 6 and p_to and (p_branch is null or branch = p_branch) group by 1),
  iq as (   -- 문의 → 예약 · 등록 (경로별)
    select i.channel, count(*) n,
      count(*) filter (where exists (select 1 from public.rsv_reservations x where x.customer_key = i.customer_key and x.day >= i.day)) rsv,
      count(*) filter (where exists (select 1 from public.customers k where k.key = i.customer_key and k.first_payment_on >= i.day)) reg
    from public.inquiries i where i.day between p_from and p_to and (p_branch is null or i.branch = p_branch) group by 1),
  ca as (select api, bool_or(active) on_ from (select channel api, active from public.ad_accounts) z group by 1),
  cs as (select a.channel api, count(*) filter (where c.status = '켜짐') live from public.ad_campaigns c join public.ad_accounts a on a.id = c.account_id group by 1),
  bd as (select channel, sum(monthly) monthly from public.mkt_budget where p_branch is null or branch = p_branch group by 1)
  select jsonb_build_object(
    'rows', (select jsonb_agg(jsonb_build_object(
        'channel', ch.channel,
        'connected', coalesce(ca.on_, false),
        'live', coalesce(cs.live, 0),
        'spend', coalesce(st.spend, 0) + coalesce(mn.spend, 0),
        'month_spend', coalesce(mt.spend, 0),
        'budget', bd.monthly,
        'imp', st.imp,
        'inflow', coalesce(st.clk, 0) + coalesce(mn.inflow, 0) + coalesce(iq.n, 0),
        'reserve', coalesce(iq.rsv, 0) + coalesce(mn.reserve, 0),
        'reg', coalesce(iq.reg, 0) + coalesce(mn.reg, 0),
        'manual', mn.channel is not null) order by ch.ord)
      from ch left join st on st.api = ch.api left join mt on mt.api = ch.api left join mn on mn.channel = ch.channel
        left join iq on iq.channel = ch.channel left join ca on ca.api = ch.api left join cs on cs.api = ch.api left join bd on bd.channel = ch.channel),
    'cap_total', (select value::int from public.config_values where key = 'ads.monthly_cap_total' order by effective_from desc nulls last limit 1),
    'jobs', (select jsonb_agg(j order by j->>'job') from (
        select distinct on (job) jsonb_build_object('job', job, 'result', result, 'reason', fail_reason, 'at', coalesce(ended_at, started_at)) j
        from public.job_runs where job like 'ads-%' order by job, started_at desc nulls last) z),
    'fails', (select count(*) from public.job_runs where job like 'ads-%' and result not in ('성공','건너뜀') and run_date >= current_date - 7),
    'log', (select jsonb_agg(l) from (select jsonb_build_object('at', at, 'by', by_name, 'tier', by_tier, 'body', body) l
        from public.mkt_change_log where p_branch is null or branch = p_branch or branch is null order by at desc limit 10) z)
  ) into r;
  return r;
end $$;

-- 월 광고비 바꾸기 (대표관리자만: ads.budget)
create or replace function public.mkt_budget_set(p_branch text, p_channel text, p_monthly int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_old int;
begin
  v := public.mkt_guard(p_branch);
  if p_branch is null or not public.can('ads.budget') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if p_channel not in ('메타','네이버 검색광고','당근') or p_monthly not between 0 and 100000000 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  select monthly into v_old from public.mkt_budget where branch = p_branch and channel = p_channel;
  insert into public.mkt_budget(branch, channel, monthly, updated_by) values (p_branch, p_channel, p_monthly, v.name)
  on conflict (branch, channel) do update set monthly = excluded.monthly, updated_by = excluded.updated_by, updated_at = now();
  perform public.mkt_log(v, p_branch, format('%s 월 광고비 %s → %s · %s', p_channel,
    coalesce(to_char(v_old, 'FM999,999,999'), '없음'), to_char(p_monthly, 'FM999,999,999'), p_branch));
end $$;

-- 광고 끄기 요청 기록 (실제 끄기는 광고 관리자에서. 여기서는 누가 언제 요청했는지 남겨요)
create or replace function public.mkt_ad_off_request(p_branch text, p_channel text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch);
  if p_branch is null or not public.can('ads.budget') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  perform public.mkt_log(v, p_branch, format('%s 광고 끄기 요청 · %s', p_channel, p_branch));
end $$;

-- 직접 입력 (당근 · 리뷰 · 인스타그램 등 API 없는 채널), 주 시작일(월요일) 기준
create or replace function public.mkt_manual_set(p_branch text, p_week date, p_channel text, p_spend int, p_inflow int, p_reserve int, p_reg int)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_w date := date_trunc('week', p_week)::date;
begin
  v := public.mkt_guard(p_branch, true);
  if p_branch is null then raise exception 'NO_BRANCH'; end if;
  if p_channel not in ('당근','리뷰','인스타그램','네이버 블로그') or least(p_spend, p_inflow, p_reserve, p_reg) < 0 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  if p_spend > 0 and not public.can('ads.budget') then raise exception 'NO_PERMISSION_SPEND' using errcode = '42501'; end if;
  insert into public.mkt_manual(branch, week_start, channel, spend, inflow, reserve, reg, entered_by)
  values (p_branch, v_w, p_channel, coalesce(p_spend,0), coalesce(p_inflow,0), coalesce(p_reserve,0), coalesce(p_reg,0), v.name)
  on conflict (branch, week_start, channel) do update set
    spend = case when public.can('ads.budget') then excluded.spend else mkt_manual.spend end,
    inflow = excluded.inflow, reserve = excluded.reserve, reg = excluded.reg, entered_by = excluded.entered_by, updated_at = now();
  perform public.mkt_log(v, p_branch, format('%s 직접 입력 (%s 주) 광고비 %s · 유입 %s · 예약 %s · 등록 %s',
    p_channel, to_char(v_w, 'MM.DD'), to_char(p_spend, 'FM999,999,990'), p_inflow, p_reserve, p_reg));
end $$;

-- ── 2. 채널 ──────────────────────────────────────────────
create or replace function public.mkt_channels(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts; r jsonb; v_len int := p_to - p_from + 1;
begin
  v := public.mkt_guard(p_branch);
  select jsonb_build_object(
    'inflow', (select jsonb_agg(x order by (x->>'n')::int desc) from (
        select jsonb_build_object('route', coalesce(nullif(channel,''), '기타'), 'n', count(*),
          'rsv', count(*) filter (where exists (select 1 from public.rsv_reservations r where r.customer_key = i.customer_key and r.day >= i.day)),
          'reg', count(*) filter (where exists (select 1 from public.customers k where k.key = i.customer_key and k.first_payment_on >= i.day))) x
        from public.inquiries i where i.day between p_from and p_to and (p_branch is null or i.branch = p_branch)
        group by coalesce(nullif(channel,''), '기타')) z),
    'blog', jsonb_build_object(
        'now', (select count(*) from public.blog_posts where posted_on between p_from and p_to and (p_branch is null or branch = p_branch)),
        'prev', (select count(*) from public.blog_posts where posted_on between p_from - v_len and p_from - 1 and (p_branch is null or branch = p_branch))),
    'manual', (select jsonb_object_agg(channel, inflow) from (select channel, sum(inflow) inflow from public.mkt_manual
        where week_start between p_from - 6 and p_to and (p_branch is null or branch = p_branch) and channel in ('리뷰','인스타그램') group by 1) z),
    'manual_prev', (select jsonb_object_agg(channel, inflow) from (select channel, sum(inflow) inflow from public.mkt_manual
        where week_start between p_from - v_len - 6 and p_from - 1 and (p_branch is null or branch = p_branch) and channel in ('리뷰','인스타그램') group by 1) z),
    'keywords', (select jsonb_agg(jsonb_build_object('id', id, 'branch', branch, 'keyword', keyword, 'blog', blog_rank, 'place', place_rank, 'prev', prev_blog_rank, 'on', rank_on) order by sort, keyword)
        from public.mkt_keywords where p_branch is null or branch = p_branch),
    'jobs', (select jsonb_agg(j order by j->>'job') from (
        select distinct on (job) jsonb_build_object('job', job, 'result', result, 'reason', fail_reason, 'at', coalesce(ended_at, started_at)) j
        from public.job_runs where job not like 'ads-%' order by job, started_at desc nulls last) z)
  ) into r;
  return r;
end $$;

-- 키워드 바꾸기: 목록 통째로 저장 (최대 10개). 순위는 직접 입력 또는 수집 루틴이 채워요.
create or replace function public.mkt_keywords_save(p_branch text, p_items jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; e jsonb; i int := 0;
begin
  v := public.mkt_guard(p_branch, true);
  if p_branch is null or jsonb_array_length(p_items) > 10 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  delete from public.mkt_keywords where branch = p_branch
    and keyword not in (select btrim(x->>'keyword') from jsonb_array_elements(p_items) x);
  for e in select * from jsonb_array_elements(p_items) loop
    i := i + 1;
    if coalesce(btrim(e->>'keyword'), '') = '' or length(e->>'keyword') > 40 then continue; end if;
    insert into public.mkt_keywords(branch, keyword, sort, blog_rank, place_rank, rank_on)
    values (p_branch, btrim(e->>'keyword'), i, nullif(e->>'blog','')::int, nullif(e->>'place','')::int,
            case when nullif(e->>'blog','') is not null or nullif(e->>'place','') is not null then current_date end)
    on conflict (branch, keyword) do update set sort = excluded.sort,
      prev_blog_rank = case when excluded.blog_rank is distinct from mkt_keywords.blog_rank then mkt_keywords.blog_rank else mkt_keywords.prev_blog_rank end,
      blog_rank = excluded.blog_rank, place_rank = excluded.place_rank,
      rank_on = case when excluded.blog_rank is distinct from mkt_keywords.blog_rank or excluded.place_rank is distinct from mkt_keywords.place_rank then current_date else mkt_keywords.rank_on end;
  end loop;
  perform public.mkt_log(v, p_branch, format('키워드 %s개 저장 · %s', jsonb_array_length(p_items), p_branch));
end $$;

-- ── 3. 제안 (규칙으로 최대 3개, 이번 주에 넘긴 것은 빼요) ─────────
create or replace function public.mkt_tips_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts; w date := date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date;
  out jsonb := '[]'::jsonb; b_now int; b_avg numeric; m_now numeric; m_avg numeric; k record; cap int; spent int; d int;
begin
  v := public.mkt_guard(p_branch);
  -- 발행량: 블로그
  select count(*) into b_now from public.blog_posts where posted_on >= w and (p_branch is null or branch = p_branch);
  select count(*) / 4.0 into b_avg from public.blog_posts where posted_on between w - 28 and w - 1 and (p_branch is null or branch = p_branch);
  if b_avg >= 1 and b_now < b_avg * 0.7 then
    out := out || jsonb_build_object('key', 'blog_drop', 'tag', '발행량', 'title', '네이버 블로그 발행이 줄었습니다',
      'body', format('최근 4주 평균 주 %s건에서 이번 주 %s건으로 줄었습니다.', round(b_avg), b_now),
      'meta', format('적용 전 주 %s건 · 적용 후 목표 주 %s건', b_now, round(b_avg)));
  end if;
  -- 광고: 메타 클릭 단가
  select sum(s.spend)::numeric / nullif(sum(s.clicks), 0) into m_now from public.ad_daily_stats s where s.day >= w;
  select sum(s.spend)::numeric / nullif(sum(s.clicks), 0) into m_avg from public.ad_daily_stats s where s.day between w - 28 and w - 1;
  if m_now is not null and m_avg is not null and m_now > m_avg * 1.2 then
    out := out || jsonb_build_object('key', 'cpc_up', 'tag', '광고', 'title', '광고 클릭 단가가 올랐습니다',
      'body', format('최근 4주 평균 %s원에서 이번 주 %s원으로 올랐습니다. 소재를 바꿔 볼 때입니다.', round(m_avg), round(m_now)),
      'meta', format('적용 전 %s원 · 목표 %s원', round(m_now), round(m_avg)));
  end if;
  -- 광고: 월 상한 대비 속도
  select value::int into cap from public.config_values where key = 'ads.monthly_cap_total' order by effective_from desc nulls last limit 1;
  select coalesce(sum(spend), 0) into spent from public.ad_daily_stats where day >= date_trunc('month', current_date)::date;
  d := extract(day from current_date)::int;
  if cap > 0 and spent::numeric / d * extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int > cap then
    out := out || jsonb_build_object('key', 'cap_pace', 'tag', '광고', 'title', '이 속도면 월 광고비 상한을 넘습니다',
      'body', format('이번 달 %s일까지 %s원을 썼습니다. 월 상한은 %s원입니다.', d, to_char(spent, 'FM999,999,999'), to_char(cap, 'FM999,999,999')),
      'meta', '광고비는 대표관리자만 바꿀 수 있습니다');
  end if;
  -- 키워드: 블로그 순위 하락
  for k in select keyword, blog_rank, prev_blog_rank from public.mkt_keywords
      where (p_branch is null or branch = p_branch) and blog_rank > prev_blog_rank + 2 order by blog_rank - prev_blog_rank desc limit 1 loop
    out := out || jsonb_build_object('key', 'kw_' || md5(k.keyword), 'tag', '키워드', 'title', format('''%s'' 블로그 순위가 내려갔습니다', k.keyword),
      'body', format('%s위에서 %s위로 내려갔습니다.', k.prev_blog_rank, k.blog_rank),
      'meta', format('적용 전 %s위 · 최근 %s위', k.prev_blog_rank, k.blog_rank));
  end loop;
  -- 자동화가 남긴 광고 제안 (대기)
  out := out || coalesce((select jsonb_agg(jsonb_build_object('key', 'sg_' || id, 'tag', '광고', 'title', title,
      'body', coalesce(reason, ''), 'meta', coalesce(effect, ''))) from public.ad_suggestions where status = '대기'), '[]'::jsonb);
  return jsonb_build_object('week', w, 'items', coalesce((
    select jsonb_agg(x) from (select x from jsonb_array_elements(out) x
      where not exists (select 1 from public.mkt_tips t where t.key = x->>'key' and t.week_start = w and t.branch = coalesce(p_branch, '전체'))
      limit 3) z), '[]'::jsonb),
    'done', (select jsonb_agg(jsonb_build_object('key', key, 'status', status, 'reason', reason, 'by', decided_by, 'at', decided_at))
      from public.mkt_tips where week_start = w and branch = coalesce(p_branch, '전체')));
end $$;

create or replace function public.mkt_tip_decide(p_branch text, p_key text, p_status text, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; w date := date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date;
begin
  v := public.mkt_guard(p_branch, true);
  if p_status not in ('적용', '넘김') then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  insert into public.mkt_tips(key, branch, week_start, status, reason, decided_by)
  values (p_key, coalesce(p_branch, '전체'), w, p_status, nullif(btrim(coalesce(p_reason,'')), ''), v.name)
  on conflict (key, branch, week_start) do update set status = excluded.status, reason = excluded.reason, decided_by = excluded.decided_by, decided_at = now();
end $$;

create or replace function public.mkt_tip_undo(p_branch text, p_key text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch, true);
  delete from public.mkt_tips where key = p_key and branch = coalesce(p_branch, '전체')
    and week_start = date_trunc('week', (now() at time zone 'Asia/Seoul')::date)::date;
end $$;

-- ── 4. 문자 ──────────────────────────────────────────────
-- 받는 사람 수: 광고 수신 '동의' 고객만. 이름·번호는 돌려주지 않아요.
create or replace function public.mkt_sms_info(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch);
  return jsonb_build_object(
    'agreed', (select count(*) from public.customers where (p_branch is null or branch = p_branch) and ad_consent = '동의'),
    'not_agreed', (select count(*) from public.customers where (p_branch is null or branch = p_branch) and coalesce(ad_consent, '') <> '동의'),
    'can_send', public.can('common.sms_send'),
    'provider', false,   -- 문자 업체 연결 전
    'templates', (select jsonb_agg(jsonb_build_object('id', id, 'branch', branch, 'title', title, 'body', body) order by sort, title)
      from public.mkt_sms_templates where p_branch is null or branch = p_branch));
end $$;

create or replace function public.mkt_sms_template_save(p_branch text, p_id uuid, p_title text, p_body text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_id uuid;
begin
  v := public.mkt_guard(p_branch, true);
  if p_branch is null or coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' or length(p_body) > 2000 or length(p_title) > 40 then
    raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.mkt_sms_templates(branch, title, body, sort, updated_by)
    values (p_branch, btrim(p_title), btrim(p_body), coalesce((select max(sort) + 1 from public.mkt_sms_templates where branch = p_branch), 1), v.name)
    returning id into v_id;
  else
    update public.mkt_sms_templates set title = btrim(p_title), body = btrim(p_body), updated_by = v.name, updated_at = now()
    where id = p_id and branch = p_branch returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.mkt_sms_template_del(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; b text;
begin
  select branch into b from public.mkt_sms_templates where id = p_id;
  if b is null then raise exception 'NOT_FOUND'; end if;
  v := public.mkt_guard(b, true);
  delete from public.mkt_sms_templates where id = p_id;
end $$;

-- ── 5. 제휴 (기존 partners / partner_contacts) ────────────
-- 소개 = partner_contacts.method '소개', 등록 = 그중 result '등록'
create or replace function public.mkt_partners(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts; m1 date := date_trunc('month', (now() at time zone 'Asia/Seoul')::date)::date; y1 date := date_trunc('year', (now() at time zone 'Asia/Seoul')::date)::date;
begin
  v := public.mkt_guard(p_branch);
  return jsonb_build_object(
    'month_intro', (select count(*) from public.partner_contacts c join public.partners p on p.id = c.partner_id where c.method = '소개' and c.day >= m1 and (p_branch is null or p.branch = p_branch)),
    'month_reg', (select count(*) from public.partner_contacts c join public.partners p on p.id = c.partner_id where c.method = '소개' and c.result = '등록' and c.day >= m1 and (p_branch is null or p.branch = p_branch)),
    'year_intro', (select count(*) from public.partner_contacts c join public.partners p on p.id = c.partner_id where c.method = '소개' and c.day >= y1 and (p_branch is null or p.branch = p_branch)),
    'year_reg', (select count(*) from public.partner_contacts c join public.partners p on p.id = c.partner_id where c.method = '소개' and c.result = '등록' and c.day >= y1 and (p_branch is null or p.branch = p_branch)),
    'list', (select jsonb_agg(jsonb_build_object('id', p.id, 'branch', p.branch, 'name', p.name, 'industry', p.industry, 'owner', p.owner,
        'contact_name', p.contact_name, 'memo', p.memo, 'last', p.last_contact_on,
        'intro', (select count(*) from public.partner_contacts c where c.partner_id = p.id and c.method = '소개'),
        'reg', (select count(*) from public.partner_contacts c where c.partner_id = p.id and c.method = '소개' and c.result = '등록'))
        order by p.last_contact_on desc nulls last, p.name)
      from public.partners p where p_branch is null or p.branch = p_branch));
end $$;

create or replace function public.mkt_partner_save(p_branch text, p_id uuid, p_name text, p_industry text, p_owner text, p_contact_name text, p_memo text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_id uuid;
begin
  v := public.mkt_guard(p_branch, true);
  if p_branch is null or coalesce(btrim(p_name), '') = '' or length(p_name) > 60 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.partners(branch, name, industry, owner, contact_name, memo, stage, created_on)
    values (p_branch, btrim(p_name), nullif(btrim(p_industry),''), coalesce(nullif(btrim(p_owner),''), v.name), nullif(btrim(p_contact_name),''), nullif(btrim(p_memo),''), '진행', current_date)
    returning id into v_id;
    perform public.mkt_log(v, p_branch, format('제휴 업체 추가 %s · %s', btrim(p_name), p_branch));
  else
    update public.partners set name = btrim(p_name), industry = nullif(btrim(p_industry),''), owner = nullif(btrim(p_owner),''),
      contact_name = nullif(btrim(p_contact_name),''), memo = nullif(btrim(p_memo),'')
    where id = p_id and branch = p_branch returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;

-- 소개 · 연락 기록 (p_method: '소개' 또는 '연락', p_result: '등록' '상담' '' 등)
create or replace function public.mkt_partner_contact(p_id uuid, p_day date, p_method text, p_result text, p_message text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; b text;
begin
  select branch into b from public.partners where id = p_id;
  if b is null then raise exception 'NOT_FOUND'; end if;
  v := public.mkt_guard(b, true);
  if p_method not in ('소개', '연락') then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  insert into public.partner_contacts(partner_id, day, method, result, message, staff)
  values (p_id, coalesce(p_day, current_date), p_method, nullif(btrim(coalesce(p_result,'')),''), nullif(btrim(coalesce(p_message,'')),''), v.name);
  update public.partners set last_contact_on = greatest(coalesce(last_contact_on, p_day), coalesce(p_day, current_date)) where id = p_id;
end $$;

-- ── 실행 권한 ─────────────────────────────────────────────
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'mkt\_%' loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
-- 도우미 두 개는 앱에서 직접 부를 필요가 없어요
revoke execute on function public.mkt_log(public.staff_accounts, text, text) from authenticated;

commit;
