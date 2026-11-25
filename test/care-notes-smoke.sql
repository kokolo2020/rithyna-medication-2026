begin;
insert into auth.users(id) values ('67000000-0000-4000-8000-000000000001'),('67000000-0000-4000-8000-000000000002');
insert into public.care_teams(id,display_name) values ('68000000-0000-4000-8000-000000000001','Team one'),('68000000-0000-4000-8000-000000000002','Team two');
insert into public.care_members(user_id,team_id,display_name,role) values
 ('67000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001','Parent','papa'),
 ('67000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000002','Other parent','papa');
set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000001"}';
insert into public.care_notes(id,body) values('69000000-0000-4000-8000-000000000001','Fixture only');
do $$ begin
 if not exists(select from public.care_notes where author_id=auth.uid() and created_at is not null) then raise exception 'Owner could not read note'; end if;
 begin
  insert into public.care_notes(body,team_id) values('Fixture only','68000000-0000-4000-8000-000000000002');
  raise exception 'Arbitrary team accepted';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000002"}';
do $$ begin
 if exists(select from public.care_notes) then raise exception 'Cross-team disclosure'; end if;
end $$;
set local role anon;
do $$ begin
 perform 1 from public.care_notes;
 raise exception 'Anonymous access allowed';
exception when insufficient_privilege then null; end $$;
rollback;
