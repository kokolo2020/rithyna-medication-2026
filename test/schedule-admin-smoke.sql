begin;
insert into auth.users(id) values ('60000000-0000-4000-8000-000000000001'),('60000000-0000-4000-8000-000000000002'),('60000000-0000-4000-8000-000000000003');
insert into public.care_teams(id,display_name) values ('61000000-0000-4000-8000-000000000001','Synthetic first'),('61000000-0000-4000-8000-000000000002','Synthetic other');
insert into public.care_members(user_id,team_id,display_name,role) values
 ('60000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Synthetic parent','papa'),
 ('60000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000001','Synthetic nurse','nurse'),
 ('60000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','Other parent','papa');
set local role authenticated;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-000000000002","app_metadata":{"icare_schedule_admin":true}}';
do $$ begin
  perform public.care_manage_slot('add',null,'06:05','Synthetic','[{"name":"Sample","amount":"1 unit"}]');
  raise exception 'A nurse could add';
exception when insufficient_privilege then null; end $$;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-000000000001","user_metadata":{"icare_schedule_admin":true}}';
do $$ begin
  perform public.care_manage_slot('add',null,'06:05','Synthetic','[{"name":"Sample","amount":"1 unit"}]');
  raise exception 'An unprovisioned parent could add';
exception when insufficient_privilege then null; end $$;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-000000000001","app_metadata":{"icare_schedule_admin":true}}';
select public.care_manage_slot('add',null,'00:00','Synthetic','[{"name":"Sample","amount":"1 unit"}]');
do $$
declare
  d date := (statement_timestamp() at time zone 'Asia/Bangkok')::date;
  s uuid;
  next_id uuid;
begin
  select id into strict s from public.care_slots;
  perform set_config('care_smoke.target',s::text,true);
  perform public.care_log_entry(s,d,d,'00:00');
  begin
    perform public.care_manage_slot('add',null,'00:00','Duplicate','[{"name":"Sample","amount":"1 unit"}]');
    raise exception 'A duplicate was accepted';
  exception when exclusion_violation then null;
  end;
  if public.care_manage_slot('edit',s,'06:05','Replacement','[{"name":"Replacement","amount":"1 unit"}]')<>d+1 then raise exception 'Incorrect effective date'; end if;
  if not exists(select from public.care_slots where id=s and ends_before=d+1) then raise exception 'Prior schedule not preserved'; end if;
  if not exists(select from public.care_entries where slot_id=s and items->0->>'name'='Sample') then raise exception 'Prior record not preserved'; end if;
  select id into strict next_id from public.care_slots where label='Replacement';
  perform public.care_manage_slot('remove',next_id);
  if exists(select from public.care_slots where id=next_id) then raise exception 'Pending replacement still present'; end if;
end $$;
set local request.jwt.claims = '{"sub":"60000000-0000-4000-8000-000000000003","app_metadata":{"icare_schedule_admin":true}}';
do $$ begin
  perform public.care_manage_slot('remove',current_setting('care_smoke.target')::uuid);
  raise exception 'Another team could remove';
exception when invalid_parameter_value then null; end $$;
rollback;
