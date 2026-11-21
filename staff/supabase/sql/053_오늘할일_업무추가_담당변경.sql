-- 053 오늘 할 일 v3 시안 (U-PC-TODO-2 담당변경·처리완료 되돌리기, U-PC-TODO-4 업무 추가)
-- 새 함수 3개, 표 변경 없음. 모두 security definer + 자기 지점만 (branch_ok).
--   work_item_add(p_branch, p_title, p_assignee, p_due_at, p_note)  : '+ 업무 추가' (관리자·대표관리자)
--   work_item_assign(p_id, p_assignee)                               : 지난 마감 '담당' 바꾸기 (관리자·대표관리자), 기록 남김
--   work_item_reopen(p_id)                                           : '처리'·'완료' 되돌리기 (5분 안, 처리한 본인 또는 관리자)
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run. 한 번에 안 되면 아무것도 바뀌지 않아요(트랜잭션).
begin;

create or replace function public.work_item_add(p_branch text, p_title text, p_assignee text default null,
  p_due_at timestamptz default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare m record; v_id uuid;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  if m.tier not in ('owner', 'manager') then raise exception 'FORBIDDEN'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'TITLE_REQUIRED'; end if;
  insert into public.work_items(branch, kind, title, note, status, assignee, due_at)
  values (p_branch, '업무', left(btrim(p_title), 100), nullif(btrim(coalesce(p_note, '')), ''), '대기',
          nullif(btrim(coalesce(p_assignee, '')), ''),
          coalesce(p_due_at, (((now() at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul') - interval '1 second'))
  returning id into v_id;
  insert into public.work_events(work_item_id, at, actor, from_status, to_status, note)
  values (v_id, now(), m.name, null, '대기', '업무 추가');
  return v_id;
end $$;

create or replace function public.work_item_assign(p_id uuid, p_assignee text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m record; w record;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  if m.tier not in ('owner', 'manager') then raise exception 'FORBIDDEN'; end if;
  select * into w from public.work_items where id = p_id for update;
  if w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  update public.work_items set assignee = nullif(btrim(coalesce(p_assignee, '')), '') where id = p_id;
  insert into public.work_events(work_item_id, at, actor, from_status, to_status, note)
  values (p_id, now(), m.name, w.status, w.status, '담당 ' || coalesce(w.assignee, '미배정') || ' → ' || coalesce(nullif(btrim(p_assignee), ''), '미배정'));
  return jsonb_build_object('before', w.assignee, 'after', nullif(btrim(coalesce(p_assignee, '')), ''), 'by', m.name, 'at', now());
end $$;

create or replace function public.work_item_reopen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record; w record;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  select * into w from public.work_items where id = p_id for update;
  if w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  if w.kind = '해피콜' then raise exception 'USE_HAPPYCALL_SCREEN'; end if;
  if w.done_at is null then return; end if;
  if w.done_at < now() - interval '5 minutes' then raise exception 'TOO_LATE'; end if;
  if w.actor is distinct from m.name and m.tier not in ('owner', 'manager') then raise exception 'FORBIDDEN'; end if;
  update public.work_items set status = case when due_at < now() then '기한지남' else '대기' end, done_at = null where id = p_id;
  insert into public.work_events(work_item_id, at, actor, from_status, to_status, note)
  values (p_id, now(), m.name, '완료', case when w.due_at < now() then '기한지남' else '대기' end, '되돌리기');
end $$;

revoke all on function public.work_item_add(text, text, text, timestamptz, text) from public, anon;
revoke all on function public.work_item_assign(uuid, text) from public, anon;
revoke all on function public.work_item_reopen(uuid) from public, anon;
grant execute on function public.work_item_add(text, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.work_item_assign(uuid, text) to authenticated, service_role;
grant execute on function public.work_item_reopen(uuid) to authenticated, service_role;

commit;

-- 확인: select proname from pg_proc where proname in ('work_item_add','work_item_assign','work_item_reopen');
