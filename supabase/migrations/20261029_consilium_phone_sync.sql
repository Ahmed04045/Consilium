-- Additive. Does not alter the community app or legacy calendar tables.
begin;
create schema if not exists consilium_private;
revoke all on schema consilium_private from public, anon, authenticated;
create table consilium_private.sync_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), reads integer not null default 0,
 writes integer not null default 0
);
create table public.consilium_phone_snapshots (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision > 0),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2000000),
 updated_at timestamptz not null default now()
);
alter table public.consilium_phone_snapshots enable row level security;
alter table consilium_private.sync_limits enable row level security;
revoke all on public.consilium_phone_snapshots from public, anon, authenticated;
revoke all on consilium_private.sync_limits from public, anon, authenticated;
-- All access goes through bounded RPCs. No direct table privileges.
create function consilium_private.check_sync_limit(is_write boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); r consilium_private.sync_limits;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then
  raise exception 'Confirmed account required' using errcode='PT403';
 end if;
 insert into consilium_private.sync_limits(user_id) values(u) on conflict do nothing;
 select * into r from consilium_private.sync_limits where user_id=u for update;
 if r.window_start < now()-interval '1 minute' then
  update consilium_private.sync_limits set window_start=now(),reads=0,writes=0 where user_id=u;
  r.reads:=0; r.writes:=0;
 end if;
 if (is_write and r.writes>=10) or (not is_write and r.reads>=60) then raise exception 'Sync rate limit exceeded' using errcode='PT429'; end if;
 update consilium_private.sync_limits set reads=reads+case when is_write then 0 else 1 end,
 writes=writes+case when is_write then 1 else 0 end where user_id=u;
 return u;
end $$;
revoke all on function consilium_private.check_sync_limit(boolean) from public, anon, authenticated;
create function public.consilium_phone_read() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := consilium_private.check_sync_limit(false); result jsonb;
begin
 select jsonb_build_object('revision',revision,'payload',payload,'updated_at',updated_at)
 into result from public.consilium_phone_snapshots where user_id=u;
 return coalesce(result,jsonb_build_object('revision',0,'payload',null));
end $$;
create function public.consilium_phone_save(expected_revision bigint, workspace jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare u uuid := consilium_private.check_sync_limit(true); result bigint; k text;
begin
 if expected_revision is null or expected_revision<0 or workspace is null or
 jsonb_typeof(workspace)<>'object' or workspace->>'schema_version' is distinct from '1' or
 octet_length(workspace::text)>2000000 then raise exception 'Invalid sync payload'; end if;
 if exists(select 1 from jsonb_object_keys(workspace) x where x not in ('schema_version','calendars','labels','tasks','occurrences')) then raise exception 'Unsupported sync fields'; end if;
 foreach k in array array['calendars','labels','tasks','occurrences'] loop
  if jsonb_typeof(workspace->k) is distinct from 'array' then raise exception 'Missing record array'; end if;
  if jsonb_array_length(workspace->k)>5000 then raise exception 'Too many records'; end if;
 end loop;
 if expected_revision=0 then
  insert into public.consilium_phone_snapshots(user_id,revision,payload) values(u,1,workspace)
  on conflict do nothing returning revision into result;
 else
  update public.consilium_phone_snapshots set payload=workspace,revision=revision+1,updated_at=now()
  where user_id=u and revision=expected_revision returning revision into result;
 end if;
 if result is null then raise exception 'Sync conflict' using errcode='PT409'; end if;
 return result;
end $$;
revoke all on function public.consilium_phone_read() from public,anon;
revoke all on function public.consilium_phone_save(bigint,jsonb) from public,anon;
grant execute on function public.consilium_phone_read() to authenticated;
grant execute on function public.consilium_phone_save(bigint,jsonb) to authenticated;
commit;
