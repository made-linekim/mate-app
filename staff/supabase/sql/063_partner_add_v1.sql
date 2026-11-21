-- 063 제휴 · 업체 추가 / 추가 요청 / 되돌리기 (시안 MKT-5-ADD)
-- 실행: Supabase SQL 편집기에 통째로 붙여 실행. partners 에 연락처 칸 1개, 새 표 1개(추가 요청), 함수 4개.
begin;

alter table public.partners add column if not exists contact_phone text;

create table if not exists public.mkt_partner_requests (      -- 직원의 업체 추가 요청 (관리자 이상이 확인)
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  name text not null,
  industry text,
  owner text,
  phone text,
  status text not null default '요청' check (status in ('요청','추가','반려')),
  by_name text,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);
alter table public.mkt_partner_requests enable row level security;
revoke all on public.mkt_partner_requests from public, anon, authenticated;
grant select, insert, update, delete on public.mkt_partner_requests to service_role;

-- 1) 업체 추가 (관리자 이상, 또는 마케팅 편집 권한)
create or replace function public.mkt_partner_add(p_branch text, p_name text, p_industry text, p_owner text, p_phone text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_id uuid;
begin
  v := public.mkt_guard(p_branch, true);
  if p_branch is null or coalesce(btrim(p_name), '') = '' or length(p_name) > 60 or length(coalesce(p_phone,'')) > 20 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  insert into public.partners(branch, name, industry, owner, contact_phone, stage, created_on)
  values (p_branch, btrim(p_name), nullif(btrim(coalesce(p_industry,'')),''), coalesce(nullif(btrim(coalesce(p_owner,'')),''), v.name), nullif(btrim(coalesce(p_phone,'')),''), '진행', current_date)
  returning id into v_id;
  perform public.mkt_log(v, p_branch, format('제휴 업체 추가 %s · %s', btrim(p_name), p_branch));
  return v_id;
end $$;

-- 2) 되돌리기: 추가한 지 10분 안, 소개·연락 기록이 없을 때만
create or replace function public.mkt_partner_undo(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; p public.partners;
begin
  select * into p from public.partners where id = p_id;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  v := public.mkt_guard(p.branch, true);
  if p.created_on <> current_date or exists (select 1 from public.partner_contacts c where c.partner_id = p_id) then raise exception 'CANNOT_UNDO' using errcode = '22023'; end if;
  if not exists (select 1 from public.mkt_change_log l where l.branch = p.branch and l.body = format('제휴 업체 추가 %s · %s', p.name, p.branch) and l.at > now() - interval '10 minutes') then
    raise exception 'CANNOT_UNDO' using errcode = '22023'; end if;
  delete from public.partners where id = p_id;
  perform public.mkt_log(v, p.branch, format('제휴 업체 추가 되돌림 %s · %s', p.name, p.branch));
end $$;

-- 3) 직원: 추가 요청만 (관리자 이상 확인 후 추가)
create or replace function public.mkt_partner_request(p_branch text, p_name text, p_industry text, p_owner text, p_phone text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v public.staff_accounts; v_id uuid;
begin
  v := public.mkt_guard(p_branch);
  if p_branch is null or coalesce(btrim(p_name), '') = '' or length(p_name) > 60 or length(coalesce(p_phone,'')) > 20 then raise exception 'BAD_INPUT' using errcode = '22023'; end if;
  insert into public.mkt_partner_requests(branch, name, industry, owner, phone, by_name)
  values (p_branch, btrim(p_name), nullif(btrim(coalesce(p_industry,'')),''), nullif(btrim(coalesce(p_owner,'')),''), nullif(btrim(coalesce(p_phone,'')),''), v.name)
  returning id into v_id;
  return v_id;
end $$;

-- 4) 담당 고르기용 직원 이름
create or replace function public.mkt_staff_names(p_branch text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v public.staff_accounts;
begin
  v := public.mkt_guard(p_branch);
  return coalesce((select jsonb_agg(jsonb_build_object('name', name) order by name)
    from public.staff_accounts where status = 'active' and (p_branch is null or branch = p_branch)), '[]'::jsonb);
end $$;

revoke all on function public.mkt_partner_add(text, text, text, text, text) from public, anon;
revoke all on function public.mkt_partner_undo(uuid) from public, anon;
revoke all on function public.mkt_partner_request(text, text, text, text, text) from public, anon;
revoke all on function public.mkt_staff_names(text) from public, anon;
grant execute on function public.mkt_partner_add(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.mkt_partner_undo(uuid) to authenticated, service_role;
grant execute on function public.mkt_partner_request(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.mkt_staff_names(text) to authenticated, service_role;

commit;
