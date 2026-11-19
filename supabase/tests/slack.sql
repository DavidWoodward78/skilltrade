-- Slack integration: database rules.
-- Covers the accept/accept and accept/pass flows, idempotency, and community isolation.
-- Every check raises an error if it fails, so `psql -v ON_ERROR_STOP=1 -f` exits non-zero.
-- Runs as superuser for setup, then as authenticated / service_role, like scenario.sql.
-- Wrapped in a transaction and rolled back, but still: run it against a LOCAL database only.
-- Easiest: npm run test:db (needs `supabase start`).
\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
begin;  -- everything below is rolled back at the end
\set A '''00000000-0000-0000-0000-0000000000a1'''
\set B '''00000000-0000-0000-0000-0000000000b1'''
\set E '''00000000-0000-0000-0000-0000000000e1'''
\set C '''00000000-0000-0000-0000-0000000000c2'''
\set S '''00000000-0000-0000-0000-0000000000d1'''
\set T '''00000000-0000-0000-0000-0000000000d2'''

create schema if not exists slack_test;
create or replace function slack_test.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
grant usage on schema slack_test to authenticated, service_role;
grant execute on function slack_test.ok(boolean, text) to authenticated, service_role;

-- Ann, Bob, Eve in Org One (team T1). Cat in Org Two (team T2).
insert into auth.users (id, email) values
  (:A, 'ann@x.com'), (:B, 'bob@x.com'), (:E, 'eve@x.com'), (:C, 'cat@x.com'), (:S, 'sam@x.com'), (:T, 'tia@x.com');
set role authenticated;
set request.jwt.claim.sub = :A;
select id as org1 from create_org('Org One') \gset
set request.jwt.claim.sub = :C;
select id as org2 from create_org('Org Two') \gset
reset role;
update organizations set require_approval = false where id = :'org1';
insert into memberships (org_id, user_id) values (:'org1', :B), (:'org1', :E);
insert into user_skills (user_id, kind, category, skill) values (:A, 'offer', 'Development', 'Next.js'), (:A, 'need', 'Marketing', 'SEO');

-- Link workspaces through the server-only RPC.
set role service_role;
select slack_test.ok(slack_link_workspace(:'org1', 'T1', 'One', 'A1', 'UBOT1', 'v1.x.y.z', 'chat:write', :A) = 'linked', 'link T1 to org1');
select slack_test.ok(slack_link_workspace(:'org2', 'T2', 'Two', 'A1', 'UBOT2', 'v1.x.y.z', 'chat:write', :C) = 'linked', 'link T2 to org2');
select slack_test.ok(slack_link_workspace(:'org2', 'T1', 'One', 'A1', 'UBOT1', 'v1.x.y.z', 'chat:write', :C) = 'linked_elsewhere',
  'a workspace linked to one community cannot be linked to another');
update memberships set slack_user_id = 'UA' where org_id = :'org1' and user_id = :A;
update memberships set slack_user_id = 'UB' where org_id = :'org1' and user_id = :B;
update memberships set slack_user_id = 'UE' where org_id = :'org1' and user_id = :E;
update memberships set slack_user_id = 'UC' where org_id = :'org2' and user_id = :C;
reset role;

-- ---------------------------------------------------------------------------
-- Accept / accept
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = :A;
insert into interests (org_id, from_user, to_user) values (:'org1', :A, :B);
reset role;
select slack_test.ok((select count(*) from slack_outbox where kind = 'interest_card' and payload->>'to_user' = :B) = 1,
  'interest queues one card for Bob');

set role service_role;
select slack_test.ok(slack_interest_context(:'org1', :A, :B)->'from'->>'display_name' = 'ann', 'card context names Ann');
select slack_test.ok(jsonb_array_length(slack_interest_context(:'org1', :A, :B)->'from'->'offers') = 1, 'card context lists what Ann offers');
insert into slack_cards (org_id, from_user, to_user, channel_id, message_ts) values (:'org1', :A, :B, 'DB', '1.1') returning id as card_ab \gset
select slack_test.ok(slack_respond_card(:'card_ab', 'T2', 'UB', true)->>'status' = 'not_found', 'a click from another workspace is ignored');
select slack_test.ok(slack_respond_card(:'card_ab', 'T1', 'UE', true)->>'status' = 'not_found', 'a click by someone other than the recipient is ignored');
select slack_respond_card(:'card_ab', 'T1', 'UB', true) as r \gset
select slack_test.ok((:'r'::jsonb)->>'status' = 'interested' and (:'r'::jsonb)->>'match_id' is not null, 'Bob accepting creates the match');
select slack_test.ok(slack_respond_card(:'card_ab', 'T1', 'UB', true)->>'status' = 'already', 'a retried click is a no-op');
reset role;
select slack_test.ok((select count(*) from matches where org_id = :'org1') = 1, 'exactly one match');
select slack_test.ok((select count(*) from slack_outbox where kind = 'match_intro') = 1, 'match queues one group-DM intro');
select slack_test.ok((select count(*) from slack_outbox where kind = 'interest_card') = 1, 'the reciprocal interest queues no second card');

-- ---------------------------------------------------------------------------
-- Accept / pass
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = :A;
insert into interests (org_id, from_user, to_user) values (:'org1', :A, :E);
reset role;
set role service_role;
insert into slack_cards (org_id, from_user, to_user) values (:'org1', :A, :E) returning id as card_ae \gset
select slack_test.ok(slack_respond_card(:'card_ae', 'T1', 'UE', false)->>'status' = 'passed', 'Eve passes');
select slack_test.ok(slack_respond_card(:'card_ae', 'T1', 'UE', true)->>'status' = 'already', 'Eve cannot flip a pass by re-clicking an old card');
select slack_test.ok(slack_interest_context(:'org1', :A, :E) is null, 'no further cards for a passed interest');
reset role;
select slack_test.ok((select count(*) from matches where org_id = :'org1') = 1, 'pass creates no match');
select slack_test.ok((select count(*) from slack_outbox where kind = 'match_intro') = 1, 'pass sends no intro');
set role authenticated;
set request.jwt.claim.sub = :E;
select slack_test.ok((select count(*) from incoming_interest(:'org1')) = 0, 'Eve no longer sees Ann as waiting');
set request.jwt.claim.sub = :A;
select slack_test.ok((select i_am_interested and not matched from discover(:'org1', null) where user_id = :E),
  'Ann is not told: she still just shows as interested');

-- Withdrawn before the click: no false "you matched"
reset role;
insert into memberships (org_id, user_id, slack_user_id) values (:'org1', :S, 'US');
set role authenticated;
set request.jwt.claim.sub = :A;
insert into interests (org_id, from_user, to_user) values (:'org1', :A, :S);
delete from interests where from_user = :A and to_user = :S;   -- Ann withdraws
reset role;
set role service_role;
insert into slack_cards (org_id, from_user, to_user) values (:'org1', :A, :S) returning id as card_as \gset
select slack_test.ok(slack_respond_card(:'card_as', 'T1', 'US', true)->>'status' = 'unavailable', 'clicking a withdrawn interest is unavailable');
reset role;
select slack_test.ok((select count(*) from matches where org_id = :'org1') = 1, 'withdrawn interest creates no match');
select slack_test.ok(not exists (select 1 from interests where from_user = :S and to_user = :A), 'and records no interest for Sam');
delete from memberships where org_id = :'org1' and user_id = :S;
set role authenticated;

-- ---------------------------------------------------------------------------
-- Community isolation and server-only data
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = :C;
select slack_test.ok((select count(*) from slack_cards) = 0, 'members cannot read cards');
select slack_test.ok((select count(*) from slack_outbox) = 0, 'members cannot read the outbox');
select slack_test.ok((select count(*) from slack_workspaces) = 0, 'members cannot read workspace rows (or tokens)');
select slack_test.ok((select count(*) from slack_workspace_status(:'org1')) = 0, 'an admin of another community sees nothing for org1');
select slack_test.ok((select team_id from slack_workspace_status(:'org2')) = 'T2', 'an admin sees their own link status');
set request.jwt.claim.sub = :B;
select slack_test.ok((select count(*) from slack_workspace_status(:'org1')) = 0, 'non-admin members do not see link status');
do $$ begin
  perform slack_respond_card(gen_random_uuid(), 'T1', 'UB', true);
  raise exception 'FAILED: members must not call server-only RPCs';
exception when insufficient_privilege then raise notice 'ok - members cannot call slack_respond_card';
end $$;
do $$ begin
  perform slack_claim_outbox(10);
  raise exception 'FAILED: members must not drain the outbox';
exception when insufficient_privilege then raise notice 'ok - members cannot call slack_claim_outbox';
end $$;
set request.jwt.claim.sub = :A;   -- Ann is org1 admin
do $$ begin
  update memberships set slack_user_id = 'UA' where user_id = '00000000-0000-0000-0000-0000000000b1';
  raise exception 'FAILED: admins must not repoint a member''s Slack id';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok - admins cannot change slack_user_id';
end $$;

-- ---------------------------------------------------------------------------
-- Sign in with Slack: join the linked community, respecting approval
-- ---------------------------------------------------------------------------
reset role;
insert into auth.identities (user_id, provider, provider_id, identity_data) values
  (:S, 'slack_oidc', 'US', '{"custom_claims": {"https://slack.com/team_id": "T1", "https://slack.com/user_id": "US"}}'),
  (:T, 'slack_oidc', 'UT', '{"custom_claims": {"https://slack.com/team_id": "T2", "https://slack.com/user_id": "UT"}}');
set role authenticated;
set request.jwt.claim.sub = :S;
select slack_test.ok(join_org_via_slack()->>'status' = 'joined', 'Slack sign-in joins the community linked to T1');
reset role;
select slack_test.ok((select slack_user_id from memberships where org_id = :'org1' and user_id = :S) = 'US', 'Slack user id recorded on join');
select slack_test.ok(not exists (select 1 from memberships where org_id = :'org2' and user_id = :S), 'T1 sign-in never joins org2');
set role authenticated;
set request.jwt.claim.sub = :T;   -- org2 still requires approval
select slack_test.ok(join_org_via_slack()->>'status' = 'pending', 'approval on: Slack sign-in lands as pending');
reset role;
select slack_test.ok(not exists (select 1 from memberships where org_id = :'org2' and user_id = :T), 'pending member is not a member yet');
select slack_test.ok(exists (select 1 from join_requests where org_id = :'org2' and user_id = :T and status = 'pending'), 'join request created');

-- ---------------------------------------------------------------------------
-- Plans: Slack pauses on a plan without it, and resumes on upgrade
-- ---------------------------------------------------------------------------
reset role;
update organizations set plan = 'community', billing_status = 'active' where id = :'org1';
set role authenticated;
set request.jwt.claim.sub = :E;
insert into interests (org_id, from_user, to_user) values (:'org1', :E, :B);
reset role;
select slack_test.ok((select count(*) from slack_outbox where payload->>'from_user' = :E) = 0, 'Community plan: no Slack cards');
set role service_role;
insert into slack_cards (org_id, from_user, to_user) values (:'org1', :E, :B) returning id as card_eb \gset
select slack_test.ok(slack_respond_card(:'card_eb', 'T1', 'UB', true)->>'status' = 'not_found', 'Community plan: clicks ignored');
select slack_test.ok(slack_interest_context(:'org1', :E, :B) is null, 'Community plan: queued cards are not sent');
reset role;
set role authenticated;
set request.jwt.claim.sub = :S;
select slack_test.ok(join_org_via_slack()->>'status' = 'none', 'Community plan: Slack sign-in does not auto-join');
reset role;
update organizations set plan = 'growth' where id = :'org1';
set role service_role;
select slack_test.ok(slack_respond_card(:'card_eb', 'T1', 'UB', false)->>'status' = 'passed', 'Growth plan: Slack resumes');
reset role;

-- ---------------------------------------------------------------------------
-- Uninstall disables the link: no new cards, clicks ignored
-- ---------------------------------------------------------------------------
set role service_role;
select slack_test.ok(slack_disable_team('T1', 'app_uninstalled') = 1, 'uninstall disables T1');
reset role;
insert into memberships (org_id, user_id) values (:'org1', :T);
set role authenticated;
set request.jwt.claim.sub = :B;
insert into interests (org_id, from_user, to_user) values (:'org1', :B, :T);
reset role;
select slack_test.ok((select count(*) from slack_outbox where payload->>'to_user' = :T) = 0, 'no Slack cards after uninstall');
set role service_role;
insert into slack_cards (org_id, from_user, to_user) values (:'org1', :B, :T) returning id as card_bt \gset
select slack_test.ok(slack_respond_card(:'card_bt', 'T1', 'UT', true)->>'status' = 'not_found', 'clicks on a disabled workspace are ignored');
reset role;

rollback;
\echo 'slack.sql: all checks passed (changes rolled back)'
