-- 041 통계 · 집계 (시안 1120 STAT-1~6, 뷰티사랑넷 통계분석·집계 구조) : SQL 편집기에서 한 번에 실행하세요.
-- 표 1개(stats_favs: 리포트 즐겨찾기) + 함수. 기존 표는 바꾸지 않아요.
-- 권한: 통계·집계 화면 = stats.view
--       금액은 sales.others(전체) 또는 sales.own(본인 매출만) 이 있어야 보여요. 없으면 건수만.
--       고객 이름은 customer.view 가 있어야 보여요.
--       인센티브 요율 바꾸기 = 대표관리자 또는 payroll.manage
-- 지점: 대표관리자는 전체/지점 선택, 나머지는 자기 지점만.

begin;

-- ───────── 0) 즐겨찾기 ─────────
create table if not exists public.stats_favs (
  staff_id uuid not null,
  report_id text not null,
  created_at timestamptz not null default now(),
  primary key (staff_id, report_id)
);
alter table public.stats_favs enable row level security;
revoke all on public.stats_favs from public, anon, authenticated;
grant select, insert, update, delete on public.stats_favs to service_role;

-- 즐겨찾기 목록 (처음 쓰는 사람은 기본 즐겨찾기 4개)
create or replace function public.stats_fav_list()
returns text[] language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; r text[];
begin
  select * into m from public.me();
  if m.id is null or not public.can('stats.view') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  select array_agg(report_id order by created_at) into r from public.stats_favs where staff_id = m.id;
  if r is null and not exists (select 1 from public.stats_favs where staff_id = m.id and report_id = '-') then
    r := array['sales_month', 'cust_new', 'rsv_status', 'noshow_top'];
  end if;
  return coalesce(array_remove(r, '-'), '{}');
end $$;

-- 별 누르기: 켜졌으면 true
create or replace function public.stats_fav_toggle(p_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; v_cur text[];
begin
  select * into m from public.me();
  if m.id is null or not public.can('stats.view') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  -- 기본 즐겨찾기를 쓰던 사람은 처음 누를 때 기본값을 실제로 저장해요
  if not exists (select 1 from public.stats_favs where staff_id = m.id) then
    v_cur := public.stats_fav_list();
    insert into public.stats_favs(staff_id, report_id) values (m.id, '-') on conflict do nothing;
    insert into public.stats_favs(staff_id, report_id) select m.id, x from unnest(v_cur) x on conflict do nothing;
  end if;
  if exists (select 1 from public.stats_favs where staff_id = m.id and report_id = p_id) then
    delete from public.stats_favs where staff_id = m.id and report_id = p_id;
    return false;
  end if;
  insert into public.stats_favs(staff_id, report_id) values (m.id, p_id);
  return true;
end $$;

-- ───────── 1) 공통: 볼 수 있는 매출 줄 (내부용, 직접 호출 불가) ─────────
create or replace function public._stats_pay(p_branch text, p_from date, p_to date)
returns setof public.payments language sql stable security definer set search_path = public as $$
  select p.* from public.payments p, public.me() m
  where p.voided_at is null
    and (p_branch is null or p.branch = p_branch)
    and (m.tier = 'owner' or p.branch = m.branch)
    and p.day between p_from and p_to
    and (public.can('sales.others') or p.staff_name = m.name)
$$;
revoke all on function public._stats_pay(text, date, date) from public, anon, authenticated;

create or replace function public._stats_kind(t text)
returns text language sql immutable as $$
  select case when t in ('관리', '노쇼') then '관리' when t in ('회차회원권', '기간회원권') then '회원권'
              when t = '제품판매' then '제품' else '기타' end
$$;

-- 이름 가리기 (customer.view 없으면 김○○)
create or replace function public._stats_name(n text, ok boolean)
returns text language sql immutable as $$
  select case when n is null or n = '' then '(이름 없음)' when ok then n else left(n, 1) || '○○' end
$$;

-- 지점 확인 + 대표관리자가 아니면 자기 지점으로
create or replace function public._stats_branch(p_branch text)
returns text language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts;
begin
  select * into m from public.me();
  if m.id is null or not public.can('stats.view') then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if m.tier = 'owner' then return nullif(p_branch, ''); end if;
  return m.branch;
end $$;
revoke all on function public._stats_branch(text) from public, anon, authenticated;

-- ───────── 2) 리포트 ─────────
-- 돌려주는 모양: { cols:[[key,이름,형식]], rows:[{...}], chart:{x, bars:[key..], names:[..]} , money, note }
-- 형식: text · num(건수) · won(금액) · pct · min(분)
create or replace function public.stats_report(p_id text, p_branch text, p_from date, p_to date, p_opts jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.staff_accounts; br text; v_money boolean; v_cust boolean;
  y int := extract(year from p_to)::int;
  cols jsonb; v_rows jsonb := '[]'::jsonb; chart jsonb := null; note text := null; strip text[];
begin
  select * into m from public.me();
  br := public._stats_branch(p_branch);
  v_money := public.can('sales.others') or public.can('sales.own');
  v_cust := public.can('customer.view');

  if p_id = 'sales_month' then          -- 월 매출: 올해 vs 작년
    cols := '[["label","월","text"],["cur","올해 매출","won"],["prev","작년 매출","won"],["diff","차이","won"]]';
    select jsonb_agg(jsonb_build_object('label', mm || '월', 'cur', coalesce(c.s, 0), 'prev', coalesce(p.s, 0), 'diff', coalesce(c.s, 0) - coalesce(p.s, 0)) order by mm) into v_rows
    from generate_series(1, 12) mm
    left join (select extract(month from day)::int k, sum(amount) s from public._stats_pay(br, make_date(y, 1, 1), make_date(y, 12, 31)) group by 1) c on c.k = mm
    left join (select extract(month from day)::int k, sum(amount) s from public._stats_pay(br, make_date(y - 1, 1, 1), make_date(y - 1, 12, 31)) group by 1) p on p.k = mm;
    chart := jsonb_build_object('x', 'label', 'bars', '["cur","prev"]'::jsonb, 'names', jsonb_build_array(y || '년', (y - 1) || '년'));

  elsif p_id = 'sales_year' then        -- 연간 매출: 최근 3년 구분별
    cols := '[["label","연도","text"],["total","매출","won"],["svc","관리","won"],["mem","회원권","won"],["prod","제품","won"],["etc","기타","won"]]';
    select jsonb_agg(o order by yy) into v_rows from (
      select g.yy, jsonb_build_object('label', g.yy || '년', 'total', coalesce(sum(p.amount), 0),
        'svc', coalesce(sum(p.amount) filter (where public._stats_kind(p.product_type) = '관리'), 0),
        'mem', coalesce(sum(p.amount) filter (where public._stats_kind(p.product_type) = '회원권'), 0),
        'prod', coalesce(sum(p.amount) filter (where public._stats_kind(p.product_type) = '제품'), 0),
        'etc', coalesce(sum(p.amount) filter (where public._stats_kind(p.product_type) = '기타'), 0)) o
      from (select yy from generate_series(y - 2, y) yy) g
      left join lateral (select * from public._stats_pay(br, make_date(g.yy, 1, 1), make_date(g.yy, 12, 31))) p on true
      group by g.yy) z;
    chart := jsonb_build_object('x', 'label', 'bars', '["total"]'::jsonb, 'names', '["매출"]'::jsonb);

  elsif p_id = 'sales_day' then         -- 일간 매출 (기간 안 날짜별)
    cols := '[["label","날짜","text"],["cnt","건수","num"],["total","매출","won"],["svc","관리","won"],["mem","회원권","won"],["prod","제품","won"],["etc","기타","won"]]';
    select jsonb_agg(jsonb_build_object('label', to_char(d, 'MM.DD') || ' (' || (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1] || ')', 'cnt', coalesce(x.cnt, 0), 'total', coalesce(x.total, 0),
      'svc', coalesce(x.svc, 0), 'mem', coalesce(x.mem, 0), 'prod', coalesce(x.prod, 0), 'etc', coalesce(x.etc, 0)) order by d) into v_rows
    from generate_series(p_from, least(p_to, p_from + 92), interval '1 day') d
    left join (select day, count(*) cnt, sum(amount) total,
        sum(amount) filter (where public._stats_kind(product_type) = '관리') svc,
        sum(amount) filter (where public._stats_kind(product_type) = '회원권') mem,
        sum(amount) filter (where public._stats_kind(product_type) = '제품') prod,
        sum(amount) filter (where public._stats_kind(product_type) = '기타') etc
      from public._stats_pay(br, p_from, p_to) group by day) x on x.day = d::date;
    chart := jsonb_build_object('x', 'label', 'bars', '["total"]'::jsonb, 'names', '["매출"]'::jsonb);

  elsif p_id in ('sales_kind', 'sales_method', 'receivable', 'cust_avg') then   -- 월별 (올해)
    if p_id = 'sales_kind' then
      cols := '[["label","월","text"],["total","합계","won"],["svc","관리","won"],["mem","회원권","won"],["prod","제품","won"],["etc","기타","won"]]';
      chart := jsonb_build_object('x', 'label', 'bars', '["total"]'::jsonb, 'names', '["합계"]'::jsonb);
    elsif p_id = 'sales_method' then
      cols := '[["label","월","text"],["card","카드","won"],["cash","현금","won"],["account","계좌","won"],["npay","NPay","won"],["unpaid","미수","won"]]';
      chart := jsonb_build_object('x', 'label', 'bars', '["card","cash"]'::jsonb, 'names', '["카드","현금"]'::jsonb);
    elsif p_id = 'receivable' then
      cols := '[["label","월","text"],["unpaid","미수 발생","won"],["settled","정산","won"],["left","남은 미수","won"]]';
      chart := jsonb_build_object('x', 'label', 'bars', '["unpaid","settled"]'::jsonb, 'names', '["발생","정산"]'::jsonb);
    else
      cols := '[["label","월","text"],["total","매출","won"],["people","결제 고객","num"],["avg","고객 평균","won"]]';
      chart := jsonb_build_object('x', 'label', 'bars', '["avg"]'::jsonb, 'names', '["고객 평균"]'::jsonb);
    end if;
    select jsonb_agg(jsonb_build_object('label', mm || '월',
      'total', coalesce(x.total, 0), 'svc', coalesce(x.svc, 0), 'mem', coalesce(x.mem, 0), 'prod', coalesce(x.prod, 0), 'etc', coalesce(x.etc, 0),
      'card', coalesce(x.card, 0), 'cash', coalesce(x.cash, 0), 'account', coalesce(x.account, 0), 'npay', coalesce(x.npay, 0),
      'unpaid', coalesce(x.unpaid, 0), 'settled', coalesce(x.settled, 0),
      'people', coalesce(x.people, 0), 'avg', case when coalesce(x.people, 0) > 0 then round(x.total::numeric / x.people) else 0 end) order by mm) into v_rows
    from generate_series(1, 12) mm
    left join (select extract(month from day)::int k, sum(amount) total,
        sum(amount) filter (where public._stats_kind(product_type) = '관리') svc,
        sum(amount) filter (where public._stats_kind(product_type) = '회원권') mem,
        sum(amount) filter (where public._stats_kind(product_type) = '제품') prod,
        sum(amount) filter (where public._stats_kind(product_type) = '기타') etc,
        sum(card) card, sum(cash) cash, sum(account) account, sum(npay) npay, sum(unpaid) unpaid, sum(unpaid_settled) settled,
        count(distinct customer_key) people
      from public._stats_pay(br, make_date(y, 1, 1), make_date(y, 12, 31)) group by 1) x on x.k = mm;
    -- 윈도 함수는 jsonb_agg 안에서 못 써서 남은 미수는 다시 계산
    if p_id = 'receivable' then
      select jsonb_agg(e || jsonb_build_object('left', run) order by o) into v_rows
      from (select e, o, sum((e->>'unpaid')::bigint - (e->>'settled')::bigint) over (order by o) run
        from jsonb_array_elements(v_rows) with ordinality t(e, o)) z;
    end if;

  elsif p_id = 'sales_staff' then       -- 담당자별
    cols := '[["label","담당","text"],["cnt","건수","num"],["total","매출","won"],["svc","관리","won"],["mem","회원권","won"],["prod","제품","won"]]';
    select jsonb_agg(jsonb_build_object('label', coalesce(staff_name, '미지정'), 'cnt', cnt, 'total', total, 'svc', svc, 'mem', mem, 'prod', prod) order by total desc) into v_rows
    from (select staff_name, count(*) cnt, coalesce(sum(amount), 0) total,
        coalesce(sum(amount) filter (where public._stats_kind(product_type) = '관리'), 0) svc,
        coalesce(sum(amount) filter (where public._stats_kind(product_type) = '회원권'), 0) mem,
        coalesce(sum(amount) filter (where public._stats_kind(product_type) = '제품'), 0) prod
      from public._stats_pay(br, p_from, p_to) group by staff_name) x;
    chart := jsonb_build_object('x', 'label', 'bars', '["total"]'::jsonb, 'names', '["매출"]'::jsonb);

  elsif p_id = 'sales_service' then     -- 관리별
    cols := '[["label","관리","text"],["cnt","건수","num"],["total","매출","won"],["minutes","시간","min"]]';
    select jsonb_agg(jsonb_build_object('label', coalesce(nullif(product_name, ''), '(이름 없음)'), 'cnt', cnt, 'total', total, 'minutes', minutes) order by total desc) into v_rows
    from (select product_name, count(*) cnt, coalesce(sum(amount), 0) total, coalesce(sum(duration_min), 0) minutes
      from public._stats_pay(br, p_from, p_to) where public._stats_kind(product_type) = '관리' group by product_name) x;
    chart := jsonb_build_object('x', 'label', 'bars', '["cnt"]'::jsonb, 'names', '["건수"]'::jsonb);

  elsif p_id = 'membership_sales' then  -- 회원권 판매 (회원권 등록 수 + 매출)
    cols := '[["label","월","text"],["cnt","새 회원권","num"],["total","회원권 매출","won"]]';
    select jsonb_agg(jsonb_build_object('label', mm || '월', 'cnt', coalesce(a.cnt, 0), 'total', coalesce(b.total, 0)) order by mm) into v_rows
    from generate_series(1, 12) mm
    left join (select extract(month from start_on)::int k, count(*) cnt from public.rsv_memberships
      where start_on between make_date(y, 1, 1) and make_date(y, 12, 31) and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by 1) a on a.k = mm
    left join (select extract(month from day)::int k, sum(amount) total from public._stats_pay(br, make_date(y, 1, 1), make_date(y, 12, 31))
      where public._stats_kind(product_type) = '회원권' group by 1) b on b.k = mm;
    chart := jsonb_build_object('x', 'label', 'bars', '["cnt"]'::jsonb, 'names', '["새 회원권"]'::jsonb);

  elsif p_id = 'cust_new' then          -- 월별 신규 고객 (최근 3년)
    cols := jsonb_build_array(jsonb_build_array('label', '월', 'text'), jsonb_build_array('y2', (y - 2) || '년', 'num'),
      jsonb_build_array('y1', (y - 1) || '년', 'num'), jsonb_build_array('y0', y || '년', 'num'));
    select jsonb_agg(o order by mm) into v_rows from (
      select mm, jsonb_build_object('label', mm || '월', 'y2', count(c.k) filter (where c.yy = y - 2),
        'y1', count(c.k) filter (where c.yy = y - 1), 'y0', count(c.k) filter (where c.yy = y)) o
      from generate_series(1, 12) mm
      left join (select extract(year from registered_on)::int yy, extract(month from registered_on)::int k from public.customers
        where registered_on between make_date(y - 2, 1, 1) and make_date(y, 12, 31) and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch)) c on c.k = mm
      group by mm) z;
    chart := jsonb_build_object('x', 'label', 'bars', '["y0","y1"]'::jsonb, 'names', jsonb_build_array(y || '년', (y - 1) || '년'));

  elsif p_id = 'cust_rank' then         -- 고객 매출 순위
    cols := '[["rank","순위","text"],["label","고객","text"],["cnt","건수","num"],["total","매출","won"]]';
    select jsonb_agg(jsonb_build_object('rank', rn || '위', 'label', public._stats_name(c.name, v_cust), 'cnt', cnt, 'total', total) order by rn) into v_rows
    from (select branch, customer_key, count(*) cnt, sum(amount) total, row_number() over (order by sum(amount) desc) rn
      from public._stats_pay(br, p_from, p_to) where customer_key is not null group by branch, customer_key) x
    left join public.customers c on c.key = x.customer_key and c.branch = x.branch
    where rn <= 20;

  elsif p_id = 'churn' then             -- 이탈 위험: 마지막 방문 기준
    cols := '[["label","마지막 방문","text"],["cnt","고객","num"],["mem","그중 회원권 있음","num"]]';
    select jsonb_agg(jsonb_build_object('label', b.label, 'cnt', x.cnt, 'mem', x.mem) order by b.o) into v_rows
    from (values (1, '1개월 안', 0, 30), (2, '1~2개월', 31, 60), (3, '2~3개월', 61, 90), (4, '3~6개월', 91, 180), (5, '6개월~1년', 181, 365), (6, '1년 넘음', 366, 100000))
      b(o, label, lo, hi)
    cross join lateral (select count(*) cnt, count(*) filter (where c.has_membership) mem from public.customers c
      where c.last_visit_on is not null and (br is null or c.branch = br) and (m.tier = 'owner' or c.branch = m.branch)
        and (now() at time zone 'Asia/Seoul')::date - c.last_visit_on between b.lo and b.hi) x;
    note := '마지막 방문일 기준이에요. 2~3개월 칸이 연락이 필요한 고객이에요.';

  elsif p_id in ('rsv_status', 'noshow_top', 'cancel_top', 'visit_rank', 'hour_visits', 'weekday', 'staff_work') then
    if p_id = 'rsv_status' then
      cols := '[["label","월","text"],["all","예약","num"],["done","완료","num"],["cancel","취소","num"],["noshow","노쇼","num"],["rate","노쇼율","pct"]]';
      select jsonb_agg(jsonb_build_object('label', mm || '월', 'all', coalesce(x.a, 0), 'done', coalesce(x.d, 0), 'cancel', coalesce(x.c, 0), 'noshow', coalesce(x.n, 0),
        'rate', case when coalesce(x.a, 0) > 0 then round(x.n * 100.0 / x.a, 1) else 0 end) order by mm) into v_rows
      from generate_series(1, 12) mm
      left join (select extract(month from day)::int k, count(*) a, count(*) filter (where status = '완료') d,
          count(*) filter (where status = '취소') c, count(*) filter (where status = '노쇼') n
        from public.rsv_reservations where day between make_date(y, 1, 1) and make_date(y, 12, 31) and coalesce(kind, '') <> '일정'
          and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by 1) x on x.k = mm;
      chart := jsonb_build_object('x', 'label', 'bars', '["done","noshow"]'::jsonb, 'names', '["완료","노쇼"]'::jsonb);
    elsif p_id in ('noshow_top', 'cancel_top', 'visit_rank') then
      cols := jsonb_build_array(jsonb_build_array('rank', '순위', 'text'), jsonb_build_array('label', '고객', 'text'),
        jsonb_build_array('cnt', case p_id when 'noshow_top' then '노쇼' when 'cancel_top' then '취소' else '방문' end, 'num'),
        jsonb_build_array('last', '마지막', 'text'));
      select jsonb_agg(jsonb_build_object('rank', rn || '위', 'label', public._stats_name(coalesce(c.name, x.cname), v_cust), 'cnt', cnt, 'last', to_char(lastd, 'YY.MM.DD')) order by rn) into v_rows
      from (select branch, customer_key, max(customer_name) cname, count(*) cnt, max(day) lastd, row_number() over (order by count(*) desc, max(day) desc) rn
        from public.rsv_reservations
        where day between p_from and p_to and customer_key is not null
          and status = case p_id when 'noshow_top' then '노쇼' when 'cancel_top' then '취소' else '완료' end
          and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch)
        group by branch, customer_key) x
      left join public.customers c on c.key = x.customer_key and c.branch = x.branch
      where rn <= 10;
    elsif p_id = 'hour_visits' then
      cols := '[["label","시간","text"],["cnt","방문","num"],["noshow","노쇼","num"]]';
      select jsonb_agg(jsonb_build_object('label', h || '시', 'cnt', coalesce(x.cnt, 0), 'noshow', coalesce(x.n, 0)) order by h) into v_rows
      from generate_series(7, 22) h
      left join (select left(start_time, 2)::int k, count(*) filter (where status in ('완료', '예약')) cnt, count(*) filter (where status = '노쇼') n
        from public.rsv_reservations where day between p_from and p_to and start_time ~ '^\d{2}:' and coalesce(kind, '') <> '일정'
          and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by 1) x on x.k = h;
      chart := jsonb_build_object('x', 'label', 'bars', '["cnt"]'::jsonb, 'names', '["방문"]'::jsonb);
    elsif p_id = 'weekday' then
      cols := '[["label","요일","text"],["cnt","방문","num"],["noshow","노쇼","num"],["cancel","취소","num"]]';
      select jsonb_agg(jsonb_build_object('label', (array['월','화','수','목','금','토','일'])[dw], 'cnt', coalesce(x.cnt, 0), 'noshow', coalesce(x.n, 0), 'cancel', coalesce(x.c, 0)) order by dw) into v_rows
      from generate_series(1, 7) dw
      left join (select extract(isodow from day)::int k, count(*) filter (where status in ('완료', '예약')) cnt,
          count(*) filter (where status = '노쇼') n, count(*) filter (where status = '취소') c
        from public.rsv_reservations where day between p_from and p_to and coalesce(kind, '') <> '일정'
          and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by 1) x on x.k = dw;
      chart := jsonb_build_object('x', 'label', 'bars', '["cnt"]'::jsonb, 'names', '["방문"]'::jsonb);
    else -- staff_work
      cols := '[["label","담당","text"],["all","예약","num"],["done","완료","num"],["noshow","노쇼","num"],["cancel","취소","num"],["hc","해피콜 처리","num"]]';
      select jsonb_agg(jsonb_build_object('label', coalesce(s.name, '미지정'), 'all', a, 'done', d, 'noshow', n, 'cancel', c,
        'hc', (select count(*) from public.work_items w where w.kind = '해피콜' and w.logged_at is not null
                 and (w.logged_at at time zone 'Asia/Seoul')::date between p_from and p_to
                 and (w.actor = s.id::text or w.actor = s.name or w.handler = s.name))) order by a desc) into v_rows
      from (select staff_id, count(*) a, count(*) filter (where status = '완료') d, count(*) filter (where status = '노쇼') n, count(*) filter (where status = '취소') c
        from public.rsv_reservations where day between p_from and p_to and coalesce(kind, '') <> '일정'
          and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by staff_id) x
      left join public.staff_accounts s on s.id::text = x.staff_id;
      chart := jsonb_build_object('x', 'label', 'bars', '["done"]'::jsonb, 'names', '["완료"]'::jsonb);
    end if;

  elsif p_id = 'staff_minutes' then     -- 월별 직원별 관리 시간 (최근 12개월)
    select jsonb_build_array(jsonb_build_array('label', '월', 'text')) || coalesce(jsonb_agg(jsonb_build_array('s' || rn, nm, 'min') order by rn), '[]'::jsonb) into cols
    from (select coalesce(staff_name, '미지정') nm, row_number() over (order by coalesce(staff_name, '미지정')) rn
      from public._stats_pay(br, (date_trunc('month', p_to) - interval '11 months')::date, p_to) where public._stats_kind(product_type) = '관리'
      group by 1) s;
    select jsonb_agg(r order by o) into v_rows from (
      select mo o, jsonb_build_object('label', to_char(mo, 'YY.MM')) || coalesce((
        select jsonb_object_agg('s' || s.rn, coalesce(t.minutes, 0))
        from (select coalesce(staff_name, '미지정') nm, row_number() over (order by coalesce(staff_name, '미지정')) rn
          from public._stats_pay(br, (date_trunc('month', p_to) - interval '11 months')::date, p_to) where public._stats_kind(product_type) = '관리' group by 1) s
        left join (select coalesce(staff_name, '미지정') nm, sum(duration_min) minutes from public._stats_pay(br, mo::date, (mo + interval '1 month - 1 day')::date)
          where public._stats_kind(product_type) = '관리' group by 1) t on t.nm = s.nm), '{}'::jsonb) r
      from generate_series(date_trunc('month', p_to) - interval '11 months', date_trunc('month', p_to), interval '1 month') mo) z;

  elsif p_id = 'happycall' then         -- 해피콜 이행 (올해 월별)
    cols := '[["label","월","text"],["all","대상","num"],["done","처리","num"],["rate","이행률","pct"]]';
    select jsonb_agg(jsonb_build_object('label', mm || '월', 'all', coalesce(x.a, 0), 'done', coalesce(x.d, 0),
      'rate', case when coalesce(x.a, 0) > 0 then round(x.d * 100.0 / x.a, 1) else 0 end) order by mm) into v_rows
    from generate_series(1, 12) mm
    left join (select extract(month from assigned_day)::int k, count(*) a, count(*) filter (where logged_at is not null or done_at is not null) d
      from public.work_items where kind = '해피콜' and assigned_day between make_date(y, 1, 1) and make_date(y, 12, 31)
        and (br is null or branch = br) and (m.tier = 'owner' or branch = m.branch) group by 1) x on x.k = mm;
    chart := jsonb_build_object('x', 'label', 'bars', '["all","done"]'::jsonb, 'names', '["대상","처리"]'::jsonb);

  else
    raise exception 'UNKNOWN_REPORT' using errcode = '22023';
  end if;

  -- 금액 권한이 없으면 금액 칸을 빼요
  if not v_money then
    select array_agg(c->>0) into strip from jsonb_array_elements(cols) c where c->>2 = 'won';
    if strip is not null then
      select coalesce(jsonb_agg(c), '[]'::jsonb) into cols from jsonb_array_elements(cols) c where c->>2 <> 'won';
      select coalesce(jsonb_agg(e - strip order by o), '[]'::jsonb) into v_rows from jsonb_array_elements(coalesce(v_rows, '[]'::jsonb)) with ordinality t(e, o);
      if chart is not null and exists (select 1 from jsonb_array_elements_text(chart->'bars') b where b = any(strip)) then chart := null; end if;
    end if;
  end if;

  return jsonb_build_object('cols', cols, 'rows', coalesce(v_rows, '[]'::jsonb), 'chart', chart, 'money', v_money, 'note', note,
    'branch', coalesce(br, '전체'));
end $$;

-- ───────── 3) 집계: 날짜별 · 담당자별 ─────────
-- p_staff: 담당 이름 목록 ('미지정' = 담당 없음), p_kinds: 구분(payments.product_type) 목록, p_q: 고객 이름·번호
create or replace function public.stats_sum(p_by text, p_branch text, p_from date, p_to date,
  p_staff text[] default null, p_kinds text[] default null, p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare br text; v_money boolean; v_rows jsonb; q text := nullif(trim(coalesce(p_q, '')), ''); qd text;
begin
  br := public._stats_branch(p_branch);
  v_money := public.can('sales.others') or public.can('sales.own');
  qd := regexp_replace(coalesce(q, ''), '\D', '', 'g');
  with base as (
    select p.*, coalesce(p.staff_name, '미지정') sn from public._stats_pay(br, p_from, p_to) p
    left join public.customers c on c.key = p.customer_key and c.branch = p.branch
    where (p_staff is null or coalesce(p.staff_name, '미지정') = any(p_staff))
      and (p_kinds is null or p.product_type = any(p_kinds))
      and (q is null or c.name ilike '%' || q || '%' or (length(qd) >= 4 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || qd || '%'))
  ), g as (
    select case when p_by = 'staff' then sn else to_char(day, 'YYYY-MM-DD') end k,
      count(*) cnt, sum(amount) amount, sum(service_amount) service, sum(card) card, sum(cash) cash, sum(account) account, sum(npay) npay,
      sum(unpaid) unpaid, sum(unpaid_settled) settled, sum(discount) discount, sum(point) point, sum(duration_min) minutes,
      count(*) filter (where public._stats_kind(product_type) = '관리') n_svc,
      count(*) filter (where public._stats_kind(product_type) = '회원권') n_mem,
      count(*) filter (where public._stats_kind(product_type) = '제품') n_prod,
      count(*) filter (where public._stats_kind(product_type) = '기타') n_etc,
      count(*) filter (where product_type = '회차회원권') n_ticket
    from base group by 1
  )
  select coalesce(jsonb_agg(to_jsonb(g) || jsonb_build_object('title', (select s.title from public.staff_accounts s where s.name = g.k and p_by = 'staff' limit 1))
    order by case when p_by = 'staff' then null else g.k end desc, g.amount desc nulls last), '[]'::jsonb) into v_rows from g;
  if not v_money then
    select coalesce(jsonb_agg(e - array['amount','service','card','cash','account','npay','unpaid','settled','discount','point'] order by o), '[]'::jsonb) into v_rows
    from jsonb_array_elements(v_rows) with ordinality t(e, o);
  end if;
  return jsonb_build_object('rows', v_rows, 'money', v_money, 'branch', coalesce(br, '전체'));
end $$;

-- 직원 선택 목록 (지점 직원 + 매출에 이름이 있는 담당자)
create or replace function public.stats_staff_names(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare br text; r jsonb;
begin
  br := public._stats_branch(p_branch);
  select coalesce(jsonb_agg(n order by n), '[]'::jsonb) into r from (
    select name n from public.staff_accounts where status = 'active' and (br is null or branch = br)
    union select distinct staff_name from public.payments where staff_name is not null and staff_name <> '' and (br is null or branch = br)
  ) x;
  return r || '["미지정"]'::jsonb;
end $$;

-- ───────── 4) 인센티브 ─────────
-- 요율은 config_values key='incentive.rates', scope=지점, value={"이름":{"rate":3,"per":10000}}
create or replace function public.stats_incentive(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; br text; rates jsonb; v_rows jsonb; v_all boolean;
begin
  select * into m from public.me();
  br := coalesce(public._stats_branch(p_branch), m.branch);
  v_all := public.can('sales.others');
  if not (v_all or public.can('sales.own')) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  select coalesce(nullif(value, '')::jsonb, '{}'::jsonb) into rates from public.config_values
    where key = 'incentive.rates' and scope = br order by effective_from desc nulls last, changed_at desc limit 1;
  rates := coalesce(rates, '{}'::jsonb);
  with names as (
    select name n, title from public.staff_accounts where status = 'active' and branch = br
    union select distinct staff_name, null from public.payments where branch = br and staff_name is not null and staff_name <> '' and day between p_from and p_to
  ), nn as (select n, max(title) title from names group by n),
  s as (
    select nn.n, nn.title, coalesce(sum(p.amount), 0) sales,
      count(p.dedup_key) filter (where public._stats_kind(p.product_type) = '관리') svc
    from nn left join public._stats_pay(br, p_from, p_to) p on p.staff_name = nn.n
    group by nn.n, nn.title
  )
  select coalesce(jsonb_agg(jsonb_build_object('staff', n, 'title', title, 'sales', sales,
      'rate', coalesce((rates->n->>'rate')::numeric, 0), 'inc', round(sales * coalesce((rates->n->>'rate')::numeric, 0) / 100),
      'svc', svc, 'per', coalesce((rates->n->>'per')::int, 0), 'allow', svc * coalesce((rates->n->>'per')::int, 0),
      'total', round(sales * coalesce((rates->n->>'rate')::numeric, 0) / 100) + svc * coalesce((rates->n->>'per')::int, 0)) order by sales desc, n), '[]'::jsonb)
    into v_rows from s where v_all or n = m.name;
  return jsonb_build_object('rows', v_rows, 'branch', br, 'can_edit', m.tier = 'owner' or public.can('payroll.manage'), 'rates', case when v_all then rates else null end);
end $$;

create or replace function public.stats_incentive_save(p_branch text, p_rates jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into m from public.me();
  if m.id is null or not (m.tier = 'owner' or public.can('payroll.manage')) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if p_branch not in ('의정부점', '양주점') or not public.branch_ok(p_branch) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if jsonb_typeof(p_rates) <> 'object' then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  delete from public.config_values where key = 'incentive.rates' and scope = p_branch and effective_from = v_today;
  insert into public.config_values(key, scope, value, effective_from, changed_by, changed_at, note)
    values ('incentive.rates', p_branch, p_rates::text, v_today, m.name, now(), '통계 > 집계 > 인센티브');
end $$;

-- ───────── 5) 잔여 회원권 ─────────
create or replace function public.stats_remain(p_branch text, p_manager text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts; br text; v_money boolean; v_cust boolean; v_today date := (now() at time zone 'Asia/Seoul')::date; r jsonb;
begin
  select * into m from public.me();
  br := public._stats_branch(p_branch);
  v_money := public.can('sales.others') or public.can('sales.own');
  v_cust := public.can('customer.view');
  with ms as (
    select x.*, c.name cname, c.manager,
      (select coalesce(sum(greatest(i.total + i.service - i.used, 0)), 0) from public.rsv_membership_items i where i.membership_id = x.id) lft,
      (select coalesce(sum(greatest(i.total + i.service - i.used, 0) * coalesce(nullif(i.unit_price, 0), 0)), 0) from public.rsv_membership_items i where i.membership_id = x.id) lamt,
      (select max(nullif(i.unit_price, 0)) from public.rsv_membership_items i where i.membership_id = x.id) unit
    from public.rsv_memberships x
    left join public.customers c on c.key = x.customer_key and c.branch = x.branch
    where x.status = '사용중' and (br is null or x.branch = br) and (m.tier = 'owner' or x.branch = m.branch)
      and (p_manager is null or p_manager = '' or coalesce(nullif(c.manager, ''), '미지정') = p_manager)
  ), ms2 as (
    select *, case when kind = '회차' then lft * 1 else null end left_cnt,
      greatest(coalesce(nullif(amount_left, 0), lamt), 0) left_amt,
      case when (kind = '회차' and lft <= 2) or (end_on is not null and end_on <= v_today + 14) then '임박' else '사용 중' end st
    from ms
  )
  select jsonb_build_object(
    'kpi', jsonb_build_object('customers', (select count(distinct customer_key) from ms2), 'left', (select coalesce(sum(left_cnt), 0) from ms2),
      'amount', case when v_money then (select coalesce(sum(left_amt), 0) from ms2) end, 'soon', (select count(*) from ms2 where st = '임박')),
    'products', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'holders', holders, 'left', lc, 'unit', case when v_money then unit end,
        'amount', case when v_money then amt end) order by holders desc, name)
      from (select coalesce(nullif(name, ''), '(이름 없음)') name, count(distinct customer_key) holders, sum(left_cnt) lc, max(unit) unit, sum(left_amt) amt from ms2 group by 1) p), '[]'::jsonb),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('name', public._stats_name(cname, v_cust), 'manager', coalesce(nullif(manager, ''), '미지정'),
        'membership', name, 'kind', kind, 'left', left_cnt, 'end_on', end_on, 'status', st,
        'amount', case when v_money then left_amt end) order by (st = '임박') desc, end_on nulls last, left_cnt nulls last)
      from (select * from ms2 order by (st = '임박') desc, end_on nulls last limit 500) z), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(distinct coalesce(nullif(manager, ''), '미지정')) from ms), '[]'::jsonb),
    'money', v_money, 'branch', coalesce(br, '전체')) into r;
  return r;
end $$;

-- ───────── 6) 실행 권한 ─────────
revoke all on function public.stats_fav_list() from public, anon;
revoke all on function public.stats_fav_toggle(text) from public, anon;
revoke all on function public.stats_report(text, text, date, date, jsonb) from public, anon;
revoke all on function public.stats_sum(text, text, date, date, text[], text[], text) from public, anon;
revoke all on function public.stats_staff_names(text) from public, anon;
revoke all on function public.stats_incentive(text, date, date) from public, anon;
revoke all on function public.stats_incentive_save(text, jsonb) from public, anon;
revoke all on function public.stats_remain(text, text) from public, anon;
revoke all on function public._stats_kind(text) from public, anon;
revoke all on function public._stats_name(text, boolean) from public, anon;
grant execute on function public.stats_fav_list() to authenticated, service_role;
grant execute on function public.stats_fav_toggle(text) to authenticated, service_role;
grant execute on function public.stats_report(text, text, date, date, jsonb) to authenticated, service_role;
grant execute on function public.stats_sum(text, text, date, date, text[], text[], text) to authenticated, service_role;
grant execute on function public.stats_staff_names(text) to authenticated, service_role;
grant execute on function public.stats_incentive(text, date, date) to authenticated, service_role;
grant execute on function public.stats_incentive_save(text, jsonb) to authenticated, service_role;
grant execute on function public.stats_remain(text, text) to authenticated, service_role;
grant execute on function public._stats_kind(text) to authenticated, service_role;
grant execute on function public._stats_name(text, boolean) to authenticated, service_role;
grant execute on function public._stats_pay(text, date, date) to service_role;
grant execute on function public._stats_branch(text) to service_role;

commit;
