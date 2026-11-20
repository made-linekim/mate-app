-- 031 settings_v1 (DRAFT, 2026-11-20) : 직원앱 '설정' 메뉴 1차 (업무시간 · 휴무 · 관리 항목 · 회원권 상품)
-- 표 변경 없음. 쓰기는 모두 security definer RPC + can('settings.edit') + 지점 검사.
-- 전 지점 공용(관리 항목, branch='' 상품)은 대표관리자만 바꿀 수 있어요.

create or replace function public.settings_get(p_branch text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not public.branch_ok(p_branch) then null else jsonb_build_object(
    'hours', coalesce((select value from rsv_settings where key='hours' and scope=p_branch),
      '{"days":[{"d":0,"open":false,"s":"10:00","e":"21:00"},{"d":1,"open":true,"s":"09:30","e":"21:00"},{"d":2,"open":true,"s":"09:30","e":"21:00"},{"d":3,"open":true,"s":"09:30","e":"21:00"},{"d":4,"open":true,"s":"09:30","e":"21:00"},{"d":5,"open":true,"s":"09:30","e":"21:00"},{"d":6,"open":true,"s":"10:00","e":"18:00"}],"lunch":null}'::jsonb),
    'closed_weekdays', coalesce((select value from rsv_settings where key='closed_weekdays' and scope=p_branch), '[]'::jsonb),
    'can_edit', public.can('settings.edit'),
    'is_owner', coalesce((select m.tier='owner' from public.me() m), false)
  ) end
$$;

create or replace function public.settings_set(p_branch text, p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.can('settings.edit') and public.branch_ok(p_branch)) then raise exception 'permission denied'; end if;
  if p_key not in ('hours','closed_weekdays') then raise exception 'unknown key'; end if;
  insert into rsv_settings(key, scope, value, updated_by, updated_at)
  values (p_key, p_branch, p_value, (select name from public.me()), now())
  on conflict (key, scope) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end $$;

create or replace function public.holiday_add(p_branch text, p_day date, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.can('settings.edit') and public.branch_ok(p_branch)) then raise exception 'permission denied'; end if;
  insert into rsv_holidays(branch, day, reason, created_by) values (p_branch, p_day, left(coalesce(p_reason,''),100), (select name from public.me()))
  on conflict (branch, day) do update set reason = excluded.reason;
end $$;

create or replace function public.holiday_del(p_branch text, p_day date)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not (public.can('settings.edit') and public.branch_ok(p_branch)) then raise exception 'permission denied'; end if;
  delete from rsv_holidays where branch = p_branch and day = p_day;
end $$;

-- 관리 항목 전체(비활성 포함) 보기
create or replace function public.program_admin_list()
returns setof rsv_programs language sql stable security definer set search_path to 'public' as $$
  select * from rsv_programs where (select id from public.me()) is not null order by sort, name
$$;

create or replace function public.program_save(p jsonb)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_id text := nullif(p->>'id','');
begin
  if not coalesce((select tier='owner' from public.me()), false) then raise exception 'permission denied'; end if;
  if v_id is null then
    v_id := 'g_' || substr(md5(random()::text), 1, 8);
    insert into rsv_programs(id, name) values (v_id, p->>'name');
  end if;
  update rsv_programs set
    name = coalesce(nullif(p->>'name',''), name), short = coalesce(p->>'short', short),
    grp = coalesce(p->>'grp', grp), color = coalesce(p->>'color', color),
    minutes = coalesce((p->>'minutes')::int, minutes), unit_price = coalesce((p->>'unit_price')::int, unit_price),
    capacity = coalesce((p->>'capacity')::int, capacity), sort = coalesce((p->>'sort')::int, sort),
    active = coalesce((p->>'active')::boolean, active),
    branches = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'branches') x), branches),
    updated_by = (select name from public.me()), updated_at = now()
  where id = v_id;
  return v_id;
end $$;

create or replace function public.product_save(p jsonb)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_id text := nullif(p->>'id',''); v_branch text;
begin
  v_branch := coalesce(p->>'branch', (select branch from rsv_products where id = v_id), '');
  if not public.can('settings.edit') then raise exception 'permission denied'; end if;
  if v_branch = '' and not coalesce((select tier='owner' from public.me()), false) then raise exception 'permission denied'; end if;
  if v_branch <> '' and not public.branch_ok(v_branch) then raise exception 'permission denied'; end if;
  if v_id is not null and (select branch from rsv_products where id = v_id) is distinct from v_branch
     and not coalesce((select tier='owner' from public.me()), false) then raise exception 'permission denied'; end if;
  if v_id is null then
    v_id := 'p_' || substr(md5(random()::text), 1, 8);
    insert into rsv_products(id, branch, name, kind) values (v_id, v_branch, p->>'name', coalesce(p->>'kind','회차'));
  end if;
  update rsv_products set
    branch = v_branch, name = coalesce(nullif(p->>'name',''), name), kind = coalesce(p->>'kind', kind),
    valid_days = coalesce((p->>'valid_days')::int, valid_days), price = coalesce((p->>'price')::int, price),
    face_amount = coalesce((p->>'face_amount')::int, face_amount),
    share_ok = coalesce((p->>'share_ok')::boolean, share_ok), app_visible = coalesce((p->>'app_visible')::boolean, app_visible),
    on_sale = coalesce((p->>'on_sale')::boolean, on_sale), items = coalesce(p->'items', items),
    sort = coalesce((p->>'sort')::int, sort), updated_by = (select name from public.me()), updated_at = now()
  where id = v_id;
  return v_id;
end $$;

do $$ declare f text; begin
  foreach f in array array['settings_get(text)','settings_set(text,text,jsonb)','holiday_add(text,date,text)','holiday_del(text,date)',
                           'program_admin_list()','program_save(jsonb)','product_save(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
