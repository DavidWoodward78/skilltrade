-- Scenario test for the schema. Expected ERROR lines are the guards working.
-- Runs as superuser for setup, then as the authenticated role with request.jwt.claim.sub set per user.
\set ON_ERROR_STOP 1
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set C '''00000000-0000-0000-0000-00000000000c'''
insert into auth.users (id, email) values (:A,'ann@x.com'),(:B,'bob@x.com'),(:C,'cat@x.com');
set role authenticated;
set request.jwt.claim.sub = :A;
select slug from create_org('Delaware Founders');
insert into user_skills (user_id, kind, category, skill) values (auth.uid(),'offer','Development','Next.js'),(auth.uid(),'need','Marketing','Launch plan');
reset role;
select invite_code as code from organizations \gset
select id as org from organizations \gset
set role authenticated;
set request.jwt.claim.sub = :B;
select name from join_org(:'code');
insert into user_skills (user_id, kind, category, skill) values (auth.uid(),'offer','Marketing','SEO'),(auth.uid(),'need','Development','MVP');
set request.jwt.claim.sub = :C;
select count(*) as cat_sees_orgs from organizations;
select count(*) as cat_sees_profiles from profiles;
select name from join_org(:'code');
insert into user_skills (user_id, kind, category, skill) values (auth.uid(),'need','Design','Logo');
-- Ann discovers
set request.jwt.claim.sub = :A;
select display_name, fit_score, they_offer_what_i_need, they_need_what_i_offer from discover(:'org', null);
select display_name from discover(:'org', 'seo');
insert into interests (org_id, from_user, to_user) values (:'org', :A, :B);
select count(*) as matches_before from matches;
set request.jwt.claim.sub = :B;
insert into interests (org_id, from_user, to_user) values (:'org', :B, :A);
select count(*) as matches_after from matches;
select id as m from matches \gset
insert into messages (match_id, sender_id, body) values (:'m', :B, 'hey');
set request.jwt.claim.sub = :C;
select count(*) as cat_sees_messages from messages;
select count(*) as cat_sees_matches from matches;
-- Bob proposes trade
set request.jwt.claim.sub = :B;
select status from propose_trade(:'m', 'SEO audit', 'MVP landing page', 4, 10, current_date + 10, 'Audit doc + live page');
select id as t from trades \gset
\set ON_ERROR_STOP 0
select status from propose_trade(:'m', 'x','y',1,1,current_date+1,'z');
select status from respond_trade(:'t', true);
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = :A;
select status from respond_trade(:'t', true);
select title from add_milestone(:'t', :A, 'Landing page draft', current_date + 5);
select id as ms from milestones \gset
select submitted_at is not null as submitted from submit_milestone(:'ms', 'https://example.com/draft', null);
\set ON_ERROR_STOP 0
select confirm_milestone(:'ms');
\set ON_ERROR_STOP 1
set request.jwt.claim.sub = :B;
select confirmed_at is not null as confirmed from confirm_milestone(:'ms');
select status from confirm_delivery(:'t');
set request.jwt.claim.sub = :A;
select status from confirm_delivery(:'t');
select rating from leave_review(:'t', 5, 'Fast and thorough');
select * from reputation(:B);
select org_stats(:'org');
set request.jwt.claim.sub = :B;
\set ON_ERROR_STOP 0
select org_stats(:'org');
\set ON_ERROR_STOP 1
-- Block hides from discover
set request.jwt.claim.sub = :A;
insert into blocks (blocker_id, blocked_id) values (:A, :C);
select display_name from discover(:'org', null);
-- last admin guard
\set ON_ERROR_STOP 0
delete from memberships where user_id = :A;
