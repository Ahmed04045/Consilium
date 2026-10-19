-- Additive migration: existing community/event tables are untouched.
begin;
create table if not exists public.consilium_calendar_snapshots (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision > 0),
 payload jsonb not null check(jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 5000000),
 updated_at timestamptz not null default now()
);
alter table public.consilium_calendar_snapshots enable row level security;
revoke all on public.consilium_calendar_snapshots from anon, authenticated;
grant select on public.consilium_calendar_snapshots to authenticated;
create policy consilium_read_own on public.consilium_calendar_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create or replace function public.consilium_save_calendar(expected_revision bigint, workspace jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); next_revision bigint;
begin
 if current_user_id is null then raise exception 'Authentication required'; end if;
 if expected_revision = 0 then
  insert into public.consilium_calendar_snapshots(user_id,revision,payload) values(current_user_id,1,workspace) on conflict do nothing returning revision into next_revision;
 else
  update public.consilium_calendar_snapshots set payload=workspace,revision=revision+1,updated_at=now() where user_id=current_user_id and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Sync conflict'; end if;
 return next_revision;
end $$;
revoke all on function public.consilium_save_calendar(bigint,jsonb) from public,anon;
grant execute on function public.consilium_save_calendar(bigint,jsonb) to authenticated;
commit;
