-- 매출 원장 화면용 DB 변경 초안 v1 (2026-11-18) · 아직 적용 안 함
-- 적용은 공통 백엔드 스레드에서. payments/expenses/expense_categories 는 현재 0행이라 컬럼 추가 부담 없음.
-- 매출 엑셀(18열) 형식: 날짜,고객명,담당자,구분,내용,메모,시간,관리금액,결제금액,카드,현금,계좌,NPay,미수발생,미수정산,할인,포인트,회차회원권
--   → payments 한 행 = 엑셀 한 행. 구분 = product_type, 내용 = product_name, 결제금액 = amount, 미수발생 = unpaid.

-- 1) payments: 18열을 담을 컬럼 추가 ------------------------------------------
alter table public.payments
  add column if not exists staff_name     text,             -- 담당자
  add column if not exists duration_min   integer,          -- 시간(분)
  add column if not exists service_amount integer,          -- 관리금액
  add column if not exists card           integer default 0,
  add column if not exists cash           integer default 0,
  add column if not exists account        integer default 0, -- 계좌
  add column if not exists npay           integer default 0,
  add column if not exists unpaid_settled integer default 0, -- 미수정산
  add column if not exists discount       integer default 0,
  add column if not exists point          integer default 0,
  add column if not exists sessions       text,             -- 회차회원권 차감 내용 ("석션 1회 ...")
  add column if not exists voided_at      timestamptz,
  add column if not exists voided_by      text;
-- product_type 값: 관리 · 노쇼 · 회차회원권 · 기간회원권 · 제품판매 · 미수금 정산 · 기타수입
create index if not exists payments_staff_idx on public.payments (branch, staff_name, day);

-- 2) 매출 목록 (탭 공용) ----------------------------------------------------
-- p_tab: all | customer | membership | service | product | other | receivable
-- 권한: all = sales.own 또는 sales.others / customer = sales.by_customer / membership = sales.membership
--       service = sales.service / product = sales.product / other = sales.other / receivable = sales.receivable
-- sales.others 가 없으면 본인(staff_name = me().name) 매출만. 지점: 대표관리자 외에는 본인 지점만.
create or replace function public.sales_list(
  p_tab text, p_from date, p_to date,
  p_branch text default null, p_staff text default null, p_q text default null,
  p_customer_key text default null, p_kinds text[] default null,
  p_limit int default 100, p_offset int default 0)
returns table(
  dedup_key text, branch text, paid_at timestamptz, day date, customer_key text, customer_name text,
  staff_name text, kind text, content text, memo text, duration_min int, service_amount int,
  amount int, card int, cash int, account int, npay int, unpaid int, unpaid_settled int,
  discount int, point int, sessions text, is_refund boolean,
  total bigint, sum_amount bigint, sum_card bigint, sum_cash bigint, sum_account bigint, sum_npay bigint,
  sum_unpaid bigint, sum_settled bigint, sum_discount bigint, sum_point bigint, sum_minutes bigint)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me()),
  perm as (
    select (case p_tab
      when 'all' then public.can('sales.own') or public.can('sales.others')
      when 'customer' then public.can('sales.by_customer')
      when 'membership' then public.can('sales.membership')
      when 'service' then public.can('sales.service')
      when 'product' then public.can('sales.product')
      when 'other' then public.can('sales.other')
      when 'receivable' then public.can('sales.receivable')
      else false end) as ok,
      public.can('sales.others') as others),
  base as (
    select p.*, c.name as cname
    from public.payments p
    left join public.customers c on c.key = p.customer_key and c.branch = p.branch
    cross join m cross join perm
    where perm.ok and p.voided_at is null
      and (m.tier = 'owner' or p.branch = m.branch)
      and (p_branch is null or p.branch = p_branch)
      and p.day between p_from and p_to
      and (perm.others or p.staff_name = m.name)
      and (p_staff is null or p.staff_name = p_staff)
      and (p_customer_key is null or p.customer_key = p_customer_key)
      and (p_tab <> 'customer' or p_customer_key is not null)
      and (p_q is null or p_q = '' or c.name ilike '%' || p_q || '%'
           or (length(regexp_replace(p_q, '\D', '', 'g')) >= 4
               and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g')))
      and (case p_tab
        when 'membership' then p.product_type in ('회차회원권', '기간회원권')
        when 'service' then p.product_type in ('관리', '노쇼')
        when 'product' then p.product_type = '제품판매'
        when 'other' then p.product_type = '기타수입'
        when 'receivable' then coalesce(p.unpaid, 0) <> 0 or coalesce(p.unpaid_settled, 0) <> 0
        else true end)
      and (p_kinds is null or p.product_type = any(p_kinds))
  )
  select b.dedup_key, b.branch, b.paid_at, b.day, b.customer_key, coalesce(b.cname, '(미등록 고객)'),
    b.staff_name, b.product_type, b.product_name, b.memo, b.duration_min, b.service_amount,
    b.amount, b.card, b.cash, b.account, b.npay, b.unpaid, b.unpaid_settled, b.discount, b.point, b.sessions, b.is_refund,
    count(*) over (), sum(b.amount) over (), sum(b.card) over (), sum(b.cash) over (), sum(b.account) over (),
    sum(b.npay) over (), sum(b.unpaid) over (), sum(b.unpaid_settled) over (), sum(b.discount) over (),
    sum(b.point) over (), sum(b.duration_min) over ()
  from base b
  order by coalesce(b.paid_at, b.day::timestamptz) desc, b.dedup_key
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0)
$$;

-- 3) 미수금 잔액 (고객별) -----------------------------------------------------
create or replace function public.receivable_list(p_q text default null, p_branch text default null)
returns table(branch text, customer_key text, customer_name text, phone text, issued bigint, settled bigint, balance bigint, last_day date)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me())
  select p.branch, p.customer_key, coalesce(max(c.name), '(미등록 고객)'),
    case when public.can('customer.phone_full') then max(c.phone)
         else regexp_replace(coalesce(max(c.phone), ''), '^(\d{3})-?(\d{3,4})-?(\d{4})$', '\1-****-\3') end,
    sum(coalesce(p.unpaid, 0)), sum(coalesce(p.unpaid_settled, 0)),
    sum(coalesce(p.unpaid, 0)) - sum(coalesce(p.unpaid_settled, 0)), max(p.day)
  from public.payments p
  left join public.customers c on c.key = p.customer_key and c.branch = p.branch
  cross join m
  where public.can('sales.receivable') and p.voided_at is null
    and (m.tier = 'owner' or p.branch = m.branch)
    and (p_branch is null or p.branch = p_branch)
    and (p_q is null or p_q = '' or c.name ilike '%' || p_q || '%'
         or (length(regexp_replace(p_q, '\D', '', 'g')) >= 4
             and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_q, '\D', '', 'g')))
  group by p.branch, p.customer_key
  having sum(coalesce(p.unpaid, 0)) - sum(coalesce(p.unpaid_settled, 0)) <> 0
  order by 7 desc
$$;

-- 4) 경비 지출 --------------------------------------------------------------
create or replace function public.expense_list(p_from date, p_to date, p_branch text default null)
returns table(id uuid, branch text, day date, category_id text, category_name text, amount int, method text,
              memo text, created_by text, created_at timestamptz, total bigint, sum_amount bigint)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me())
  select e.id, e.branch, e.day, e.category_id, coalesce(k.name, '-'), e.amount, e.method, e.memo, e.created_by, e.created_at,
    count(*) over (), sum(e.amount) over ()
  from public.expenses e
  left join public.expense_categories k on k.id = e.category_id
  cross join m
  where public.can('sales.expense') and not coalesce(e.hidden, false)
    and (m.tier = 'owner' or e.branch = m.branch)
    and (p_branch is null or e.branch = p_branch)
    and e.day between p_from and p_to
  order by e.day desc, e.created_at desc
$$;

create or replace function public.expense_add(p_branch text, p_day date, p_category_id text, p_amount int, p_method text, p_memo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.can('sales.expense') or not public.branch_ok(p_branch) then
    raise exception '경비 지출 권한이 없어요' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception '금액을 확인해 주세요'; end if;
  if p_method not in ('카드', '현금', '계좌') then raise exception '결제수단을 확인해 주세요'; end if;
  insert into public.expenses (id, branch, day, category_id, amount, method, memo, hidden, created_by, created_at)
  values (gen_random_uuid(), p_branch, p_day, p_category_id, p_amount, p_method, nullif(trim(p_memo), ''), false,
          (select name from public.me()), now())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.expense_void(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.expenses e set hidden = true
  where e.id = p_id and public.can('sales.expense') and public.branch_ok(e.branch);
  if not found then raise exception '지울 수 없는 항목이에요' using errcode = '42501'; end if;
end $$;

-- 5) 수입지출 계정 (경비 분류) ------------------------------------------------
create or replace function public.expense_category_list()
returns setof public.expense_categories
language sql stable security definer set search_path = public as $$
  select * from public.expense_categories
  where public.can('sales.expense') or public.can('sales.accounts')
  order by sort, name
$$;

create or replace function public.expense_category_save(p_id text, p_name text, p_kind text default 'expense', p_sort int default 0, p_hidden boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v_id text := coalesce(nullif(p_id, ''), 'c_' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.can('sales.accounts') then raise exception '수입지출 계정 권한이 없어요' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '이름을 입력해 주세요'; end if;
  insert into public.expense_categories (id, name, kind, sort, hidden, is_system, created_by, created_at)
  values (v_id, trim(p_name), coalesce(p_kind, 'expense'), coalesce(p_sort, 0), coalesce(p_hidden, false), false,
          (select name from public.me()), now())
  on conflict (id) do update
    set name = case when public.expense_categories.is_system then public.expense_categories.name else excluded.name end,
        sort = excluded.sort, hidden = excluded.hidden;
  return v_id;
end $$;

-- 6) 실행 권한 --------------------------------------------------------------
revoke all on function public.sales_list(text, date, date, text, text, text, text, text[], int, int) from public, anon;
revoke all on function public.receivable_list(text, text) from public, anon;
revoke all on function public.expense_list(date, date, text) from public, anon;
revoke all on function public.expense_add(text, date, text, int, text, text) from public, anon;
revoke all on function public.expense_void(uuid) from public, anon;
revoke all on function public.expense_category_list() from public, anon;
revoke all on function public.expense_category_save(text, text, text, int, boolean) from public, anon;
grant execute on function public.sales_list(text, date, date, text, text, text, text, text[], int, int) to authenticated;
grant execute on function public.receivable_list(text, text) to authenticated;
grant execute on function public.expense_list(date, date, text) to authenticated;
grant execute on function public.expense_add(text, date, text, int, text, text) to authenticated;
grant execute on function public.expense_void(uuid) to authenticated;
grant execute on function public.expense_category_list() to authenticated;
grant execute on function public.expense_category_save(text, text, text, int, boolean) to authenticated;
-- 표(payments, expenses, expense_categories)는 authenticated 에 직접 권한을 주지 않음. RPC 로만 접근.
