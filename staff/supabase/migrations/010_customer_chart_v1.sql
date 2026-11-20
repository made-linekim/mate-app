-- 고객 차트 RPC 초안 (customer_chart_v1) · 2026-11-18 · 고객 차트 스레드
-- 표·정책 변경 없음. security definer 함수 2개 + execute grant만 추가.
-- 권한: customer.view(+지점) 필수 / 연락처 전체 customer.phone_full / 결제·금액 sales.by_customer
--       건강 customer.health / 메모 쓰기 customer.edit 또는 common.work_memo

create or replace function public.customer_chart(p_branch text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.customers;
  v_pay boolean := public.can('sales.by_customer');
  v_health boolean := public.can('customer.health');
begin
  if not public.can('customer.view') or not public.branch_ok(p_branch) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into c from public.customers where key = p_key and branch = p_branch;
  if not found then return null; end if;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'key', c.key, 'branch', c.branch, 'customer_no', c.customer_no, 'name', c.name,
      'phone', case when public.can('customer.phone_full') then c.phone
               else regexp_replace(coalesce(c.phone,''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end,
      'manager', c.manager, 'registered_on', c.registered_on, 'last_visit_on', c.last_visit_on,
      'source', c.source, 'source_detail', c.source_detail, 'ad_consent', c.ad_consent, 'tags', c.tags,
      'referrer', (select r.name from public.customers r where r.key = c.referrer_key and r.branch = c.branch),
      'first_payment', case when v_pay then c.first_payment end, 'first_payment_on', c.first_payment_on),

    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'kind', m.kind, 'status', m.status, 'start_on', m.start_on,
        'end_on', case when m.end_on >= '2099-01-01' then null else m.end_on end,
        'amount_total', case when v_pay then m.amount_total end, 'amount_left', case when v_pay then m.amount_left end,
        'price', case when v_pay then m.price end, 'paid', case when v_pay then m.paid end,
        'unpaid', case when v_pay then m.unpaid end, 'sold_by', m.sold_by, 'sold_at', m.sold_at, 'memo', m.memo,
        'shared', m.customer_key <> c.key,
        'items', coalesce((select jsonb_agg(jsonb_build_object('program', coalesce(p.name, i.program_id),
                   'total', i.total, 'used', i.used, 'service', i.service) order by p.sort nulls last)
                 from public.rsv_membership_items i left join public.rsv_programs p on p.id = i.program_id
                 where i.membership_id = m.id), '[]'::jsonb))
        order by (m.status = '사용중') desc, m.start_on desc)
      from public.rsv_memberships m
      where m.branch = c.branch and (m.customer_key = c.key
        or m.id in (select s.membership_id from public.rsv_membership_shares s where s.customer_key = c.key))
    ), '[]'::jsonb),

    'visits', coalesce((
      select jsonb_agg(x order by x->>'day' desc, x->>'time' desc) from (
        select jsonb_build_object('day', r.day, 'time', r.start_time, 'status', r.status,
          'program', coalesce(p.name, r.title), 'minutes', r.minutes,
          'staff', coalesce(sa.name, nullif(r.staff_id,'')), 'memo', nullif(r.memo,''),
          'cancel_reason', nullif(r.cancel_reason,''), 'src', 'rsv') x
        from public.rsv_reservations r
        left join public.rsv_programs p on p.id = r.program_id
        left join public.staff_accounts sa on sa.id::text = r.staff_id
        where r.branch = c.branch and r.customer_key = c.key
        union all
        select jsonb_build_object('day', v.day, 'time', null, 'status', '방문', 'program', null,
          'staff', null, 'memo', null, 'src', 'import')
        from public.customer_visits v
        where v.branch = c.branch and v.customer_key = c.key
          and not exists (select 1 from public.rsv_reservations r2 where r2.branch = c.branch
                          and r2.customer_key = c.key and r2.day = v.day)
        limit 300) q
    ), '[]'::jsonb),
    'counts', (select jsonb_build_object(
        'done', count(*) filter (where status = '완료'), 'noshow', count(*) filter (where status = '노쇼'),
        'cancel', count(*) filter (where status = '취소'))
      from public.rsv_reservations where branch = c.branch and customer_key = c.key),
    'next', (select jsonb_build_object('day', r.day, 'time', r.start_time, 'program', coalesce(p.name, r.title))
      from public.rsv_reservations r left join public.rsv_programs p on p.id = r.program_id
      where r.branch = c.branch and r.customer_key = c.key and r.status = '예약'
        and (r.day > current_date or (r.day = current_date and r.start_time >= to_char(now() at time zone 'Asia/Seoul','HH24:MI')))
      order by r.day, r.start_time limit 1),

    'memos', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'body', body, 'author', author, 'at', created_at) order by created_at desc)
      from (select * from public.rsv_memos where branch = c.branch and scope = '고객' and ref = c.key
            order by created_at desc limit 200) mm
    ), '[]'::jsonb),

    'payments', case when v_pay then coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'amount', amount, 'method', method, 'product', product_name,
        'type', product_type, 'reg', reg_type, 'refund', is_refund, 'unpaid', unpaid, 'by', entered_by, 'memo', memo)
        order by day desc, paid_at desc)
      from (select * from public.payments where branch = c.branch
              and (customer_key = c.key or (customer_key is null and customer_no = c.customer_no))
            order by day desc limit 300) pp), '[]'::jsonb) end,
    'pay_sum', case when v_pay then (
      select jsonb_build_object(
        'total', coalesce(sum(case when is_refund then -abs(amount) else amount end), 0),
        'last_day', max(day) filter (where not is_refund),
        'unpaid', coalesce((select sum(unpaid) from public.rsv_memberships where branch = c.branch and customer_key = c.key and status = '사용중'), 0))
      from public.payments where branch = c.branch
        and (customer_key = c.key or (customer_key is null and customer_no = c.customer_no))) end,

    'health', case when v_health then (
      select jsonb_build_object('note', note, 'flags', flags, 'by', updated_by, 'at', updated_at)
      from public.customer_health_notes h where h.customer_key = c.key and (h.branch = c.branch or h.branch is null)) end,

    'perms', jsonb_build_object('pay', v_pay, 'health', v_health,
      'memo', public.can('customer.edit') or public.can('common.work_memo'),
      'sms', public.can('common.sms_send'), 'reserve', public.can('schedule.reserve'))
  );
end $$;

create or replace function public.customer_memo_add(p_branch text, p_key text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.rsv_memos;
begin
  if not (public.can('customer.edit') or public.can('common.work_memo')) or not public.branch_ok(p_branch) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.customers where key = p_key and branch = p_branch) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p_body,''))) not between 1 and 2000 then
    raise exception 'BAD_BODY' using errcode = '22023';
  end if;
  insert into public.rsv_memos (branch, scope, ref, body, author)
  values (p_branch, '고객', p_key, trim(p_body), coalesce((select name from public.me()), ''))
  returning * into v;
  return jsonb_build_object('id', v.id, 'body', v.body, 'author', v.author, 'at', v.created_at);
end $$;

revoke all on function public.customer_chart(text, text) from public, anon;
revoke all on function public.customer_memo_add(text, text, text) from public, anon;
grant execute on function public.customer_chart(text, text) to authenticated;
grant execute on function public.customer_memo_add(text, text, text) to authenticated;
