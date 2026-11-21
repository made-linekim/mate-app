-- 054 업무 메모 단순하게 + 제목·중요도·코멘트(답글)·수정·삭제 (대표님 11/21)
-- 표: rsv_memos 에 칸 3개 추가 (title, important, edited_at). 지우는 것 없음.
--   업무 메모 = scope '업무', ref 'YYYY-MM-DD'
--   코멘트    = scope '업무답글', ref = 메모 id
-- 함수 (모두 security definer + 자기 지점만):
--   rsv_work_memo_feed(p_branch, p_from, p_to)          : 기간 메모 + 코멘트 (jsonb)
--   rsv_work_memo_save(p_id, p_branch, p_day, p_title, p_body, p_important) : 새로 쓰기(p_id null) · 고치기
--   rsv_work_memo_star(p_id, p_on)                       : 중요도 별 켜고 끄기
--   rsv_work_memo_reply(p_id, p_parent, p_body)          : 코멘트 쓰기(p_id null) · 고치기
--   rsv_work_memo_del(p_id)                              : 메모나 코멘트 지우기 (메모면 코멘트도 같이)
-- 고치기·지우기: 쓴 사람 본인, 대표관리자, 관리자
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run. 중간에 실패하면 아무것도 바뀌지 않아요.
begin;

alter table public.rsv_memos add column if not exists title text;
alter table public.rsv_memos add column if not exists important boolean not null default false;
alter table public.rsv_memos add column if not exists edited_at timestamptz;

create or replace function public._work_memo_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select (select id from public.me()) is not null and (public.can('schedule.reserve') or public.can('schedule.view_others'))
$$;

create or replace function public.rsv_work_memo_feed(p_branch text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public._work_memo_ok() then raise exception 'NO_PERMISSION'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'day', m.ref, 'title', m.title, 'body', m.body, 'important', m.important,
      'author', m.author, 'at', m.created_at, 'edited_at', m.edited_at,
      'replies', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'body', r.body, 'author', r.author, 'at', r.created_at, 'edited_at', r.edited_at) order by r.created_at)
                           from public.rsv_memos r where r.scope = '업무답글' and r.branch = m.branch and r.ref = m.id::text), '[]'::jsonb)
    ) order by m.ref, m.created_at)
    from public.rsv_memos m
    where m.branch = p_branch and m.scope = '업무' and m.ref ~ '^\d{4}-\d{2}-\d{2}$'
      and m.ref::date between p_from and least(p_to, p_from + 62)
  ), '[]'::jsonb);
end $$;

create or replace function public.rsv_work_memo_save(p_id uuid, p_branch text, p_day date, p_title text, p_body text, p_important boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me record; v_m record; v_id uuid;
begin
  select * into v_me from public.me();
  if not public._work_memo_ok() then raise exception 'NO_PERMISSION'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  if coalesce(btrim(p_body), '') = '' and coalesce(btrim(p_title), '') = '' then raise exception 'BAD_BODY'; end if;
  if length(coalesce(p_body, '')) > 2000 or length(coalesce(p_title, '')) > 100 then raise exception 'BAD_BODY'; end if;
  if p_id is null then
    insert into public.rsv_memos(branch, scope, ref, title, body, important, author)
    values (p_branch, '업무', to_char(p_day, 'YYYY-MM-DD'), nullif(btrim(coalesce(p_title, '')), ''), btrim(coalesce(p_body, '')), coalesce(p_important, false), v_me.name)
    returning id into v_id;
    return v_id;
  end if;
  select * into v_m from public.rsv_memos where id = p_id and scope = '업무' for update;
  if v_m.id is null or not public.branch_ok(v_m.branch) then raise exception 'NOT_FOUND'; end if;
  if v_m.author is distinct from v_me.name and v_me.tier not in ('owner', 'manager') then raise exception 'NO_PERMISSION'; end if;
  update public.rsv_memos set ref = to_char(p_day, 'YYYY-MM-DD'), title = nullif(btrim(coalesce(p_title, '')), ''),
    body = btrim(coalesce(p_body, '')), important = coalesce(p_important, false), edited_at = now()
  where id = p_id;
  return p_id;
end $$;

create or replace function public.rsv_work_memo_star(p_id uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_m record;
begin
  if not public._work_memo_ok() then raise exception 'NO_PERMISSION'; end if;
  select * into v_m from public.rsv_memos where id = p_id and scope = '업무';
  if v_m.id is null or not public.branch_ok(v_m.branch) then raise exception 'NOT_FOUND'; end if;
  update public.rsv_memos set important = coalesce(p_on, false) where id = p_id;
end $$;

create or replace function public.rsv_work_memo_reply(p_id uuid, p_parent uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me record; v_p record; v_m record; v_id uuid;
begin
  select * into v_me from public.me();
  if not public._work_memo_ok() then raise exception 'NO_PERMISSION'; end if;
  if coalesce(btrim(p_body), '') = '' or length(p_body) > 1000 then raise exception 'BAD_BODY'; end if;
  if p_id is null then
    select * into v_p from public.rsv_memos where id = p_parent and scope = '업무';
    if v_p.id is null or not public.branch_ok(v_p.branch) then raise exception 'NOT_FOUND'; end if;
    insert into public.rsv_memos(branch, scope, ref, body, author)
    values (v_p.branch, '업무답글', v_p.id::text, btrim(p_body), v_me.name)
    returning id into v_id;
    return v_id;
  end if;
  select * into v_m from public.rsv_memos where id = p_id and scope = '업무답글' for update;
  if v_m.id is null or not public.branch_ok(v_m.branch) then raise exception 'NOT_FOUND'; end if;
  if v_m.author is distinct from v_me.name and v_me.tier not in ('owner', 'manager') then raise exception 'NO_PERMISSION'; end if;
  update public.rsv_memos set body = btrim(p_body), edited_at = now() where id = p_id;
  return p_id;
end $$;

-- 지우기 (034를 바꿔요): 메모·코멘트 모두. 메모를 지우면 코멘트도 같이 지워요.
create or replace function public.rsv_work_memo_del(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me record; v_m record;
begin
  select * into v_me from public.me();
  select * into v_m from public.rsv_memos where id = p_id and scope in ('업무', '업무답글');
  if v_me.id is null or v_m.id is null or not public.branch_ok(v_m.branch) then raise exception 'NOT_FOUND'; end if;
  if v_m.author is distinct from v_me.name and v_me.tier not in ('owner', 'manager') then raise exception 'NO_PERMISSION'; end if;
  if v_m.scope = '업무' then delete from public.rsv_memos where scope = '업무답글' and ref = p_id::text; end if;
  delete from public.rsv_memos where id = p_id;
end $$;

revoke all on function public._work_memo_ok() from public, anon;
revoke all on function public.rsv_work_memo_feed(text, date, date) from public, anon;
revoke all on function public.rsv_work_memo_save(uuid, text, date, text, text, boolean) from public, anon;
revoke all on function public.rsv_work_memo_star(uuid, boolean) from public, anon;
revoke all on function public.rsv_work_memo_reply(uuid, uuid, text) from public, anon;
revoke all on function public.rsv_work_memo_del(uuid) from public, anon;
grant execute on function public._work_memo_ok() to authenticated, service_role;
grant execute on function public.rsv_work_memo_feed(text, date, date) to authenticated, service_role;
grant execute on function public.rsv_work_memo_save(uuid, text, date, text, text, boolean) to authenticated, service_role;
grant execute on function public.rsv_work_memo_star(uuid, boolean) to authenticated, service_role;
grant execute on function public.rsv_work_memo_reply(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.rsv_work_memo_del(uuid) to authenticated, service_role;

commit;

-- 확인: select proname from pg_proc where proname like 'rsv_work_memo%';
