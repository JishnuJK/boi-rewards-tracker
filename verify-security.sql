-- Synthetic users and records exist only in this transaction; ROLLBACK retains
-- no test users or financial data. Any raised exception means verification failed.
begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select public.save_rewards(0,'{"months":{},"actual":{},"settings":{"slab":true,"extra":true,"star":true}}');
do $$ begin
 if (select count(*) from public.reward_accounts) <> 1 then raise exception 'Owner cannot read own row'; end if;
 begin
  perform public.save_rewards(0,'{"months":{},"actual":{},"settings":{}}');
  raise exception 'Stale write was accepted';
 exception when serialization_failure then null; end;
 if has_table_privilege('authenticated','public.reward_accounts','INSERT') or has_table_privilege('authenticated','public.reward_accounts','UPDATE') or has_table_privilege('authenticated','public.reward_accounts','DELETE') then raise exception 'Direct writes permitted'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
 if (select count(*) from public.reward_accounts) <> 0 then raise exception 'Cross-user read was allowed'; end if;
end $$;
select public.save_rewards(0,'{"months":{},"actual":{},"settings":{"slab":false,"extra":false,"star":false}}');
do $$ begin
 if (select count(*) from public.reward_accounts) <> 1 then raise exception 'Second user isolation failed'; end if;
 if has_table_privilege('anon','public.reward_accounts','SELECT') or has_function_privilege('anon','public.save_rewards(integer,jsonb)','EXECUTE') then raise exception 'Anonymous access permitted'; end if;
end $$;
reset role;
rollback;
select 'PASS: owner isolation, anonymous denial, direct-write denial, and stale-write protection' as verification;
