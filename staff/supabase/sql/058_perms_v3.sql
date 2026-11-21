-- 058 권한 화면 v3 (메라 시안 U-PC-SET-12) · 2026-11-21 · SQL 편집기에서 한 번에 실행하세요.
-- 바뀌는 것
--  1) 권한 키 2개 추가: 환불(sales.refund, 대표관리자만 줄 수 있음) · 회원권 조정(membership.adjust)
--     시안의 직원별 권한 6칸 = 결제 취소 · 환불 · 회원권 조정 · 매출 보기 · 권한 관리 · 광고비
--  2) perm_log_list(): 대표관리자가 [변경 기록]에서 권한 바뀐 기록을 봐요 (permission_logs 읽기 전용)
-- 고객 데이터는 건드리지 않아요. 표 구조 변경 없음.

begin;

insert into public.perm_catalog(key, menu, label, owner_only, sort) values
  ('sales.refund', '매출', '환불', true, 41),
  ('membership.adjust', '고객', '회원권 조정 (횟수·기간)', false, 42)
on conflict (key) do nothing;

create or replace function public.perm_log_list(p_limit int default 50)
returns table(at timestamptz, actor_name text, target_type text, target_name text, summary text, before_txt text, after_txt text)
language sql stable security definer set search_path to 'public' as $$
  select l.at, l.actor_name, l.target_type, l.target_name, l.summary, l.before_txt, l.after_txt
  from public.permission_logs l
  where (select tier from public.me()) = 'owner'
  order by l.at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.perm_log_list(int) from public, anon;
grant execute on function public.perm_log_list(int) to authenticated, service_role;

commit;
