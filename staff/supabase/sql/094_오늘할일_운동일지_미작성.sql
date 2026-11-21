-- 094 오늘 할 일 › 오늘 케어 (대표님 11/21): 운동일지 써야 하는 고객
--   오늘 예약(고객, 예약·완료) 중 오늘 운동일지(exercise_logs)가 아직 없는 고객.
-- 새 함수 1개만 만들어요. 표는 바꾸지 않아요. 읽기 전용.
--   work_exlog_today(p_branch) : [{customer_key, name, start_time, program, staff_name, status}]
-- 권한: 자기 지점만. 다른 직원 예약을 볼 권한(schedule.view_others)이 없으면 내 예약만.
-- 실행: Supabase SQL 편집기에 통째로 붙여 넣고 Run.
begin;

create or replace function public.work_exlog_today(p_branch text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me record; d date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into v_me from public.me();
  if v_me.id is null then raise exception 'NOT_STAFF'; end if;
  if not public.branch_ok(p_branch) then raise exception 'FORBIDDEN_BRANCH'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'customer_key', x.customer_key, 'name', x.customer_name, 'start_time', left(x.start_time::text, 5),
      'program', x.program, 'staff_name', x.staff_name, 'status', x.status
    ) order by x.start_time)
    from (
      select distinct on (r.customer_key) r.customer_key, r.customer_name, r.start_time, r.status,
        p.name as program, s.name as staff_name
      from public.rsv_reservations r
      left join public.rsv_programs p on p.id::text = r.program_id::text
      left join public.staff_accounts s on s.id::text = r.staff_id
      where r.branch = p_branch and r.day = d and r.kind = '고객' and r.customer_key is not null
        and r.status in ('예약', '완료')
        and (public.can('schedule.view_others') or r.staff_id = v_me.id::text or r.receiver = v_me.id::text)
        and not exists (select 1 from public.exercise_logs e where e.branch = r.branch and e.customer_key = r.customer_key and e.day = d)
      order by r.customer_key, r.start_time
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.work_exlog_today(text) from public, anon;
grant execute on function public.work_exlog_today(text) to authenticated, service_role;

commit;

-- 확인: select proname from pg_proc where proname = 'work_exlog_today';
