-- 055 업무 요청 (대표님 11/21): 오늘 할 일 > 남은 업무 탭에서 담당자를 정해 요청하고, 진행중 · 완료 · 보류로 상태를 바꿔요.
-- 표: work_requests 새로 만듦 (다른 표는 안 건드려요). 화면은 함수로만 읽고 써요 (표 직접 읽기 권한 없음).
-- 함수 (모두 security definer + 자기 지점만):
--   work_req_list(p_branch)                                        : 진행중·보류 전부 + 최근 30일 완료 (jsonb)
--   work_req_save(p_id, p_branch, p_title, p_body, p_assignee, p_due) : 새 요청(p_id null) · 고치기
--   work_req_status(p_id, p_status)                                 : 진행중 / 완료 / 보류
--   work_req_del(p_id)                                              : 지우기
-- 요청: 직원 누구나. 상태 바꾸기: 담당자 · 요청한 사람 · 대표관리자 · 관리자. 고치기·지우기: 요청한 사람 · 대표관리자 · 관리자
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run. 중간에 실패하면 아무것도 바뀌지 않아요.
begin;

create table if not exists public.work_requests (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  title text not null,
  body text,
  assignee text,
  requester text not null,
  status text not null default '진행중' check (status in ('진행중', '완료', '보류')),
  due_day date,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  status_at timestamptz,
  status_by text
);
create index if not exists work_requests_branch_idx on public.work_requests (branch, status, created_at desc);
alter table public.work_requests enable row level security;
revoke all on table public.work_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.work_requests to service_role;

create or replace function public.work_req_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me record;
begin
  select * into v_me from public.me();
  if v_me.id is null then raise exception 'NOT_STAFF'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', w.id, 'title', w.title, 'body', w.body, 'assignee', w.assignee, 'requester', w.requester,
      'status', w.status, 'due_day', w.due_day, 'at', w.created_at, 'edited_at', w.edited_at,
      'status_at', w.status_at, 'status_by', w.status_by
    ) order by w.created_at desc)
    from public.work_requests w
    where w.branch = p_branch and (w.status <> '완료' or w.status_at > now() - interval '30 days')
  ), '[]'::jsonb);
end $$;

create or replace function public.work_req_save(p_id uuid, p_branch text, p_title text, p_body text default null,
  p_assignee text default null, p_due date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me record; w record; v_id uuid;
begin
  select * into v_me from public.me();
  if v_me.id is null then raise exception 'NOT_STAFF'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  if coalesce(btrim(p_title), '') = '' or length(p_title) > 100 or length(coalesce(p_body, '')) > 1000 then raise exception 'BAD_BODY'; end if;
  if p_id is null then
    insert into public.work_requests(branch, title, body, assignee, requester, due_day)
    values (p_branch, btrim(p_title), nullif(btrim(coalesce(p_body, '')), ''), nullif(btrim(coalesce(p_assignee, '')), ''), v_me.name, p_due)
    returning id into v_id;
    return v_id;
  end if;
  select * into w from public.work_requests where id = p_id for update;
  if w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  if w.requester is distinct from v_me.name and v_me.tier not in ('owner', 'manager') then raise exception 'NO_PERMISSION'; end if;
  update public.work_requests set title = btrim(p_title), body = nullif(btrim(coalesce(p_body, '')), ''),
    assignee = nullif(btrim(coalesce(p_assignee, '')), ''), due_day = p_due, edited_at = now()
  where id = p_id;
  return p_id;
end $$;

create or replace function public.work_req_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me record; w record;
begin
  select * into v_me from public.me();
  if v_me.id is null then raise exception 'NOT_STAFF'; end if;
  if p_status not in ('진행중', '완료', '보류') then raise exception 'BAD_STATUS'; end if;
  select * into w from public.work_requests where id = p_id for update;
  if w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  if v_me.name is distinct from w.assignee and v_me.name is distinct from w.requester and v_me.tier not in ('owner', 'manager') then
    raise exception 'NO_PERMISSION';
  end if;
  update public.work_requests set status = p_status, status_at = now(), status_by = v_me.name where id = p_id;
end $$;

create or replace function public.work_req_del(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me record; w record;
begin
  select * into v_me from public.me();
  select * into w from public.work_requests where id = p_id;
  if v_me.id is null or w.id is null or not public.branch_ok(w.branch) then raise exception 'NOT_FOUND'; end if;
  if w.requester is distinct from v_me.name and v_me.tier not in ('owner', 'manager') then raise exception 'NO_PERMISSION'; end if;
  delete from public.work_requests where id = p_id;
end $$;

revoke all on function public.work_req_list(text) from public, anon;
revoke all on function public.work_req_save(uuid, text, text, text, text, date) from public, anon;
revoke all on function public.work_req_status(uuid, text) from public, anon;
revoke all on function public.work_req_del(uuid) from public, anon;
grant execute on function public.work_req_list(text) to authenticated, service_role;
grant execute on function public.work_req_save(uuid, text, text, text, text, date) to authenticated, service_role;
grant execute on function public.work_req_status(uuid, text) to authenticated, service_role;
grant execute on function public.work_req_del(uuid) to authenticated, service_role;

commit;

-- 확인: select proname from pg_proc where proname like 'work_req%';
