-- Apply once in the Supabase SQL editor. No credentials or transaction data.
begin;
create table public.reward_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  state jsonb not null check (
    jsonb_typeof(state) = 'object'
    and state ?& array['months','actual','settings']
    and jsonb_typeof(state->'months') = 'object'
    and jsonb_typeof(state->'actual') = 'object'
    and jsonb_typeof(state->'settings') = 'object'
    and octet_length(state::text) <= 2000000
  ),
  updated_at timestamptz not null default now()
);
alter table public.reward_accounts enable row level security;
alter table public.reward_accounts force row level security;
revoke all on public.reward_accounts from anon, authenticated;
grant select on public.reward_accounts to authenticated;
create policy own_rewards_select on public.reward_accounts for select to authenticated
  using ((select auth.uid()) = owner_id);
-- Writes occur only through the compare-and-swap function. The owner is always
-- obtained from the verified session, never from a caller-supplied user ID.
create function public.save_rewards(expected_revision integer, new_state jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); next_revision integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if expected_revision is null or expected_revision < 0 or new_state is null then
    raise exception 'Invalid arguments' using errcode='22023';
  end if;
  if expected_revision = 0 then
    insert into public.reward_accounts(owner_id,revision,state)
    values (uid,1,new_state) on conflict (owner_id) do nothing
    returning revision into next_revision;
  else
    update public.reward_accounts set state=new_state,revision=revision+1,updated_at=now()
    where owner_id=uid and revision=expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Newer cloud revision exists' using errcode='40001'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_rewards(integer,jsonb) from public, anon;
grant execute on function public.save_rewards(integer,jsonb) to authenticated;
commit;
