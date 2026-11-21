-- 042 제품 (판매 · 매입 · 재고 · 미지급금 · 거래처 · 제품 항목) : SQL 편집기에서 한 번에 실행하세요.
-- 뷰티사랑넷 '제품' 메뉴 구조를 MERA 직원앱 매출 > 제품 안에 넣어요.
-- 권한: 모두 sales.product (대표관리자 전용 스위치, 대표관리자가 켜 준 직원만). 판매·매입 취소 = 대표관리자만.
-- 먼저 040_결제_회원권차감_판매.sql 이 실행돼 있어야 해요. 판매 돈 기록은 040 의 pay_checkout 으로 해요
-- (payments 에 '제품판매' 줄이 생겨 매출 전체·제품 원장에도 보여요). 여기서는 제품 줄과 재고만 따로 남겨요.
-- 판매 권한 = schedule.pay 또는 sales.product (pay_checkout 은 schedule.pay 필요).
-- 표는 새로 만들기만 하고 기존 표는 바꾸지 않아요.

begin;

-- 1) 표 ------------------------------------------------------------------
create table if not exists public.goods_vendors (
  id uuid primary key default gen_random_uuid(),
  branch text not null default '',            -- '' = 전 지점
  name text not null,
  phone text not null default '',
  manager text not null default '',
  memo text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.goods (
  id uuid primary key default gen_random_uuid(),
  branch text not null default '',            -- '' = 전 지점 공통 상품
  category text not null default '기타',
  name text not null,
  price int not null default 0,               -- 판매가
  cost int not null default 0,                -- 매입가
  vendor_id uuid references public.goods_vendors(id) on delete set null,
  safe_qty int not null default 0,            -- 이 수량 이하이면 '부족'
  on_sale boolean not null default true,
  sort int not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.goods_sales (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('의정부점','양주점')),
  customer_key text,
  day date not null,
  sold_at timestamptz not null default now(),
  staff_name text not null default '',
  lines jsonb not null default '[]'::jsonb,   -- [{goods_id, name, qty, price}]
  subtotal int not null default 0,
  vat int not null default 0,
  total int not null default 0,               -- subtotal + vat
  card int not null default 0, cash int not null default 0, account int not null default 0,
  unpaid int not null default 0, discount int not null default 0,
  memo text not null default '',
  payment_key text,                            -- rsv_checkouts.id (040)
  created_by text not null default '',
  created_at timestamptz not null default now(),
  voided_at timestamptz, voided_by text, void_reason text
);
create index if not exists goods_sales_bd on public.goods_sales(branch, day);

create table if not exists public.goods_purchases (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('의정부점','양주점')),
  vendor_id uuid references public.goods_vendors(id) on delete set null,
  day date not null,
  lines jsonb not null default '[]'::jsonb,   -- [{goods_id, name, qty, cost}]
  total int not null default 0,
  paid int not null default 0,                -- 매입할 때 바로 준 돈 (나머지 = 미지급금)
  method text not null default '',
  memo text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  voided_at timestamptz, voided_by text
);
create index if not exists goods_purchases_bd on public.goods_purchases(branch, day);

create table if not exists public.goods_vendor_pays (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('의정부점','양주점')),
  vendor_id uuid not null references public.goods_vendors(id) on delete cascade,
  day date not null,
  amount int not null,
  method text not null default '',
  memo text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  voided_at timestamptz
);

create table if not exists public.goods_moves (
  id uuid primary key default gen_random_uuid(),
  branch text not null check (branch in ('의정부점','양주점')),
  goods_id uuid not null references public.goods(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('판매','매입','조정','판매취소','매입취소')),
  qty int not null,                            -- 들어오면 +, 나가면 -
  ref_id uuid,
  memo text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists goods_moves_bg on public.goods_moves(branch, goods_id);

do $$ declare t text; begin
  foreach t in array array['goods_vendors','goods','goods_sales','goods_purchases','goods_vendor_pays','goods_moves'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- 2) 공통 ----------------------------------------------------------------
create or replace function public.goods_guard(p_branch text)
returns public.staff_accounts language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts;
begin
  select * into m from public.me();
  if m.id is null or not public.can('sales.product') then raise exception '제품 메뉴 권한이 없어요.' using errcode = '42501'; end if;
  if p_branch is not null and not public.branch_ok(p_branch) then raise exception '이 지점 권한이 없어요.' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function public.goods_kday() returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 3) 제품 항목 · 재고 ------------------------------------------------------
-- 지점별 현재 재고까지 같이
create or replace function public.goods_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts;
begin
  -- 판매 창에서도 쓰므로 결제 권한(schedule.pay)만 있어도 볼 수 있어요
  select * into m from public.me();
  if m.id is null or not (public.can('sales.product') or public.can('schedule.pay')) then raise exception '제품 메뉴 권한이 없어요.' using errcode = '42501'; end if;
  if p_branch is null or not public.branch_ok(p_branch) then raise exception '지점을 골라 주세요.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'branch', g.branch, 'category', g.category, 'name', g.name, 'price', g.price,
      'cost', g.cost, 'vendor_id', g.vendor_id, 'vendor', v.name, 'safe_qty', g.safe_qty, 'on_sale', g.on_sale, 'sort', g.sort,
      'stock', coalesce((select sum(mv.qty) from public.goods_moves mv where mv.goods_id = g.id and mv.branch = p_branch), 0),
      'last_in', (select max(mv.day) from public.goods_moves mv where mv.goods_id = g.id and mv.branch = p_branch and mv.kind = '매입'))
      order by g.category, g.sort, g.name)
    from public.goods g left join public.goods_vendors v on v.id = g.vendor_id
    where g.branch in ('', coalesce(p_branch, ''))), '[]'::jsonb);
end $$;

create or replace function public.goods_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(null); v_id uuid := nullif(p->>'id', '')::uuid; v_branch text := coalesce(p->>'branch', '');
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception '제품 이름을 적어 주세요.'; end if;
  if v_branch = '' and m.tier <> 'owner' then v_branch := m.branch; end if;
  if v_branch <> '' and not public.branch_ok(v_branch) then raise exception '이 지점 권한이 없어요.'; end if;
  if v_id is null then
    insert into public.goods(branch, category, name, price, cost, vendor_id, safe_qty, on_sale, sort, updated_by)
    values (v_branch, coalesce(nullif(trim(p->>'category'), ''), '기타'), trim(p->>'name'), greatest(coalesce((p->>'price')::int, 0), 0),
      greatest(coalesce((p->>'cost')::int, 0), 0), nullif(p->>'vendor_id', '')::uuid, greatest(coalesce((p->>'safe_qty')::int, 0), 0),
      coalesce((p->>'on_sale')::boolean, true), coalesce((p->>'sort')::int, 0), m.name)
    returning id into v_id;
  else
    if not exists (select 1 from public.goods g where g.id = v_id and (g.branch = '' and m.tier = 'owner' or g.branch <> '' and public.branch_ok(g.branch))) then
      raise exception '이 제품을 고칠 권한이 없어요.'; end if;
    update public.goods set category = coalesce(nullif(trim(p->>'category'), ''), '기타'), name = trim(p->>'name'),
      price = greatest(coalesce((p->>'price')::int, 0), 0), cost = greatest(coalesce((p->>'cost')::int, 0), 0),
      vendor_id = nullif(p->>'vendor_id', '')::uuid, safe_qty = greatest(coalesce((p->>'safe_qty')::int, 0), 0),
      on_sale = coalesce((p->>'on_sale')::boolean, true), sort = coalesce((p->>'sort')::int, 0), updated_by = m.name, updated_at = now()
    where id = v_id;
  end if;
  return v_id;
end $$;

-- 재고 실사: 지금 실제 수량을 넣으면 차이만큼 '조정' 기록
create or replace function public.goods_stock_set(p_branch text, p_goods uuid, p_qty int, p_memo text default '')
returns int language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch); v_now int;
begin
  if p_branch is null then raise exception '지점을 골라 주세요.'; end if;
  select coalesce(sum(qty), 0) into v_now from public.goods_moves where branch = p_branch and goods_id = p_goods;
  if p_qty - v_now <> 0 then
    insert into public.goods_moves(branch, goods_id, day, kind, qty, memo, created_by)
    values (p_branch, p_goods, public.goods_kday(), '조정', p_qty - v_now, coalesce(p_memo, ''), m.name);
  end if;
  return p_qty - v_now;
end $$;

create or replace function public.goods_moves_list(p_branch text, p_goods uuid, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch);
begin
  return coalesce((select jsonb_agg(x order by x.created_at desc) from (
    select mv.day, mv.kind, mv.qty, mv.memo, mv.created_by, mv.created_at from public.goods_moves mv
    where mv.branch = p_branch and mv.goods_id = p_goods order by mv.created_at desc limit p_limit) x), '[]'::jsonb);
end $$;

-- 4) 거래처 --------------------------------------------------------------
create or replace function public.goods_vendor_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'branch', v.branch, 'name', v.name, 'phone', v.phone, 'manager', v.manager,
      'memo', v.memo, 'active', v.active, 'goods', (select count(*) from public.goods g where g.vendor_id = v.id and g.on_sale)) order by v.active desc, v.name)
    from public.goods_vendors v where v.branch in ('', coalesce(p_branch, ''))), '[]'::jsonb);
end $$;

create or replace function public.goods_vendor_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(null); v_id uuid := nullif(p->>'id', '')::uuid; v_branch text := coalesce(p->>'branch', '');
begin
  if coalesce(trim(p->>'name'), '') = '' then raise exception '거래처 이름을 적어 주세요.'; end if;
  if v_branch = '' and m.tier <> 'owner' then v_branch := m.branch; end if;
  if v_id is null then
    insert into public.goods_vendors(branch, name, phone, manager, memo, active, updated_by)
    values (v_branch, trim(p->>'name'), coalesce(p->>'phone', ''), coalesce(p->>'manager', ''), coalesce(p->>'memo', ''), coalesce((p->>'active')::boolean, true), m.name)
    returning id into v_id;
  else
    update public.goods_vendors set name = trim(p->>'name'), phone = coalesce(p->>'phone', ''), manager = coalesce(p->>'manager', ''),
      memo = coalesce(p->>'memo', ''), active = coalesce((p->>'active')::boolean, true), updated_by = m.name
    where id = v_id and (branch = '' and m.tier = 'owner' or branch <> '' and public.branch_ok(branch));
    if not found then raise exception '이 거래처를 고칠 권한이 없어요.'; end if;
  end if;
  return v_id;
end $$;

-- 5) 판매 ----------------------------------------------------------------
-- 돈 기록은 메인 스레드 결제 RPC pay_checkout(040) 로 해요 (payments 에 직접 안 씀). 여기서는 제품 줄·재고만 남겨요.
-- p = { customer_key, staff_name, lines:[{goods_id, qty, price}], vat:bool, discount, pay:{card, cash, account, local}, memo }
-- 덜 받은 금액은 pay_checkout 이 자동으로 미수로 남겨요.
create or replace function public.goods_sale_create(p_branch text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.staff_accounts; v_id uuid := gen_random_uuid(); v_ck uuid; ck public.rsv_checkouts; v_day date := public.goods_kday();
  l jsonb; g public.goods; v_lines jsonb := '[]'::jsonb; v_sub int := 0; v_vat int := 0; v_total int; v_names text := ''; v_staff text;
begin
  select * into m from public.me();
  if m.id is null or not (public.can('schedule.pay') or public.can('sales.product')) then raise exception '제품 판매 권한이 없어요.' using errcode = '42501'; end if;
  if p_branch is null or not public.branch_ok(p_branch) then raise exception '이 지점 권한이 없어요.' using errcode = '42501'; end if;
  if nullif(p->>'customer_key', '') is null then raise exception '고객을 골라 주세요.'; end if;
  for l in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    if coalesce((l->>'qty')::int, 0) <= 0 then continue; end if;
    select * into g from public.goods where id = (l->>'goods_id')::uuid and branch in ('', p_branch) and on_sale;
    if not found then raise exception '판매 중인 제품을 찾지 못했어요.'; end if;
    v_lines := v_lines || jsonb_build_object('goods_id', g.id, 'name', g.name, 'category', g.category, 'qty', (l->>'qty')::int,
      'price', greatest(coalesce((l->>'price')::int, g.price), 0));
    v_sub := v_sub + (l->>'qty')::int * greatest(coalesce((l->>'price')::int, g.price), 0);
    v_names := v_names || case when v_names = '' then '' else ', ' end || g.name || ' ' || (l->>'qty') || '개';
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception '제품을 골라 주세요.'; end if;
  if coalesce((p->>'vat')::boolean, false) then v_vat := round(v_sub * 0.1); end if;
  v_total := v_sub + v_vat;

  v_ck := public.pay_checkout(p_branch, p->>'customer_key', null, jsonb_build_object(
    'product', jsonb_build_object('name', v_names || case when v_vat > 0 then ' (부가세 포함)' else '' end, 'amount', v_total),
    'discount', greatest(coalesce((p->>'discount')::int, 0), 0),
    'pay', coalesce(p->'pay', '{}'::jsonb), 'memo', coalesce(p->>'memo', '')));
  select * into ck from public.rsv_checkouts where id = v_ck;

  -- 매출 담당: 고른 직원으로 (pay_checkout 은 예약 없으면 입력한 사람으로 적어요)
  v_staff := coalesce(nullif(p->>'staff_name', ''), m.name);
  if v_staff <> m.name then update public.payments set staff_name = v_staff where dedup_key = any(ck.payment_keys); end if;

  insert into public.goods_sales(id, branch, customer_key, day, sold_at, staff_name, lines, subtotal, vat, total, card, cash, account, unpaid, discount, memo, payment_key, created_by)
  values (v_id, p_branch, p->>'customer_key', ck.day, now(), v_staff, v_lines, v_sub, v_vat, v_total,
    coalesce((ck.pay->>'card')::int, 0), coalesce((ck.pay->>'cash')::int, 0), coalesce((ck.pay->>'account')::int, 0) + coalesce((ck.pay->>'local')::int, 0),
    ck.unpaid, ck.discount, coalesce(p->>'memo', ''), v_ck::text, m.name);

  insert into public.goods_moves(branch, goods_id, day, kind, qty, ref_id, created_by)
  select p_branch, (x->>'goods_id')::uuid, ck.day, '판매', -(x->>'qty')::int, v_id, m.name from jsonb_array_elements(v_lines) x;
  return v_id;
end $$;

create or replace function public.goods_sale_list(p_branch text, p_from date, p_to date, p_q text default null, p_staff text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch); r jsonb;
begin
  with b as (
    select s.*, c.name cname from public.goods_sales s
    left join public.customers c on c.branch = s.branch and c.key = s.customer_key
    where (m.tier = 'owner' or s.branch = m.branch) and (p_branch is null or s.branch = p_branch)
      and s.day between p_from and p_to and (p_staff is null or s.staff_name = p_staff)
      and (p_q is null or p_q = '' or c.name ilike '%' || p_q || '%' or s.lines::text ilike '%' || p_q || '%'
        or (length(regexp_replace(p_q, '\D', '', 'g')) >= 4 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g'))))
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'branch', branch, 'day', day, 'sold_at', sold_at, 'customer_key', customer_key,
        'customer_name', cname, 'staff_name', staff_name, 'lines', lines, 'subtotal', subtotal, 'vat', vat, 'total', total, 'card', card, 'cash', cash,
        'account', account, 'unpaid', unpaid, 'discount', discount, 'memo', memo, 'voided', voided_at is not null, 'void_reason', void_reason)
        order by sold_at desc) from (select * from b order by sold_at desc limit 300) x), '[]'::jsonb),
    'sum', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0), 'card', coalesce(sum(card), 0), 'cash', coalesce(sum(cash), 0),
        'account', coalesce(sum(account), 0), 'unpaid', coalesce(sum(unpaid), 0), 'discount', coalesce(sum(discount), 0),
        'qty', coalesce((select sum((l->>'qty')::int) from b b2, jsonb_array_elements(b2.lines) l where b2.voided_at is null), 0))
      from b where voided_at is null)) into r;
  return r;
end $$;

create or replace function public.goods_sale_void(p_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; s public.goods_sales;
begin
  select * into m from public.me();
  if m.id is null or m.tier <> 'owner' then raise exception '판매 취소는 대표관리자만 할 수 있어요.' using errcode = '42501'; end if;
  select * into s from public.goods_sales where id = p_id for update;
  if not found or s.voided_at is not null then raise exception '이미 취소했거나 없는 판매예요.'; end if;
  perform public.pay_cancel(s.payment_key::uuid, coalesce(nullif(p_reason, ''), '제품 판매 취소'));  -- 매출 무효 (040)
  update public.goods_sales set voided_at = now(), voided_by = m.name, void_reason = coalesce(p_reason, '') where id = p_id;
  insert into public.goods_moves(branch, goods_id, day, kind, qty, ref_id, memo, created_by)
  select s.branch, (x->>'goods_id')::uuid, public.goods_kday(), '판매취소', (x->>'qty')::int, s.id, coalesce(p_reason, ''), m.name from jsonb_array_elements(s.lines) x;
end $$;

-- 6) 매입 · 미지급금 -------------------------------------------------------
-- p = { vendor_id, day, lines:[{goods_id, qty, cost}], paid, method, memo }
create or replace function public.goods_purchase_create(p_branch text, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch); v_id uuid := gen_random_uuid(); v_day date := coalesce(nullif(p->>'day', '')::date, public.goods_kday());
  l jsonb; g public.goods; v_lines jsonb := '[]'::jsonb; v_total int := 0; v_paid int;
begin
  if p_branch is null then raise exception '지점을 골라 주세요.'; end if;
  for l in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    if coalesce((l->>'qty')::int, 0) <= 0 then continue; end if;
    select * into g from public.goods where id = (l->>'goods_id')::uuid and branch in ('', p_branch);
    if not found then raise exception '제품을 찾지 못했어요.'; end if;
    v_lines := v_lines || jsonb_build_object('goods_id', g.id, 'name', g.name, 'qty', (l->>'qty')::int, 'cost', greatest(coalesce((l->>'cost')::int, g.cost), 0));
    v_total := v_total + (l->>'qty')::int * greatest(coalesce((l->>'cost')::int, g.cost), 0);
  end loop;
  if jsonb_array_length(v_lines) = 0 then raise exception '매입할 제품과 수량을 넣어 주세요.'; end if;
  v_paid := least(greatest(coalesce((p->>'paid')::int, 0), 0), v_total);
  if v_paid < v_total and nullif(p->>'vendor_id', '') is null then raise exception '미지급금이 남으면 거래처를 골라 주세요.'; end if;
  insert into public.goods_purchases(id, branch, vendor_id, day, lines, total, paid, method, memo, created_by)
  values (v_id, p_branch, nullif(p->>'vendor_id', '')::uuid, v_day, v_lines, v_total, v_paid, coalesce(p->>'method', ''), coalesce(p->>'memo', ''), m.name);
  insert into public.goods_moves(branch, goods_id, day, kind, qty, ref_id, created_by)
  select p_branch, (x->>'goods_id')::uuid, v_day, '매입', (x->>'qty')::int, v_id, m.name from jsonb_array_elements(v_lines) x;
  return v_id;
end $$;

create or replace function public.goods_purchase_list(p_branch text, p_from date, p_to date, p_vendor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch); r jsonb;
begin
  with b as (
    select pu.*, v.name vname from public.goods_purchases pu left join public.goods_vendors v on v.id = pu.vendor_id
    where (m.tier = 'owner' or pu.branch = m.branch) and (p_branch is null or pu.branch = p_branch)
      and pu.day between p_from and p_to and (p_vendor is null or pu.vendor_id = p_vendor))
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'branch', branch, 'day', day, 'vendor_id', vendor_id, 'vendor', vname, 'lines', lines,
      'total', total, 'paid', paid, 'method', method, 'memo', memo, 'created_by', created_by, 'voided', voided_at is not null) order by day desc, created_at desc) from b), '[]'::jsonb),
    'sum', (select jsonb_build_object('count', count(*), 'total', coalesce(sum(total), 0), 'paid', coalesce(sum(paid), 0)) from b where voided_at is null)) into r;
  return r;
end $$;

create or replace function public.goods_purchase_void(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; pu public.goods_purchases;
begin
  select * into m from public.me();
  if m.id is null or m.tier <> 'owner' then raise exception '매입 취소는 대표관리자만 할 수 있어요.' using errcode = '42501'; end if;
  select * into pu from public.goods_purchases where id = p_id for update;
  if not found or pu.voided_at is not null then raise exception '이미 취소했거나 없는 매입이에요.'; end if;
  update public.goods_purchases set voided_at = now(), voided_by = m.name where id = p_id;
  insert into public.goods_moves(branch, goods_id, day, kind, qty, ref_id, created_by)
  select pu.branch, (x->>'goods_id')::uuid, public.goods_kday(), '매입취소', -(x->>'qty')::int, pu.id, m.name from jsonb_array_elements(pu.lines) x;
end $$;

-- 거래처별 미지급금 = 매입 합계 - 매입 때 준 돈 - 나중에 준 돈
create or replace function public.goods_payable_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch);
begin
  if p_branch is null then raise exception '지점을 골라 주세요.'; end if;
  return coalesce((select jsonb_agg(x order by x.due desc, x.name) from (
    select v.id, v.name, v.phone,
      coalesce((select sum(total) from public.goods_purchases pu where pu.vendor_id = v.id and pu.branch = p_branch and pu.voided_at is null), 0) bought,
      coalesce((select sum(paid) from public.goods_purchases pu where pu.vendor_id = v.id and pu.branch = p_branch and pu.voided_at is null), 0)
      + coalesce((select sum(amount) from public.goods_vendor_pays vp where vp.vendor_id = v.id and vp.branch = p_branch and vp.voided_at is null), 0) paid,
      coalesce((select sum(total - paid) from public.goods_purchases pu where pu.vendor_id = v.id and pu.branch = p_branch and pu.voided_at is null), 0)
      - coalesce((select sum(amount) from public.goods_vendor_pays vp where vp.vendor_id = v.id and vp.branch = p_branch and vp.voided_at is null), 0) due,
      (select max(day) from public.goods_vendor_pays vp where vp.vendor_id = v.id and vp.branch = p_branch and vp.voided_at is null) last_pay,
      coalesce((select jsonb_agg(jsonb_build_object('day', day, 'amount', amount, 'method', method, 'memo', memo) order by day desc)
        from (select * from public.goods_vendor_pays vp where vp.vendor_id = v.id and vp.branch = p_branch and vp.voided_at is null order by day desc limit 10) h), '[]'::jsonb) pays
    from public.goods_vendors v where v.branch in ('', p_branch)) x
    where x.bought > 0 or x.paid > 0), '[]'::jsonb);
end $$;

create or replace function public.goods_vendor_pay(p_branch text, p_vendor uuid, p_amount int, p_method text default '', p_memo text default '', p_day date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts := public.goods_guard(p_branch); v_id uuid;
begin
  if p_branch is null then raise exception '지점을 골라 주세요.'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception '지급 금액을 넣어 주세요.'; end if;
  insert into public.goods_vendor_pays(branch, vendor_id, day, amount, method, memo, created_by)
  values (p_branch, p_vendor, coalesce(p_day, public.goods_kday()), p_amount, coalesce(p_method, ''), coalesce(p_memo, ''), m.name) returning id into v_id;
  return v_id;
end $$;

-- 7) 실행 권한 ------------------------------------------------------------
do $$ declare f text; begin
  foreach f in array array[
    'goods_guard(text)', 'goods_list(text)', 'goods_save(jsonb)', 'goods_stock_set(text,uuid,integer,text)', 'goods_moves_list(text,uuid,integer)',
    'goods_vendor_list(text)', 'goods_vendor_save(jsonb)', 'goods_sale_create(text,jsonb)', 'goods_sale_list(text,date,date,text,text)',
    'goods_sale_void(uuid,text)', 'goods_purchase_create(text,jsonb)', 'goods_purchase_list(text,date,date,uuid)', 'goods_purchase_void(uuid)',
    'goods_payable_list(text)', 'goods_vendor_pay(text,uuid,integer,text,text,date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

commit;
