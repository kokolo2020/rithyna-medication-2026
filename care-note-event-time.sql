begin;
alter table public.care_notes add column occurred_at timestamptz;
alter table public.care_notes add constraint care_note_not_future
  check (occurred_at is null or occurred_at <= created_at);
grant insert(occurred_at) on public.care_notes to authenticated;
commit;
