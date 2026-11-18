-- 업무 탭(오늘 할 일) RPC 초안 · 2026-11-18 · 업무 탭 스레드
-- 적용: 공통 백엔드 스레드. 표 구조 변경 없음, 함수 3개 + GRANT만.
-- 데이터: work_items(해피콜·승인·기타 업무), task_templates/task_checks(체크리스트), diet_certs(수동 인증)
-- 모두 security definer, 안에서 me()/branch_ok()/can() 검사. 고객 표는 읽지 않음.

-- 1) 오늘 업무 한 번에 읽기
create or replace function public.work_today(p_branch text default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  m record;
  b text;
  d date := (now() at time zone 'Asia/Seoul')::date;
  d0 timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
  d1 timestamptz := d0 + interval '1 day';
  can_cert boolean := public.can('app.manual_cert');
  r jsonb;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  b := coalesce(nullif(p_branch, ''), m.branch);
  if not public.branch_ok(b) then raise exception 'FORBIDDEN_BRANCH'; end if;

  with open_items as (
    select w.* from public.work_items w
    where w.branch = b and w.done_at is null
      and (w.status in ('대기','기한지남') or (w.status = '진행' and (w.follow_day is null or w.follow_day <= d)))
  ),
  item_json as (
    select o.*, jsonb_build_object(
      'id', o.id, 'kind', o.kind, 'title', o.title, 'note', o.note, 'status', o.status,
      'assignee', o.assignee, 'due_at', o.due_at, 'follow_day', o.follow_day,
      'mine', (o.assignee is not null and o.assignee in (m.name, m.login_id))
    ) j from open_items o
  ),
  checklist as (
    select t.id, t.title, t.cycle, t.role, t.sort, c.checked_by, c.checked_at
    from public.task_templates t
    left join public.task_checks c on c.template_id = t.id and c.day = d and c.branch = b
    where t.enabled and not coalesce(t.sample, false)
      and (t.branch is null or t.branch = b)
      and (t.role is null or t.role = m.tier or t.role = m.title)
      and (t.cycle in ('오전','오후')
        or (t.cycle = '주간' and t.weekday = extract(dow from d)::int)
        or (t.cycle = '월간' and t.month_day = extract(day from d)::int))
  )
  select jsonb_build_object(
    'day', d, 'branch', b,
    'happycall', jsonb_build_object(
      -- 해피콜 화면 '오늘 할 일'과 같은 기준: 대기·기한지남 전부 + 부재(진행) 중 다시 연락할 날이 오늘 이전
      'today_left', (select count(*) from open_items where kind = '해피콜' and not (status = '기한지남' or (status = '대기' and due_at < d0))),
      'today_done', (select count(*) from public.work_items where branch = b and kind = '해피콜' and done_at >= d0 and done_at < d1),
      'overdue', (select count(*) from open_items where kind = '해피콜' and (status = '기한지남' or (status = '대기' and due_at < d0)))
    ),
    'overdue', coalesce((select jsonb_agg(j order by due_at) from item_json
                 where kind <> '해피콜' and (status = '기한지남' or (status = '대기' and due_at < d0))), '[]'::jsonb),
    'approvals', jsonb_build_object(
      'can', can_cert,
      'items', case when can_cert then coalesce((select jsonb_agg(j order by due_at nulls last) from item_json
                 where kind = '승인' and not (status = '기한지남' or (status = '대기' and due_at < d0))), '[]'::jsonb) else '[]'::jsonb end,
      'manual_certs', case when can_cert then (select count(*) from public.diet_certs
                 where branch = b and feedback_at is null and day >= d - 7) else 0 end
    ),
    'remaining', coalesce((select jsonb_agg(j order by due_at nulls last) from item_json
                 where kind not in ('해피콜','승인') and not (status = '기한지남' or (status = '대기' and due_at < d0))
                   and (due_at is null or due_at < d1)), '[]'::jsonb),
    'checklist', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', id, 'title', title, 'cycle', cycle, 'checked', checked_at is not null,
                 'checked_by', checked_by, 'checked_at', checked_at) order by
                 case cycle when '오전' then 0 when '오후' then 1 when '주간' then 2 else 3 end, sort)
                 from checklist), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- 2) 체크리스트 체크/해제 (오늘, 그 지점)
create or replace function public.task_check_set(p_template uuid, p_done boolean, p_branch text default null)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  m record;
  b text;
  d date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  b := coalesce(nullif(p_branch, ''), m.branch);
  if not public.branch_ok(b) then raise exception 'FORBIDDEN_BRANCH'; end if;
  if not exists (select 1 from public.task_templates t where t.id = p_template and t.enabled and (t.branch is null or t.branch = b)) then
    raise exception 'NOT_FOUND';
  end if;
  if p_done then
    insert into public.task_checks(day, branch, template_id, checked_by, checked_at)
    values (d, b, p_template, m.name, now())
    on conflict (day, branch, template_id) do nothing;
  else
    delete from public.task_checks where day = d and branch = b and template_id = p_template;
  end if;
end $$;

-- 3) 업무 완료 (해피콜 제외: 해피콜 결과는 해피콜 화면에서 남김. 승인은 app.manual_cert 필요)
create or replace function public.work_item_done(p_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  m record;
  w record;
begin
  select * into m from public.me();
  if m.id is null then raise exception 'NOT_STAFF'; end if;
  select * into w from public.work_items where id = p_id for update;
  if w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  if w.kind = '해피콜' then raise exception 'USE_HAPPYCALL_SCREEN'; end if;
  if w.kind = '승인' and not public.can('app.manual_cert') then raise exception 'FORBIDDEN'; end if;
  if w.done_at is not null then return; end if;
  update public.work_items set status = '완료', done_at = now(), actor = m.name where id = p_id;
  insert into public.work_events(work_item_id, at, actor, from_status, to_status, note)
  values (p_id, now(), m.name, w.status, '완료', nullif(p_note, ''));
end $$;

revoke all on function public.work_today(text) from public, anon;
revoke all on function public.task_check_set(uuid, boolean, text) from public, anon;
revoke all on function public.work_item_done(uuid, text) from public, anon;
grant execute on function public.work_today(text) to authenticated, service_role;
grant execute on function public.task_check_set(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.work_item_done(uuid, text) to authenticated, service_role;
-- 참고: work_events.id가 bigint 시퀀스면 시퀀스 usage도 함수 소유자(postgres)는 이미 가짐. authenticated에는 표 권한 안 줌.
