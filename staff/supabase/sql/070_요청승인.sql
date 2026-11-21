begin;

-- 070 요청 → 승인 (035 초안 + 승인하면 바로 반영) · 2026-11-21 · SQL 편집기에서 한 번에 실행하세요.
-- 3단계 권한 기준
-- 대표관리자(owner) / 관리자(manager) / 직원(staff)
-- 시안 1120의 4단계 화면을 이렇게 바꿔요:
--   시안 '직원·매니저가 요청'  → 직원이 요청
--   시안 '지점장이 처리 + 대표 알림' → 관리자가 처리 (대표관리자에게 기록이 남아요)
--   돈이 나가는 일(환불·결제 취소·50만 원 이상 지출)과 권한·설정 변경 → 대표관리자만 처리
-- 관리자·대표관리자는 요청 없이 바로 처리할 수 있어요 (같은 표에 '바로 처리'로 기록).
-- 승인(또는 바로 처리)하면 이렇게 반영돼요:
--   노쇼  : 예약을 '노쇼'로. '1회 차감'이면 같은 관리의 쓰는 중 회원권에서 1회 차감
--   취소  : 예약을 '취소'로
--   결제 취소 : pay_cancel 그대로 (회차 되돌림 · 매출 취소)
--   지출  : 지출 장부에 1줄 (요청한 직원 이름으로)
--   환불 · 회원권 조정 · 미수금 정산 · 권한 · 설정 변경 : 결정 기록만 남고, 반영은 해당 화면에서 해요

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  kind text not null check (kind in (
    'rsv_noshow',        -- 노쇼 처리 (1회 차감 / 기록만)
    'rsv_cancel',        -- 예약 취소
    'rsv_naver_reject',  -- 네이버 예약 거절
    'pay_cancel',        -- 결제 취소
    'refund',            -- 환불
    'membership_adjust', -- 회원권 조정 (횟수·기간)
    'expense',           -- 지출
    'receivable_settle', -- 미수금 정산
    'perm_change',       -- 직원 권한 변경
    'setting_change'     -- 관리항목·회원권상품·포인트·등급·수수료 등 설정 변경
  )),
  target_type text not null default '',   -- 예: reservation, payment, membership, staff
  target_id text not null default '',
  payload jsonb not null default '{}'::jsonb, -- 바뀌는 내용 (금액, 차감 여부, 바꿀 값 등)
  amount integer,                             -- 돈이 걸린 요청이면 금액 (원)
  reason text not null default '',
  status text not null default '대기' check (status in ('대기','승인','반려','취소','바로 처리')),
  requested_by uuid not null,
  requested_name text not null default '',
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_name text,
  decided_at timestamptz,
  decide_note text not null default ''
);
create index if not exists approval_requests_branch_status on public.approval_requests(branch, status, requested_at desc);
alter table public.approval_requests enable row level security;
-- 테이블 직접 권한은 주지 않아요. 아래 함수로만 읽고 써요.
revoke all on public.approval_requests from public, anon, authenticated;
grant select, insert, update on public.approval_requests to service_role;

-- 누가 결정할 수 있나
create or replace function public.approval_can_decide(p_kind text, p_amount integer)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when (select tier from public.me()) = 'owner' then true
    when (select tier from public.me()) = 'manager' then
      p_kind in ('rsv_noshow','rsv_cancel','rsv_naver_reject','membership_adjust','receivable_settle')
      or (p_kind = 'expense' and coalesce(p_amount, 0) < 500000)
    else false end
$$;


-- 승인되면 실제로 반영 (내부용, 직접 호출 불가)
create or replace function public._approval_apply(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a public.approval_requests; r public.rsv_reservations; it record; v_res jsonb := '{}'::jsonb;
begin
  select * into a from public.approval_requests where id = p_id;
  if a.kind in ('rsv_noshow', 'rsv_cancel') then
    select * into r from public.rsv_reservations where id = a.target_id::uuid and branch = a.branch for update;
    if not found then raise exception '예약을 찾지 못했어요.'; end if;
    if r.status = '완료' then raise exception '결제 완료된 예약이에요. 결제 취소 후 바꿔 주세요.'; end if;
    update public.rsv_reservations set status = case a.kind when 'rsv_noshow' then '노쇼' else '취소' end,
      cancel_reason = a.reason, updated_by = coalesce(a.decided_by, a.requested_by)::text, updated_at = now()
    where id = r.id;
    if a.kind = 'rsv_noshow' and coalesce((a.payload->>'deduct')::boolean, false) and r.customer_key is not null then
      select i.id, i.used, ms.id ms_id into it from public.rsv_membership_items i
      join public.rsv_memberships ms on ms.id = i.membership_id
      where ms.branch = r.branch and ms.customer_key = r.customer_key and ms.status = '사용중'
        and i.program_id = r.program_id and coalesce(i.total,0) + coalesce(i.service,0) - coalesce(i.used,0) > 0
      order by ms.end_on nulls last, ms.sold_at limit 1 for update;
      if found then
        update public.rsv_membership_items set used = coalesce(used,0) + 1 where id = it.id;
        v_res := jsonb_build_object('item_id', it.id, 'used_before', it.used);
      else
        v_res := jsonb_build_object('note', '차감할 회원권이 없어 기록만 했어요');
      end if;
    end if;
  elsif a.kind = 'pay_cancel' then
    perform public.pay_cancel(a.target_id::uuid, a.reason);
  elsif a.kind = 'expense' then
    insert into public.expenses (id, branch, day, category_id, amount, method, memo, hidden, created_by, created_at)
    values (gen_random_uuid(), a.branch, coalesce(nullif(a.payload->>'day','')::date, (now() at time zone 'Asia/Seoul')::date),
      a.payload->>'category_id', a.amount, coalesce(a.payload->>'method', '카드'), nullif(a.reason, ''), false, a.requested_name, now());
  end if;
  update public.approval_requests set payload = payload || jsonb_build_object('applied', v_res || jsonb_build_object('at', now())) where id = p_id;
end $$;
revoke all on function public._approval_apply(uuid) from public, anon, authenticated;

-- 요청 보내기 (관리자·대표관리자가 결정 권한이 있으면 '바로 처리'로 기록)
create or replace function public.approval_request(p_branch text, p_kind text, p_target_type text, p_target_id text,
  p_payload jsonb, p_amount integer, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_me record; v_id uuid; v_now boolean;
begin
  select * into v_me from public.me();
  if v_me.id is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not public.branch_ok(p_branch) then raise exception 'NO_BRANCH'; end if;
  if p_kind in ('rsv_noshow','rsv_cancel','rsv_naver_reject','pay_cancel','refund') and coalesce(btrim(p_reason),'') = '' then
    raise exception 'REASON_REQUIRED';
  end if;
  v_now := public.approval_can_decide(p_kind, p_amount);
  insert into public.approval_requests(branch, kind, target_type, target_id, payload, amount, reason, status,
    requested_by, requested_name, decided_by, decided_name, decided_at)
  values (p_branch, p_kind, coalesce(p_target_type,''), coalesce(p_target_id,''), coalesce(p_payload,'{}'::jsonb), p_amount,
    coalesce(btrim(p_reason),''), case when v_now then '바로 처리' else '대기' end,
    v_me.id, v_me.name, case when v_now then v_me.id end, case when v_now then v_me.name end, case when v_now then now() end)
  returning id into v_id;
  if v_now then perform public._approval_apply(v_id); end if;
  return v_id;
end $$;

-- 목록: 직원은 내가 보낸 것만, 관리자·대표관리자는 지점 전체
create or replace function public.approval_list(p_branch text, p_status text default null)
returns setof public.approval_requests language sql stable security definer set search_path to 'public' as $$
  select a.* from public.approval_requests a
  where (select id from public.me()) is not null
    and ((p_branch is null and (select tier from public.me()) = 'owner') or (public.branch_ok(p_branch) and a.branch = p_branch))
    and (p_status is null or a.status = p_status)
    and ((select tier from public.me()) in ('owner','manager') or a.requested_by = (select id from public.me()))
  order by (a.status = '대기') desc, a.requested_at desc
  limit 300
$$;

-- 승인 / 반려 (반려는 이유 필수)
create or replace function public.approval_decide(p_id uuid, p_ok boolean, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me record; v_a record;
begin
  select * into v_me from public.me();
  select * into v_a from public.approval_requests where id = p_id for update;
  if v_me.id is null or v_a.id is null or not public.branch_ok(v_a.branch) then raise exception 'NOT_FOUND'; end if;
  if v_a.status <> '대기' then raise exception 'ALREADY_DONE'; end if;
  if not public.approval_can_decide(v_a.kind, v_a.amount) then raise exception 'NO_PERMISSION'; end if;
  if v_a.requested_by = v_me.id and v_me.tier <> 'owner' then raise exception 'SELF_APPROVAL'; end if;
  if not p_ok and coalesce(btrim(p_note),'') = '' then raise exception 'NOTE_REQUIRED'; end if;
  update public.approval_requests set status = case when p_ok then '승인' else '반려' end,
    decided_by = v_me.id, decided_name = v_me.name, decided_at = now(), decide_note = coalesce(btrim(p_note),'')
  where id = p_id;
  if p_ok then perform public._approval_apply(p_id); end if;
end $$;

-- 보낸 사람이 대기 중인 요청 취소
create or replace function public.approval_cancel(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_me record; v_a record;
begin
  select * into v_me from public.me();
  select * into v_a from public.approval_requests where id = p_id for update;
  if v_me.id is null or v_a.id is null or v_a.requested_by <> v_me.id then raise exception 'NOT_FOUND'; end if;
  if v_a.status <> '대기' then raise exception 'ALREADY_DONE'; end if;
  update public.approval_requests set status = '취소', decided_at = now() where id = p_id;
end $$;

revoke all on function public.approval_can_decide(text, integer), public.approval_request(text, text, text, text, jsonb, integer, text),
  public.approval_list(text, text), public.approval_decide(uuid, boolean, text), public.approval_cancel(uuid) from public, anon;
grant execute on function public.approval_can_decide(text, integer), public.approval_request(text, text, text, text, jsonb, integer, text),
  public.approval_list(text, text), public.approval_decide(uuid, boolean, text), public.approval_cancel(uuid) to authenticated, service_role;

commit;
