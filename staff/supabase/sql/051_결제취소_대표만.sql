begin;

-- 051 결제 취소는 대표관리자만 · 2026-11-21 · SQL 편집기에서 한 번에 실행하세요.
-- 꼭 070_요청승인.sql 을 먼저 실행한 뒤에 실행하세요. (070을 나중에 다시 돌리면 이 파일도 다시 실행)
-- 1) pay_cancel: schedule.pay_cancel 권한이 있어도 대표관리자(owner)만 바로 취소.
--    나머지 직원은 요청 → 승인(070, kind pay_cancel)으로만. 승인은 대표관리자만 하므로 승인 시 그대로 동작해요.
--    제품 판매 취소(goods_sale_void)는 원래 대표관리자 전용이고 안에서 pay_cancel 을 불러요. 그대로 동작해요.
-- 2) _approval_apply: kind pay_cancel + target_type 'goods_sale' 이면 제품 판매 취소(goods_sale_void)로 반영.
-- 테이블 변경 없음. 새 테이블 없음.

create or replace function public.pay_cancel(p_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m public.staff_accounts; ck public.rsv_checkouts; d jsonb;
begin
  select * into m from public.me();
  if m.id is null or m.tier <> 'owner' then raise exception '결제 취소는 대표관리자만 할 수 있어요. 대표관리자에게 요청해 주세요.' using errcode = '42501'; end if;
  select * into ck from public.rsv_checkouts where (id = p_id or reservation_id = p_id) and canceled_at is null order by created_at desc limit 1 for update;
  if not found then raise exception '취소할 결제를 찾지 못했어요.'; end if;
  if not public.branch_ok(ck.branch) then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  if ck.new_membership_id is not null and exists (select 1 from public.rsv_membership_items where membership_id = ck.new_membership_id and used > 0) then
    raise exception '이 결제로 판매한 회원권을 이미 썼어요. 회원권 환불로 처리해 주세요.'; end if;
  for d in select * from jsonb_array_elements(ck.deducted) loop
    update public.rsv_membership_items set used = (d->>'used_before')::int, service = (d->>'service_before')::int where id = (d->>'item_id')::uuid;
    update public.rsv_memberships set status = '사용중' where id = (select membership_id from public.rsv_membership_items where id = (d->>'item_id')::uuid) and status = '끝남';
  end loop;
  if ck.new_membership_id is not null then delete from public.rsv_memberships where id = ck.new_membership_id; end if;
  update public.payments set voided_at = now(), voided_by = m.name where dedup_key = any(ck.payment_keys);
  if ck.reservation_id is not null then
    update public.rsv_reservations set status = '예약', updated_by = m.id::text, updated_at = now() where id = ck.reservation_id and status = '완료';
  end if;
  update public.rsv_checkouts set canceled_at = now(), canceled_by = m.name, cancel_reason = coalesce(p_reason, '') where id = ck.id;
end $$;

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
  elsif a.kind = 'pay_cancel' and a.target_type = 'goods_sale' then
    perform public.goods_sale_void(a.target_id::uuid, a.reason);   -- 제품 판매 취소 (재고 되돌림 + 매출 무효)
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

revoke all on function public.pay_cancel(uuid, text) from public, anon;
grant execute on function public.pay_cancel(uuid, text) to authenticated;
revoke all on function public._approval_apply(uuid) from public, anon, authenticated;

commit;

select '결제 취소 대표관리자 전용 완료' as 결과;
