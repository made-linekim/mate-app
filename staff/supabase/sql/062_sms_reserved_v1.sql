-- 062 문자 · 예약 문자함 (시안 MKT-0 '예약 문자함' 버튼, MKT-4-DONE 예약됨 · 예약 취소)
-- 실행: Supabase SQL 편집기에 통째로 붙여 실행. 표 1개에 칸 2개 추가 + 함수 2개. 기존 자료는 지우지 않아요.
-- 문자 실제 발송(알리고 연결)은 다른 작업이라 여기서 건드리지 않아요. 예약 '기록'만 보고 취소합니다.
begin;

alter table public.mkt_sms_pick_sends add column if not exists canceled_at timestamptz;
alter table public.mkt_sms_pick_sends add column if not exists canceled_by text;

-- 1) 예약 문자함: 아직 보내지 않은(예약 시각이 지나지 않은) 예약 + 최근 7일 취소분
create or replace function public.mkt_sms_reserved_list(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'branch', s.branch, 'audience', s.audience, 'body', s.body, 'count', s.target_count,
      'at', s.scheduled_at, 'made_at', s.sent_at, 'by', s.by_name, 'by_tier', (select a.tier from public.staff_accounts a where a.name = s.by_name and a.branch = s.branch limit 1),
      'pick_title', (select title from public.mkt_sms_picks k where k.id = s.pick_id),
      'canceled_at', s.canceled_at, 'canceled_by', s.canceled_by,
      'can_cancel', s.canceled_at is null and s.scheduled_at > now() and (v.tier in ('owner','manager') or s.by_name = v.name))
      order by s.scheduled_at)
    from public.mkt_sms_pick_sends s
    where s.scheduled_at is not null and (p_branch is null or s.branch = p_branch)
      and ((s.canceled_at is null and s.scheduled_at > now()) or s.canceled_at > now() - interval '7 days')), '[]'::jsonb);
end $$;

-- 2) 예약 취소: 예약한 본인 또는 관리자 이상, 보내기 전만
create or replace function public.mkt_sms_reserved_cancel(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; r public.mkt_sms_pick_sends;
begin
  select * into r from public.mkt_sms_pick_sends where id = p_id;
  if r.id is null then raise exception 'NOT_FOUND'; end if;
  v := public.mkt_guard(r.branch);
  if r.scheduled_at is null or r.canceled_at is not null or r.scheduled_at <= now() then raise exception 'ALREADY_SENT' using errcode = '22023'; end if;
  if v.tier not in ('owner','manager') and coalesce(r.by_name,'') <> v.name then raise exception 'NO_PERMISSION' using errcode = '42501'; end if;
  update public.mkt_sms_pick_sends set canceled_at = now(), canceled_by = v.name where id = p_id;
  perform public.mkt_log(v, r.branch, format('예약 문자 취소 %s명 · %s', r.target_count, to_char(r.scheduled_at at time zone 'Asia/Seoul', 'MM.DD HH24:MI')));
end $$;

revoke all on function public.mkt_sms_reserved_list(text) from public, anon;
revoke all on function public.mkt_sms_reserved_cancel(uuid) from public, anon;
grant execute on function public.mkt_sms_reserved_list(text) to authenticated, service_role;
grant execute on function public.mkt_sms_reserved_cancel(uuid) to authenticated, service_role;

commit;
