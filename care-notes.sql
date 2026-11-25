-- Isolated care database only, after the base care schema.
begin;
create table public.care_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.care_actor_team() references public.care_teams(id) on delete restrict,
  author_id uuid not null default auth.uid(),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default statement_timestamp(),
  foreign key(author_id,team_id) references public.care_members(user_id,team_id) on delete restrict
);
create index care_notes_team_created_idx on public.care_notes(team_id,created_at desc,id desc);
alter table public.care_notes enable row level security;
revoke all on public.care_notes from public,anon,authenticated;
grant select on public.care_notes to authenticated;
grant insert(id,body) on public.care_notes to authenticated;
create policy care_notes_read on public.care_notes for select to authenticated
  using (team_id=(select public.care_actor_team()));
create policy care_notes_write on public.care_notes for insert to authenticated
  with check (team_id=(select public.care_actor_team()) and author_id=(select auth.uid()));
commit;
