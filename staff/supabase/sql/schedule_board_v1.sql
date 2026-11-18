-- 예약표(스케줄) v1 · 2026-11-18 · 초안 (공통 백엔드 스레드에서 적용)
-- 1) 프로그램별 동시간 정원  2) 예약표 조회/등록/수정/상태 RPC (security definer)
-- 권한: 보기 = schedule.reserve 또는 schedule.view_others, 쓰기 = schedule.reserve
--       schedule.view_others 없으면 본인 담당·본인 접수 예약만 보임
-- 지점: branch_ok() (대표관리자 전 지점, 나머지 본인 지점)

alter table public.rsv_programs
  add column if not exists capacity integer not null default 1
  check (capacity between 1 and 50);
comment on column public.rsv_programs.capacity is '같은 시간 동시 예약 가능 인원(정원)';

-- 예약표용 프로그램 목록
create or replace function public.rsv_program_list(p_branch text)
returns table(id text, name text, short text, grp text, parent_id text, color text, minutes integer, capacity integer, sort integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.short, p.grp, p.parent_id, p.color, p.minutes, p.capacity, p.sort
  from public.rsv_programs p
  where (select m.id from public.me() m) is not null
    and p.active and p_branch = any(p.branches)
  order by p.sort, p.name
$$;

-- 예약표 조회 (최대 42일)
create or replace function public.rsv_board(p_branch text, p_from date, p_to date)
returns table(id uuid, branch text, day date, start_time text, minutes integer, kind text, customer_key text,
  customer_name text, title text, staff_id text, staff_name text, program_id text, status text, memo text,
  cancel_reason text, receiver_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  with m as (select * from public.me())
  select r.id, r.branch, r.day, r.start_time, r.minutes, r.kind, r.customer_key,
    r.customer_name, r.title, r.staff_id, s.name, r.program_id, r.status, r.memo,
    r.cancel_reason, rc.name, r.created_at
  from public.rsv_reservations r
  cross join m
  left join public.staff_accounts s on s.id::text = r.staff_id
  left join public.staff_accounts rc on rc.id::text = r.receiver
  where m.id is not null
    and (public.can('schedule.reserve') or public.can('schedule.view_others'))
    and public.branch_ok(p_branch) and r.branch = p_branch
    and r.day between p_from and least(p_to, p_from + 41)
    and (public.can('schedule.view_others') or r.staff_id = m.id::text or r.receiver = m.id::text)
  order by r.day, r.start_time, r.created_at
$$;

-- 지점 휴무일 (예약표 표시용)
create or replace function public.rsv_holiday_list(p_branch text, p_from date, p_to date)
returns table(day date, reason text)
language sql stable security definer set search_path = public as $$
  select h.day, h.reason from public.rsv_holidays h
  where (select m.id from public.me() m) is not null and public.branch_ok(p_branch)
    and h.branch = p_branch and h.day between p_from and least(p_to, p_from + 41)
$$;

-- 내부: 정원 검사 (같은 프로그램·겹치는 시간·예약/완료 상태)
create or replace function public.rsv_capacity_check(p_branch text, p_day date, p_start text, p_prog public.rsv_programs, p_self uuid)
returns void language plpgsql security definer set search_path = public as $$
declare used integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_branch || p_day::text || p_prog.id));
  select count(*) into used from public.rsv_reservations r
  where r.branch = p_branch and r.day = p_day and r.program_id = p_prog.id
    and r.status in ('예약','완료') and (p_self is null or r.id <> p_self)
    and r.start_time::time < p_start::time + make_interval(mins => p_prog.minutes)
    and r.start_time::time + make_interval(mins => r.minutes) > p_start::time;
  if used >= p_prog.capacity then
    raise exception '이 시간 % 정원(%명)이 다 찼어요.', p_prog.name, p_prog.capacity;
  end if;
end $$;

-- 예약 등록: 소요시간은 프로그램 기본값, 상태는 항상 '예약'
-- p = {branch, day, start_time, program_id, customer_key?, title?, staff_id?, memo?}
create or replace function public.rsv_create(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; pr public.rsv_programs; b text := p->>'branch'; d date := (p->>'day')::date;
  t text := p->>'start_time'; k text; cname text; rid uuid;
begin
  select * into m from public.me();
  if m.id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.can('schedule.reserve') then raise exception '예약 접수 권한이 없어요.'; end if;
  if not public.branch_ok(b) then raise exception '다른 지점 예약은 만들 수 없어요.'; end if;
  if t !~ '^\d{2}:\d{2}$' then raise exception '시간 형식이 맞지 않아요.'; end if;
  if exists (select 1 from public.rsv_holidays h where h.branch = b and h.day = d) then raise exception '지점 휴무일이에요.'; end if;
  select * into pr from public.rsv_programs x where x.id = p->>'program_id' and x.active and b = any(x.branches);
  if not found then raise exception '프로그램을 골라 주세요.'; end if;
  k := case when pr.grp in ('업무','행사') then pr.grp else '고객' end;
  if k = '고객' then
    select c.name into cname from public.customers c where c.key = p->>'customer_key' and c.branch = b;
    if cname is null then raise exception '고객을 찾지 못했어요.'; end if;
  end if;
  perform public.rsv_capacity_check(b, d, t, pr, null);
  insert into public.rsv_reservations (branch, day, start_time, minutes, kind, customer_key, customer_name, title,
    staff_id, program_id, memo, receiver, created_by, updated_by)
  values (b, d, t, pr.minutes, k, case when k = '고객' then p->>'customer_key' end, coalesce(cname, ''),
    coalesce(p->>'title', ''), coalesce(p->>'staff_id', ''), pr.id, coalesce(p->>'memo', ''), m.id::text, m.id::text, m.id::text)
  returning id into rid;
  return rid;
end $$;

-- 예약 변경 (날짜·시간·프로그램·담당·메모). '예약' 상태만.
create or replace function public.rsv_update(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; r public.rsv_reservations; pr public.rsv_programs; d date; t text;
begin
  select * into m from public.me();
  if m.id is null or not public.can('schedule.reserve') then raise exception '예약 접수 권한이 없어요.'; end if;
  select * into r from public.rsv_reservations where id = p_id for update;
  if not found or not public.branch_ok(r.branch) then raise exception '예약을 찾지 못했어요.'; end if;
  if not public.can('schedule.view_others') and r.staff_id <> m.id::text and r.receiver <> m.id::text then
    raise exception '다른 직원 예약은 바꿀 수 없어요.'; end if;
  if r.status <> '예약' then raise exception '% 처리된 예약은 바꿀 수 없어요.', r.status; end if;
  d := coalesce((p->>'day')::date, r.day); t := coalesce(p->>'start_time', r.start_time);
  if t !~ '^\d{2}:\d{2}$' then raise exception '시간 형식이 맞지 않아요.'; end if;
  if d <> r.day and exists (select 1 from public.rsv_holidays h where h.branch = r.branch and h.day = d) then raise exception '지점 휴무일이에요.'; end if;
  select * into pr from public.rsv_programs x where x.id = coalesce(p->>'program_id', r.program_id) and x.active and r.branch = any(x.branches);
  if not found then raise exception '프로그램을 골라 주세요.'; end if;
  perform public.rsv_capacity_check(r.branch, d, t, pr, r.id);
  update public.rsv_reservations set day = d, start_time = t, program_id = pr.id,
    minutes = case when pr.id = r.program_id then r.minutes else pr.minutes end,
    staff_id = coalesce(p->>'staff_id', r.staff_id), memo = coalesce(p->>'memo', r.memo),
    title = coalesce(p->>'title', r.title), updated_by = m.id::text, updated_at = now()
  where id = r.id;
end $$;

-- 취소 / 노쇼 / 되돌리기('예약'). 결제(완료)는 매출 쪽 기능에서 처리.
create or replace function public.rsv_set_status(p_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; r public.rsv_reservations;
begin
  select * into m from public.me();
  if m.id is null or not public.can('schedule.reserve') then raise exception '예약 접수 권한이 없어요.'; end if;
  if p_status not in ('예약','취소','노쇼') then raise exception '취소·노쇼·되돌리기만 할 수 있어요.'; end if;
  select * into r from public.rsv_reservations where id = p_id for update;
  if not found or not public.branch_ok(r.branch) then raise exception '예약을 찾지 못했어요.'; end if;
  if not public.can('schedule.view_others') and r.staff_id <> m.id::text and r.receiver <> m.id::text then
    raise exception '다른 직원 예약은 바꿀 수 없어요.'; end if;
  if r.status = '완료' then raise exception '결제 완료된 예약이에요. 결제 취소 후 바꿔 주세요.'; end if;
  if p_status = '예약' and r.status in ('취소','노쇼') then
    perform public.rsv_capacity_check(r.branch, r.day, r.start_time, (select x from public.rsv_programs x where x.id = r.program_id), r.id);
  end if;
  update public.rsv_reservations set status = p_status,
    cancel_reason = case when p_status = '예약' then '' else coalesce(p_reason, '') end,
    updated_by = m.id::text, updated_at = now()
  where id = r.id;
end $$;

-- 정원 설정 (설정 변경 권한)
create or replace function public.rsv_program_set_capacity(p_id text, p_capacity integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can('settings.edit') then raise exception '설정 변경 권한이 없어요.'; end if;
  update public.rsv_programs set capacity = p_capacity, updated_by = (select m.id::text from public.me() m), updated_at = now() where id = p_id;
end $$;

revoke all on function public.rsv_program_list(text), public.rsv_board(text, date, date), public.rsv_holiday_list(text, date, date),
  public.rsv_capacity_check(text, date, text, public.rsv_programs, uuid), public.rsv_create(jsonb), public.rsv_update(uuid, jsonb),
  public.rsv_set_status(uuid, text, text), public.rsv_program_set_capacity(text, integer) from public, anon;
grant execute on function public.rsv_program_list(text), public.rsv_board(text, date, date), public.rsv_holiday_list(text, date, date),
  public.rsv_create(jsonb), public.rsv_update(uuid, jsonb), public.rsv_set_status(uuid, text, text),
  public.rsv_program_set_capacity(text, integer) to authenticated, service_role;
