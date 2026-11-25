-- Fresh workspace only. Apply to a newly provisioned Supabase project as postgres.
-- No samples, names, schedules, accounts, or shipped credentials are inserted.
begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.care_teams (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120)
);

create table public.care_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  team_id uuid not null references public.care_teams(id) on delete restrict,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  role text not null check (role in ('papa','nurse')),
  active boolean not null default true,
  unique(user_id, team_id)
);
create index care_members_team_idx on public.care_members (team_id);

create function public.care_valid_items(p_items jsonb) returns boolean
language plpgsql immutable strict set search_path=''
as $$
declare v_item jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' then return false; end if;
  if jsonb_array_length(p_items) not between 1 and 24 then return false; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item->'name') is distinct from 'string'
      or jsonb_typeof(v_item->'amount') is distinct from 'string'
      or char_length(btrim(v_item->>'name')) not between 1 and 120
      or char_length(btrim(v_item->>'amount')) not between 1 and 120
      or (v_item - 'name' - 'amount') <> '{}'::jsonb then
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.care_valid_items(jsonb) from public, anon, authenticated;

create table public.care_slots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.care_teams(id) on delete restrict,
  -- Keep schedule_key when closing one version and creating a new version of the same logical slot.
  schedule_key uuid not null default gen_random_uuid(),
  scheduled_time time(0) without time zone not null
    check (scheduled_time < time '24:00:00' and extract(second from scheduled_time) = 0),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  items jsonb not null check (public.care_valid_items(items)),
  starts_on date not null check (starts_on >= date '2000-01-01'),
  ends_before date check (ends_before > starts_on),
  unique(id, team_id),
  exclude using gist (team_id with =, schedule_key with =, daterange(starts_on,ends_before,'[)') with &&),
  exclude using gist (team_id with =, scheduled_time with =, daterange(starts_on,ends_before,'[)') with &&)
);
create index care_slots_team_time_idx on public.care_slots (team_id, scheduled_time);

create table public.care_entries (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.care_teams(id) on delete restrict,
  slot_id uuid not null,
  schedule_key uuid not null,
  slot_label text not null,
  scheduled_time time(0) without time zone not null,
  scheduled_date date not null,
  actual_date date not null,
  actual_time time(0) without time zone not null,
  given_by_id uuid not null,
  given_by_name text not null,
  logged_by_id uuid not null,
  logged_by_name text not null,
  items jsonb not null check (public.care_valid_items(items)),
  note text not null default '' check (char_length(note) <= 1000),
  recorded_at timestamptz not null default now(),
  foreign key (slot_id, team_id) references public.care_slots(id,team_id) on delete restrict,
  foreign key (given_by_id, team_id) references public.care_members(user_id,team_id) on delete restrict,
  foreign key (logged_by_id, team_id) references public.care_members(user_id,team_id) on delete restrict,
  unique(team_id, schedule_key, scheduled_date)
);
create index care_entries_history_idx on public.care_entries (team_id, actual_date desc, actual_time desc, id desc);

create function public.care_lock_slot_version() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  -- A future revision is a new row. Do not rewrite the medicines associated with a prior date.
  if new.id <> old.id or new.team_id <> old.team_id or new.schedule_key <> old.schedule_key
    or new.scheduled_time <> old.scheduled_time or new.label <> old.label
    or new.items <> old.items or new.starts_on <> old.starts_on then
    raise exception using errcode='22023', message='Schedule versions are immutable.';
  end if;
  if new.ends_before is distinct from old.ends_before and
    (old.ends_before is not null or new.ends_before is null
      or new.ends_before <= (statement_timestamp() at time zone 'Asia/Bangkok')::date
      or exists (select from public.care_entries e where e.slot_id=old.id and e.scheduled_date>=new.ends_before)) then
    raise exception using errcode='22023', message='Close an open slot at a future date without historical entries.';
  end if;
  return new;
end $$;
revoke all on function public.care_lock_slot_version() from public, anon, authenticated;
create trigger care_slot_version_immutable before update on public.care_slots
for each row execute function public.care_lock_slot_version();

-- A separate definer helper avoids a recursive membership policy. Neither helper accepts a user ID.
create function public.care_actor_team() returns uuid
language sql stable security definer set search_path=''
as $$
  select m.team_id from public.care_members m where m.user_id=(select auth.uid()) and m.active
$$;
create function public.care_actor_is_papa_for(p_team uuid) returns boolean
language sql stable security definer set search_path=''
as $$
  select exists (select from public.care_members m where m.user_id=(select auth.uid())
                    and m.team_id=p_team and m.active and m.role='papa')
$$;
revoke all on function public.care_actor_team() from public, anon, authenticated;
revoke all on function public.care_actor_is_papa_for(uuid) from public, anon, authenticated;
grant execute on function public.care_actor_team() to authenticated;
grant execute on function public.care_actor_is_papa_for(uuid) to authenticated;

alter table public.care_teams enable row level security;
alter table public.care_members enable row level security;
alter table public.care_slots enable row level security;
alter table public.care_entries enable row level security;
revoke all on public.care_teams,public.care_members,public.care_slots,public.care_entries from public,anon,authenticated;
grant select on public.care_members,public.care_slots,public.care_entries to authenticated;
create policy care_members_read on public.care_members as permissive for select to authenticated
  using (active and (public.care_actor_is_papa_for(team_id) or user_id=(select auth.uid())));
create policy care_slots_read on public.care_slots as permissive for select to authenticated
  using (team_id=(select public.care_actor_team()));
create policy care_entries_read on public.care_entries as permissive for select to authenticated
  using (team_id=(select public.care_actor_team()));

-- Database is the authority for role, active membership, team, schedule version and snapshots.
-- The single INSERT and uniqueness protect simultaneous clicks from separate devices.
create function public.care_log_entry(p_slot_id uuid, p_scheduled_date date, p_actual_date date,
  p_actual_time time without time zone, p_note text default '', p_given_by_id uuid default null)
returns public.care_entries
language plpgsql volatile security definer set search_path=''
as $$
declare
  v_actor public.care_members%rowtype;
  v_giver public.care_members%rowtype;
  v_slot public.care_slots%rowtype;
  v_entry public.care_entries%rowtype;
  v_now timestamp without time zone := statement_timestamp() at time zone 'Asia/Bangkok';
begin
  select m.* into v_actor from public.care_members m
    where m.user_id=(select auth.uid()) and m.active for share;
  if not found then
    raise exception using errcode='42501', message='No active membership.';
  end if;
  if p_given_by_id is not null and v_actor.role <> 'papa' then
    raise exception using errcode='42501', message='Delegated logging is not allowed.';
  end if;
  if p_scheduled_date is null or p_actual_date is null or p_actual_time is null
    or p_scheduled_date < date '2000-01-01' or p_actual_date < date '2000-01-01'
    or p_scheduled_date > v_now::date or p_actual_date + p_actual_time > v_now
    or p_actual_time >= time '24:00:00' or extract(second from p_actual_time) <> 0
    or abs(p_actual_date-p_scheduled_date)>1 or char_length(coalesce(p_note,''))>1000 then
    raise exception using errcode='22023', message='Invalid scheduled date or actual date/time.';
  end if;
  select s.* into v_slot from public.care_slots s where s.id=p_slot_id
    and s.team_id=v_actor.team_id and s.starts_on<=p_scheduled_date
    and (s.ends_before is null or p_scheduled_date<s.ends_before) for share;
  if not found then
    raise exception using errcode='22023', message='Slot not available on this date.';
  end if;
  if p_given_by_id is null or p_given_by_id=v_actor.user_id then
    v_giver := v_actor;
  else
    select m.* into v_giver from public.care_members m where m.user_id=p_given_by_id
      and m.team_id=v_actor.team_id and m.active for share;
    if not found then
      raise exception using errcode='42501', message='Given-by caregiver is not available.';
    end if;
  end if;
  insert into public.care_entries(team_id,slot_id,schedule_key,slot_label,scheduled_time,scheduled_date,
    actual_date,actual_time,given_by_id,given_by_name,logged_by_id,logged_by_name,items,note)
  values (v_actor.team_id,v_slot.id,v_slot.schedule_key,v_slot.label,v_slot.scheduled_time,p_scheduled_date,
    p_actual_date,p_actual_time,v_giver.user_id,v_giver.display_name,v_actor.user_id,v_actor.display_name,
    v_slot.items,btrim(coalesce(p_note,''))) returning * into v_entry;
  return v_entry;
end $$;
revoke all on function public.care_log_entry(uuid,date,date,time without time zone,text,uuid) from public,anon,authenticated;
grant execute on function public.care_log_entry(uuid,date,date,time without time zone,text,uuid) to authenticated;
commit;
