-- 030 membership_menu_v1 (DRAFT, 2026-11-20) : 직원앱 '회원권' 메뉴 (보유 회원권 · 상품)
-- 읽기 전용 security definer RPC 2개. 표 변경 없음.

-- 1) 보유 회원권: 고객 데이터라 customer.view + 지점 검사
create or replace function public.membership_holdings(p_branch text, p_filter text default 'active')
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with ok as (select public.can('customer.view') and public.branch_ok(p_branch) as v),
  ms as (
    select m.*, c.name cname, c.manager,
      (select coalesce(sum(greatest(i.total - i.used, 0) + coalesce(i.service,0)),0) from rsv_membership_items i where i.membership_id = m.id) remain_cnt,
      (select coalesce(sum(i.total),0) from rsv_membership_items i where i.membership_id = m.id) total_cnt,
      (select coalesce(sum(i.used),0) from rsv_membership_items i where i.membership_id = m.id) used_cnt
    from rsv_memberships m
    left join customers c on c.key = m.customer_key and c.branch = m.branch
    where m.branch = p_branch and (select v from ok)
  ),
  ms2 as (
    select *,
      case when status = '끝남' or (end_on is not null and end_on < current_date) or (kind = '회차' and total_cnt > 0 and remain_cnt <= 0) then 'expired'
           when (end_on is not null and end_on <= current_date + 7) or (kind = '회차' and remain_cnt between 1 and 2) then 'soon'
           else 'active' end st,
      -- 남은 금액: 단가가 없으면 판매가 ÷ 전체 회차로 계산
      case when kind = '회차' and total_cnt > 0 then round(coalesce(nullif(price,0), paid, 0)::numeric * greatest(total_cnt - used_cnt,0) / total_cnt)
           else coalesce(amount_left,0) end remain_amt
    from ms
  ),
  f as (select * from ms2 where p_filter = 'all' or (p_filter = 'active' and st <> 'expired') or st = p_filter)
  select case when not (select v from ok) then null else jsonb_build_object(
    'kpi', (select jsonb_build_object(
        'customers', count(distinct customer_key) filter (where st <> 'expired'),
        'remain_cnt', coalesce(sum(remain_cnt) filter (where st <> 'expired'),0),
        'remain_amt', coalesce(sum(remain_amt) filter (where st <> 'expired'),0),
        'soon', count(*) filter (where st = 'soon')) from ms2),
    'by_product', coalesce((select jsonb_agg(x order by x->>'name') from (
        select jsonb_build_object('name', name, 'kind', kind, 'n', count(*), 'remain_cnt', sum(remain_cnt), 'remain_amt', sum(remain_amt)) x
        from f group by name, kind) s), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'customer_key', customer_key, 'customer', cname, 'manager', manager, 'name', name, 'kind', kind,
        'sold_on', sold_at::date, 'end_on', end_on, 'total', total_cnt, 'used', used_cnt, 'remain', remain_cnt,
        'remain_amt', remain_amt, 'unpaid', coalesce(unpaid,0), 'st', st)
        order by (st = 'soon') desc, end_on nulls last) from (select * from f limit 500) l), '[]'::jsonb)
  ) end
$$;

-- 2) 상품: 고객 데이터 아님. 로그인한 직원이면 자기 지점 + 공용('') 상품 보기
create or replace function public.membership_products(p_branch text, p_kind text default null)
returns table(id text, branch text, name text, kind text, valid_days integer, price integer, face_amount integer,
              share_ok boolean, swap_ok boolean, app_visible boolean, on_sale boolean, items jsonb, sort integer, sold bigint)
language sql stable security definer set search_path to 'public' as $$
  select p.id, p.branch, p.name, p.kind, p.valid_days, p.price, p.face_amount, p.share_ok, p.swap_ok, p.app_visible, p.on_sale,
         (select coalesce(jsonb_agg(jsonb_build_object('program', coalesce(g.name, it->>'program_id'), 'count', (it->>'count')::int)), '[]'::jsonb)
            from jsonb_array_elements(coalesce(p.items,'[]'::jsonb)) it left join rsv_programs g on g.id = it->>'program_id'),
         p.sort,
         (select count(*) from rsv_memberships m where m.product_id = p.id and m.branch = p_branch)
  from rsv_products p
  where public.branch_ok(p_branch)
    and (p.branch = p_branch or p.branch = '')
    and (p_kind is null or p.kind = p_kind)
  order by p.on_sale desc, p.sort nulls last, p.name
$$;

revoke all on function public.membership_holdings(text,text) from public, anon;
revoke all on function public.membership_products(text,text) from public, anon;
grant execute on function public.membership_holdings(text,text) to authenticated, service_role;
grant execute on function public.membership_products(text,text) to authenticated, service_role;
