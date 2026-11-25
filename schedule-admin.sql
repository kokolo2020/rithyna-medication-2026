-- Apply only to the isolated care database after schema.sql.
begin;
create or replace function public.care_manage_slot(p_action text,p_slot_id uuid default null,
  p_time time without time zone default null,p_label text default null,p_items jsonb default null)
returns date language plpgsql security definer set search_path='' as $$
declare
  v_team uuid;
  v_prior public.care_slots%rowtype;
  v_today date := (statement_timestamp() at time zone 'Asia/Bangkok')::date;
  v_start date;
begin
  select team_id into v_team from public.care_members
    where user_id=(select auth.uid()) and active and role='papa' for share;
  if not found or coalesce((auth.jwt()->'app_metadata'->>'icare_schedule_admin'),'false') <> 'true' then
    raise exception using errcode='42501',message='Schedule administrator access required.';
  end if;
  if p_action is null or p_action not in ('add','edit','remove') then
    raise exception using errcode='22023',message='Invalid schedule change.';
  end if;
  if p_action<>'remove' and (p_time is null or p_time>=time '24:00:00' or extract(second from p_time)<>0
    or p_label is null or char_length(btrim(p_label)) not between 1 and 120
    or not coalesce(public.care_valid_items(p_items),false)) then
    raise exception using errcode='22023',message='Incomplete schedule.';
  end if;
  if p_action='add' then
    if p_slot_id is not null then raise exception using errcode='22023',message='Invalid new slot.'; end if;
    insert into public.care_slots(team_id,scheduled_time,label,items,starts_on)
      values(v_team,p_time,btrim(p_label),p_items,v_today);
    return v_today;
  end if;
  select * into v_prior from public.care_slots
    where id=p_slot_id and team_id=v_team and ends_before is null for update;
  if not found then raise exception using errcode='22023',message='Schedule changed. Refresh and review.'; end if;
  v_start := greatest(v_today+1,v_prior.starts_on);
  if v_prior.starts_on>v_today then
    -- No dose can have been recorded for a future version (enforced by care_log_entry).
    delete from public.care_slots where id=v_prior.id;
  else
    update public.care_slots set ends_before=v_start where id=v_prior.id;
  end if;
  if p_action='edit' then
    insert into public.care_slots(team_id,schedule_key,scheduled_time,label,items,starts_on)
      values(v_team,v_prior.schedule_key,p_time,btrim(p_label),p_items,v_start);
  end if;
  return v_start;
end $$;
revoke all on function public.care_manage_slot(text,uuid,time without time zone,text,jsonb) from public, anon, authenticated;
grant execute on function public.care_manage_slot(text,uuid,time without time zone,text,jsonb) to authenticated;
commit;
