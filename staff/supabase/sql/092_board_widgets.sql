-- 092 현황보드 위젯 (뷰티사랑넷 현황보드 위젯 항목 + 유효고객 · 매출/예약 추이 그래프)
-- 읽기 전용 함수 1개(board_widget)와 내부 도우미 1개만 추가해요. 테이블 변경 없음.
-- 실행: Supabase SQL 편집기에서 이 파일 전체를 한 번 실행.
--
-- 위젯 키 (p_key) 와 옵션 (p_opt)
--   예약  rsv_status(today|tomorrow|week|month)  rsv_trend(day|week|month)  rsv_list(0|1|2|3 = 오늘·내일·모레·3일후)
--   매출  sales_status(today|week|month|lastmonth)  sales_trend(day|week|month)  sales_quarter  sales_method(month|lastmonth)
--         sales_staff(month|lastmonth)  rank_service(month|lastmonth)  rank_goods(month|lastmonth)  rank_customer(month|lastmonth)
--   고객  cust_status  cust_visit(yesterday|today|week|month)  cust_absent  noshow_rank(month|3m|all)
--   회원권 mem_info  mem_expiring(week|month)
-- 매출 위젯은 sales.others 권한이 없으면 {"locked":true} 를 돌려줘요(화면에서 숨김).
-- 고객 이름은 customer.view 권한이 없으면 김○○ 로 가려요.
-- 유효고객 = 최근 90일 안에 방문했거나, 사용 중인 회원권(남은 회차 > 0 또는 기간 안)이 있는 고객.

create or replace function public._board_range(p text, t date)
returns daterange language sql immutable as $$
  select case p
    when 'yesterday' then daterange(t - 1, t, '[)')
    when 'tomorrow'  then daterange(t + 1, t + 2, '[)')
    when 'week'      then daterange(date_trunc('week', t)::date, date_trunc('week', t)::date + 7, '[)')
    when 'month'     then daterange(date_trunc('month', t)::date, (date_trunc('month', t) + interval '1 month')::date, '[)')
    when 'lastmonth' then daterange((date_trunc('month', t) - interval '1 month')::date, date_trunc('month', t)::date, '[)')
    when '3m'        then daterange(t - 90, t + 1, '[)')
    when 'all'       then daterange('2000-01-01', t + 1, '[)')
    else daterange(t, t + 1, '[)') end
$$;
revoke all on function public._board_range(text, date) from public, anon;

create or replace function public.board_widget(p_key text, p_branch text, p_opt text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  m public.staff_accounts;
  t date := (now() at time zone 'Asia/Seoul')::date;
  r daterange; a date; b date;
  v_sales boolean; v_cust boolean; v_all boolean;
  out jsonb;
begin
  select * into m from public.me();
  if m.id is null or not public.branch_ok(p_branch) then raise exception '이 지점을 볼 수 없어요.'; end if;
  v_sales := public.can('sales.others');
  v_cust := public.can('customer.view');
  v_all := public.can('schedule.view_others');
  r := public._board_range(coalesce(p_opt, ''), t); a := lower(r); b := upper(r);

  if p_key like 'sales_%' or p_key like 'rank_%' then
    if not v_sales then return jsonb_build_object('locked', true); end if;
  end if;

  -- ───────── 예약 ─────────
  if p_key = 'rsv_status' then
    select jsonb_build_object(
      'rsv',    count(*) filter (where x.status in ('예약', '완료')),
      'cancel', count(*) filter (where x.status = '취소'),
      'noshow', count(*) filter (where x.status = '노쇼'),
      'new',    count(*) filter (where x.status in ('예약', '완료') and (x.visit = '신규' or c.registered_on >= x.day)),
      'done',   count(*) filter (where x.status = '완료'))
    into out
    from public.rsv_reservations x left join public.customers c on c.key = x.customer_key
    where x.branch = p_branch and x.day >= a and x.day < b and x.customer_key is not null
      and (v_all or x.staff_id = m.id::text);
    return out;

  elsif p_key = 'rsv_trend' then
    -- 일: 최근 14일, 주: 최근 12주, 월: 최근 12개월
    return coalesce((select jsonb_agg(jsonb_build_object('x', g.lbl, 'rsv', g.rsv, 'done', g.done, 'cancel', g.cnl) order by g.s) from (
      select s.s, s.lbl,
        (select count(*) from public.rsv_reservations x where x.branch = p_branch and x.customer_key is not null
           and x.day >= s.s and x.day < s.e and x.status in ('예약', '완료') and (v_all or x.staff_id = m.id::text)) rsv,
        (select count(*) from public.rsv_reservations x where x.branch = p_branch and x.customer_key is not null
           and x.day >= s.s and x.day < s.e and x.status = '완료' and (v_all or x.staff_id = m.id::text)) done,
        (select count(*) from public.rsv_reservations x where x.branch = p_branch and x.customer_key is not null
           and x.day >= s.s and x.day < s.e and x.status in ('취소', '노쇼') and (v_all or x.staff_id = m.id::text)) cnl
      from (
        select g.d0::date s, g.d0::date + 1 e, to_char(g.d0, 'MM.DD') lbl from generate_series(t - 13, t, interval '1 day') g(d0)
          where coalesce(p_opt, 'day') = 'day'
        union all
        select g.w0::date, g.w0::date + 7, to_char(g.w0, 'MM.DD') || '주'
          from generate_series(date_trunc('week', t)::date - 77, date_trunc('week', t)::date, interval '7 day') g(w0) where p_opt = 'week'
        union all
        select g.m0::date, (g.m0 + interval '1 month')::date, to_char(g.m0, 'YY.MM')
          from generate_series(date_trunc('month', t)::date - interval '11 month', date_trunc('month', t)::date, interval '1 month') g(m0) where p_opt = 'month'
      ) s) g), '[]'::jsonb);

  elsif p_key = 'rsv_list' then
    a := t + least(greatest(coalesce(nullif(p_opt, '')::int, 0), 0), 3);
    return coalesce((select jsonb_agg(jsonb_build_object('staff', z.staff, 'rows', z.rows) order by z.staff) from (
      select coalesce(s.name, '담당 미정') staff,
        jsonb_agg(jsonb_build_object('id', x.id, 'time', x.start_time, 'minutes', x.minutes,
          'customer', public._stats_name(coalesce(nullif(x.customer_name, ''), c.name), v_cust),
          'program', coalesce(p.short, p.name, x.title, ''), 'status', x.status) order by x.start_time) rows
      from public.rsv_reservations x
      left join public.customers c on c.key = x.customer_key
      left join public.staff_accounts s on s.id::text = x.staff_id
      left join public.rsv_programs p on p.id = x.program_id
      where x.branch = p_branch and x.day = a and x.customer_key is not null and x.status in ('예약', '완료')
        and (v_all or x.staff_id = m.id::text)
      group by s.name) z), '[]'::jsonb);

  -- ───────── 매출 ─────────
  elsif p_key = 'sales_status' then
    select jsonb_build_object(
      'care',   count(*) filter (where public._stats_kind(p.product_type) = '관리'),
      'mem',    count(*) filter (where public._stats_kind(p.product_type) = '회원권'),
      'goods',  count(*) filter (where public._stats_kind(p.product_type) = '제품'),
      'etc',    count(*) filter (where public._stats_kind(p.product_type) = '기타'),
      'cash',   coalesce(sum(case when p.is_refund then -coalesce(p.cash, 0) else coalesce(p.cash, 0) end), 0),
      'card',   coalesce(sum(case when p.is_refund then -coalesce(p.card, 0) else coalesce(p.card, 0) end), 0),
      'account',coalesce(sum(case when p.is_refund then -coalesce(p.account, 0) else coalesce(p.account, 0) end), 0),
      'npay',   coalesce(sum(case when p.is_refund then -coalesce(p.npay, 0) else coalesce(p.npay, 0) end), 0),
      'total',  coalesce(sum(case when p.is_refund then -p.amount else p.amount end), 0))
    into out
    from public.payments p where p.branch = p_branch and p.voided_at is null and p.day >= a and p.day < b;
    return out;

  elsif p_key = 'sales_trend' then
    return coalesce((select jsonb_agg(jsonb_build_object('x', s.lbl,
        'amount', coalesce((select sum(case when p.is_refund then -p.amount else p.amount end) from public.payments p
                    where p.branch = p_branch and p.voided_at is null and p.day >= s.s and p.day < s.e), 0)) order by s.s)
      from (
        select g.d0::date s, g.d0::date + 1 e, to_char(g.d0, 'MM.DD') lbl from generate_series(t - 13, t, interval '1 day') g(d0)
          where coalesce(p_opt, 'day') = 'day'
        union all
        select g.w0::date, g.w0::date + 7, to_char(g.w0, 'MM.DD') || '주'
          from generate_series(date_trunc('week', t)::date - 77, date_trunc('week', t)::date, interval '7 day') g(w0) where p_opt = 'week'
        union all
        select g.m0::date, (g.m0 + interval '1 month')::date, to_char(g.m0, 'YY.MM')
          from generate_series(date_trunc('month', t)::date - interval '11 month', date_trunc('month', t)::date, interval '1 month') g(m0) where p_opt = 'month'
      ) s), '[]'::jsonb);

  elsif p_key = 'sales_quarter' then
    return coalesce((select jsonb_agg(jsonb_build_object('year', y.y, 'q', (
        select jsonb_agg(coalesce((select sum(case when p.is_refund then -p.amount else p.amount end) from public.payments p
          where p.branch = p_branch and p.voided_at is null and extract(year from p.day) = y.y and extract(quarter from p.day) = q.q), 0) order by q.q)
        from generate_series(1, 4) q(q))) order by y.y)
      from generate_series(extract(year from t)::int - 2, extract(year from t)::int) y(y)), '[]'::jsonb);

  elsif p_key = 'sales_method' then
    if coalesce(p_opt, '') not in ('month', 'lastmonth') then r := public._board_range('month', t); a := lower(r); b := upper(r); end if;
    select jsonb_build_array(
      jsonb_build_object('l', '카드', 'v', coalesce(sum(case when p.is_refund then -coalesce(p.card, 0) else coalesce(p.card, 0) end), 0)),
      jsonb_build_object('l', '현금', 'v', coalesce(sum(case when p.is_refund then -coalesce(p.cash, 0) else coalesce(p.cash, 0) end), 0)),
      jsonb_build_object('l', '계좌이체', 'v', coalesce(sum(case when p.is_refund then -coalesce(p.account, 0) else coalesce(p.account, 0) end), 0)),
      jsonb_build_object('l', 'NPay', 'v', coalesce(sum(case when p.is_refund then -coalesce(p.npay, 0) else coalesce(p.npay, 0) end), 0)),
      jsonb_build_object('l', '회원권 차감', 'v', coalesce(sum(case when p.method like '%회원권%' then p.service_amount else 0 end), 0)))
    into out from public.payments p where p.branch = p_branch and p.voided_at is null and p.day >= a and p.day < b;
    return out;

  elsif p_key in ('sales_staff', 'rank_service', 'rank_goods', 'rank_customer') then
    if coalesce(p_opt, '') not in ('month', 'lastmonth') then r := public._board_range('month', t); a := lower(r); b := upper(r); end if;
    return coalesce((select jsonb_agg(jsonb_build_object('l', z.l, 'v', z.v, 'n', z.n) order by z.v desc) from (
      select case p_key when 'sales_staff' then coalesce(nullif(p.staff_name, ''), '담당 미정')
                        when 'rank_customer' then public._stats_name(coalesce(c.name, p.customer_key), v_cust)
                        else coalesce(nullif(p.product_name, ''), '(이름 없음)') end l,
        sum(case when p.is_refund then -p.amount else p.amount end) v, count(*) n
      from public.payments p left join public.customers c on c.key = p.customer_key
      where p.branch = p_branch and p.voided_at is null and p.day >= a and p.day < b
        and (p_key in ('sales_staff') or (p_key = 'rank_customer' and p.customer_key is not null)
             or (p_key = 'rank_service' and public._stats_kind(p.product_type) = '관리')
             or (p_key = 'rank_goods' and public._stats_kind(p.product_type) = '제품'))
      group by 1 order by 2 desc limit 10) z), '[]'::jsonb);

  -- ───────── 고객 ─────────
  elsif p_key = 'cust_status' then
    select jsonb_build_object(
      'total', count(*),
      'valid', count(*) filter (where c.last_visit_on >= t - 90 or exists (
          select 1 from public.rsv_memberships x where x.customer_key = c.key and x.status = '사용중'
            and (x.end_on is null or x.end_on >= t))),
      'new_this', count(*) filter (where c.registered_on >= date_trunc('month', t)::date and c.last_visit_on >= c.registered_on),
      'new_last', count(*) filter (where c.registered_on >= (date_trunc('month', t) - interval '1 month')::date
          and c.registered_on < date_trunc('month', t)::date and c.last_visit_on >= c.registered_on),
      'with_mem', count(*) filter (where c.has_membership))
    into out from public.customers c where c.branch = p_branch and c.deleted_at is null;
    return out;

  elsif p_key = 'cust_visit' then
    with v as (
      select x.customer_key k, x.day from public.rsv_reservations x
        where x.branch = p_branch and x.status = '완료' and x.day >= a and x.day < b and x.customer_key is not null
      union
      select cv.customer_key, cv.day from public.customer_visits cv
        where cv.branch = p_branch and cv.day >= a and cv.day < b)
    select jsonb_build_object(
      'new', (select count(distinct v.k) from v join public.customers c on c.key = v.k where c.registered_on >= v.day),
      'cancel', (select count(*) from public.rsv_reservations x where x.branch = p_branch and x.status = '취소' and x.day >= a and x.day < b and x.customer_key is not null),
      'noshow', (select count(*) from public.rsv_reservations x where x.branch = p_branch and x.status = '노쇼' and x.day >= a and x.day < b and x.customer_key is not null),
      'visit', (select count(*) from v))
    into out;
    return out;

  elsif p_key = 'cust_absent' then
    select jsonb_build_object(
      'd15', count(*) filter (where c.last_visit_on <= t - 15),
      'd30', count(*) filter (where c.last_visit_on <= t - 30),
      'd45', count(*) filter (where c.last_visit_on <= t - 45),
      'd60', count(*) filter (where c.last_visit_on <= t - 60))
    into out from public.customers c where c.branch = p_branch and c.deleted_at is null;
    return out;

  elsif p_key = 'noshow_rank' then
    if coalesce(p_opt, '') not in ('month', '3m', 'all') then r := public._board_range('3m', t); a := lower(r); b := upper(r); end if;
    return coalesce((select jsonb_agg(jsonb_build_object('key', case when v_cust then z.k end, 'l', z.l, 'noshow', z.ns, 'cancel', z.cn) order by z.ns + z.cn desc) from (
      select x.customer_key k, public._stats_name(coalesce(c.name, max(x.customer_name)), v_cust) l,
        count(*) filter (where x.status = '노쇼') ns, count(*) filter (where x.status = '취소') cn
      from public.rsv_reservations x left join public.customers c on c.key = x.customer_key
      where x.branch = p_branch and x.status in ('노쇼', '취소') and x.day >= a and x.day < b and x.customer_key is not null
      group by x.customer_key, c.name order by count(*) desc limit 10) z), '[]'::jsonb);

  -- ───────── 회원권 ─────────
  elsif p_key = 'mem_info' then
    select jsonb_build_object(
      'cnt_customers', (select count(distinct x.customer_key) from public.rsv_memberships x
          where x.branch = p_branch and x.status = '사용중' and x.kind = '회차' and (x.end_on is null or x.end_on >= t)
            and exists (select 1 from public.rsv_membership_items i where i.membership_id = x.id and i.total + coalesce(i.service, 0) - i.used > 0)),
      'cnt_left', coalesce((select sum(greatest(i.total + coalesce(i.service, 0) - i.used, 0)) from public.rsv_memberships x
          join public.rsv_membership_items i on i.membership_id = x.id
          where x.branch = p_branch and x.status = '사용중' and x.kind = '회차' and (x.end_on is null or x.end_on >= t)), 0),
      'period_customers', (select count(distinct x.customer_key) from public.rsv_memberships x
          where x.branch = p_branch and x.status = '사용중' and x.kind = '기간' and x.end_on >= t),
      'amount_left', coalesce((select sum(coalesce(x.amount_left, 0)) from public.rsv_memberships x
          where x.branch = p_branch and x.status = '사용중' and (x.end_on is null or x.end_on >= t)), 0))
    into out;
    return out;

  elsif p_key = 'mem_expiring' then
    b := t + case when p_opt = 'month' then 30 else 7 end;
    return coalesce((select jsonb_agg(z order by z.end_on) from (
      select x.customer_key key, public._stats_name(c.name, v_cust) customer, x.name, x.kind, x.end_on,
        (select sum(greatest(i.total + coalesce(i.service, 0) - i.used, 0)) from public.rsv_membership_items i where i.membership_id = x.id) left_n,
        x.amount_left
      from public.rsv_memberships x left join public.customers c on c.key = x.customer_key
      where x.branch = p_branch and x.status = '사용중' and x.end_on between t and b
      order by x.end_on limit 30) z), '[]'::jsonb);
  end if;

  raise exception '모르는 위젯이에요: %', p_key;
end $$;

revoke all on function public.board_widget(text, text, text) from public, anon;
grant execute on function public.board_widget(text, text, text) to authenticated;
