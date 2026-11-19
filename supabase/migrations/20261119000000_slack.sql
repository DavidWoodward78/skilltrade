-- Slack integration, Phase 1.
-- Slack carries notifications and conversations; SkillTrade stays the system of record.
--
-- * slack_workspaces: one Slack workspace per community (and one community per workspace).
--   The bot token is encrypted by the app (AES-256-GCM) before it is stored here.
-- * memberships.slack_user_id: the member's Slack user in their community's workspace.
-- * slack_cards: the "X is interested in trading with you" DM, one per (community, from, to).
-- * slack_outbox: notifications waiting to be sent. Filled by triggers, drained by the app.
-- * slack_events_seen: Slack event ids already handled (Slack retries).
--
-- None of these tables have RLS policies for signed-in users: only the server (service role)
-- reads them. Admins see their link status through slack_workspace_status().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.slack_workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  team_id text not null unique,
  team_name text not null default '',
  app_id text,
  bot_user_id text not null,
  bot_token_enc text not null,           -- "v1.<iv>.<tag>.<ciphertext>", base64url, see lib/slack/crypto.ts
  scopes text not null default '',
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text
);
alter table public.slack_workspaces enable row level security;

alter table public.memberships add column if not exists slack_user_id text;
create unique index if not exists memberships_org_slack_user
  on public.memberships (org_id, slack_user_id) where slack_user_id is not null;

-- Only the server may set or change a member's Slack user id (an admin could otherwise
-- point someone's DMs at a different Slack user). Direct API calls run as
-- authenticated/anon; security definer functions and the service role do not.
create or replace function public.guard_slack_user_id()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if new.slack_user_id is distinct from old.slack_user_id and current_user in ('authenticated', 'anon') then
    raise exception 'slack_user_id is managed by SkillTrade';
  end if;
  return new;
end $$;
drop trigger if exists memberships_guard_slack_user_id on public.memberships;
create trigger memberships_guard_slack_user_id before update on public.memberships
  for each row execute function public.guard_slack_user_id();

create table if not exists public.slack_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,   -- who tapped Interested
  to_user uuid not null references auth.users(id) on delete cascade,     -- who receives the DM
  channel_id text,
  message_ts text,
  state text not null default 'pending' check (state in ('pending', 'interested', 'passed', 'matched', 'closed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, from_user, to_user),
  check (from_user <> to_user)
);
alter table public.slack_cards enable row level security;

create table if not exists public.slack_outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('interest_card', 'match_intro')),
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists slack_outbox_due on public.slack_outbox (next_attempt_at) where status = 'pending';
alter table public.slack_outbox enable row level security;

create table if not exists public.slack_events_seen (
  key text primary key,                  -- Slack event_id, or "action:<card>:<action_ts>"
  received_at timestamptz not null default now()
);
alter table public.slack_events_seen enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Which plans include Slack. Keep in sync with SLACK_PLANS in lib/slack/config.ts
-- (tests/slack/plans.test.ts checks this). Trials include it so communities can try it.
create or replace function public.slack_plan_includes(p_plan text)
returns boolean language sql immutable set search_path = public, extensions as $$
  select p_plan in ('trial', 'pilot', 'growth', 'enterprise');
$$;

create or replace function public.slack_entitled(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from organizations where id = p_org and slack_plan_includes(plan));
$$;

-- Linked AND on a plan that includes Slack. A downgrade pauses Slack without
-- unlinking it; upgrading again resumes it.
create or replace function public.slack_org_linked(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from slack_workspaces where org_id = p_org and disabled_at is null) and slack_entitled(p_org);
$$;

-- The Slack identity a user signed in with (Supabase provider "slack_oidc").
-- team_id lives in identity_data.custom_claims; the Slack user id is the identity's provider_id.
create or replace function public.slack_identity(p_user uuid)
returns table (team_id text, slack_user_id text)
language sql stable security definer set search_path = public, extensions as $$
  select i.identity_data->'custom_claims'->>'https://slack.com/team_id',
         coalesce(i.identity_data->'custom_claims'->>'https://slack.com/user_id', i.provider_id)
  from auth.identities i
  where i.user_id = p_user and i.provider = 'slack_oidc'
  order by i.created_at desc limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Outbox triggers. These only record that something happened; matching is unchanged.
-- ---------------------------------------------------------------------------

-- A new one-way interest: DM the person it's aimed at (unless it already made a match).
create or replace function public.slack_on_interest()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not slack_org_linked(new.org_id) then return new; end if;
  if exists (select 1 from interests where org_id = new.org_id and from_user = new.to_user and to_user = new.from_user) then
    return new;  -- reciprocal: the match trigger handles it
  end if;
  insert into slack_outbox (org_id, kind, dedupe_key, payload)
  values (new.org_id, 'interest_card', 'interest:' || new.org_id || ':' || new.from_user || ':' || new.to_user,
          jsonb_build_object('from_user', new.from_user, 'to_user', new.to_user))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists slack_on_interest on public.interests;
create trigger slack_on_interest after insert on public.interests
  for each row execute function public.slack_on_interest();

-- A new match: open a group DM with both people.
create or replace function public.slack_on_match()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not slack_org_linked(new.org_id) then return new; end if;
  insert into slack_outbox (org_id, kind, dedupe_key, payload)
  values (new.org_id, 'match_intro', 'match:' || new.id,
          jsonb_build_object('match_id', new.id, 'user_a', new.user_a, 'user_b', new.user_b))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists slack_on_match on public.matches;
create trigger slack_on_match after insert on public.matches
  for each row execute function public.slack_on_match();

-- ---------------------------------------------------------------------------
-- Server-only RPCs (service role)
-- ---------------------------------------------------------------------------

-- Link a workspace to a community after OAuth. Refuses a workspace that is actively linked
-- to a different community. Reinstalling replaces the token.
create or replace function public.slack_link_workspace(
  p_org uuid, p_team text, p_team_name text, p_app text, p_bot_user text, p_token_enc text,
  p_scopes text, p_installed_by uuid
) returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_other uuid; v_old_team text;
begin
  select org_id into v_other from slack_workspaces where team_id = p_team and disabled_at is null;
  if v_other is not null and v_other <> p_org then
    return 'linked_elsewhere';
  end if;
  select team_id into v_old_team from slack_workspaces where org_id = p_org;
  -- Switching to a different workspace: old Slack user ids mean nothing there.
  if v_old_team is not null and v_old_team <> p_team then
    update memberships set slack_user_id = null where org_id = p_org;
    update slack_cards set state = 'closed' where org_id = p_org and state = 'pending';
  end if;
  delete from slack_workspaces where org_id = p_org or team_id = p_team;
  insert into slack_workspaces (org_id, team_id, team_name, app_id, bot_user_id, bot_token_enc, scopes, installed_by)
  values (p_org, p_team, coalesce(p_team_name, ''), p_app, p_bot_user, p_token_enc, coalesce(p_scopes, ''), p_installed_by);
  return 'linked';
end $$;

-- Uninstall / token revoked / admin disconnect.
create or replace function public.slack_disable_team(p_team text, p_reason text)
returns int language sql security definer set search_path = public, extensions as $$
  with u as (
    update slack_workspaces set disabled_at = coalesce(disabled_at, now()), disabled_reason = p_reason
    where team_id = p_team returning org_id)
  select count(*)::int from u;
$$;

-- Claim due outbox rows for sending. Rows stay locked for 2 minutes; a crash releases them.
create or replace function public.slack_claim_outbox(p_limit int default 20)
returns setof slack_outbox language sql security definer set search_path = public, extensions as $$
  update slack_outbox o set locked_until = now() + interval '2 minutes', attempts = o.attempts + 1
  where o.id in (
    select id from slack_outbox
    where status = 'pending' and next_attempt_at <= now() and (locked_until is null or locked_until < now())
    order by id limit greatest(1, least(p_limit, 100))
    for update skip locked)
  returning o.*;
$$;

-- Everything the bot needs to know before DMing about an interest, re-checked at send time.
-- Returns null when the card should not be sent (match made, blocked, left, paused, withdrawn...).
create or replace function public.slack_interest_context(p_org uuid, p_from uuid, p_to uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug),
    'from', jsonb_build_object(
      'id', p.id, 'display_name', p.display_name, 'headline', p.headline,
      'offers', coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill) order by s.category)
                          from user_skills s where s.user_id = p.id and s.kind = 'offer'), '[]'::jsonb),
      'needs', coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill) order by s.category)
                         from user_skills s where s.user_id = p.id and s.kind = 'need'), '[]'::jsonb)))
  from organizations o join profiles p on p.id = p_from
  where o.id = p_org and slack_plan_includes(o.plan)
    and exists (select 1 from interests i where i.org_id = p_org and i.from_user = p_from and i.to_user = p_to and i.dismissed_at is null)
    and not exists (select 1 from interests i where i.org_id = p_org and i.from_user = p_to and i.to_user = p_from)
    and exists (select 1 from memberships m where m.org_id = p_org and m.user_id = p_from and m.suspended_at is null)
    and exists (select 1 from memberships m where m.org_id = p_org and m.user_id = p_to)
    and not is_blocked_between(p_from, p_to);
$$;

-- A button on an interest card was clicked. Everything is checked against the community the
-- Slack workspace is linked to, and the clicker must be the card's recipient in that community.
-- Returns {status: interested|passed|already|unavailable|not_found, state, match_id}.
create or replace function public.slack_respond_card(p_card uuid, p_team text, p_slack_user text, p_interested boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_card slack_cards;
  v_org uuid;
  v_match uuid;
begin
  select org_id into v_org from slack_workspaces where team_id = p_team and disabled_at is null and slack_entitled(org_id);
  if v_org is null then return jsonb_build_object('status', 'not_found'); end if;

  select * into v_card from slack_cards where id = p_card and org_id = v_org for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if not exists (select 1 from memberships where org_id = v_org and user_id = v_card.to_user and slack_user_id = p_slack_user) then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_card.state <> 'pending' then
    select id into v_match from matches where org_id = v_org
      and user_a = least(v_card.from_user, v_card.to_user) and user_b = greatest(v_card.from_user, v_card.to_user);
    return jsonb_build_object('status', 'already', 'state', v_card.state, 'match_id', v_match);
  end if;

  if not p_interested then
    -- Pass: set the interest aside, quietly. Nobody is told.
    update interests set dismissed_at = coalesce(dismissed_at, now())
      where org_id = v_org and from_user = v_card.from_user and to_user = v_card.to_user;
    update slack_cards set state = 'passed', decided_at = now() where id = v_card.id;
    return jsonb_build_object('status', 'passed', 'state', 'passed');
  end if;

  -- Interested: the same rules as expressing interest on the web.
  if not org_is_active(v_org) then
    return jsonb_build_object('status', 'unavailable', 'reason', 'plan');
  end if;
  if exists (select 1 from memberships where org_id = v_org and user_id = v_card.to_user and suspended_at is not null) then
    return jsonb_build_object('status', 'unavailable', 'reason', 'paused');
  end if;
  if not exists (select 1 from memberships where org_id = v_org and user_id = v_card.from_user and suspended_at is null)
     or not exists (select 1 from interests where org_id = v_org and from_user = v_card.from_user and to_user = v_card.to_user)
     or is_blocked_between(v_card.from_user, v_card.to_user) then
    -- they left, were paused, withdrew their interest, or one blocked the other
    update slack_cards set state = 'closed', decided_at = now() where id = v_card.id;
    return jsonb_build_object('status', 'unavailable', 'reason', 'gone');
  end if;

  insert into interests (org_id, from_user, to_user) values (v_org, v_card.to_user, v_card.from_user)
    on conflict do nothing;   -- reciprocal interest: the existing trigger creates the match
  select id into v_match from matches where org_id = v_org
    and user_a = least(v_card.from_user, v_card.to_user) and user_b = greatest(v_card.from_user, v_card.to_user);
  update slack_cards set state = case when v_match is null then 'interested' else 'matched' end, decided_at = now()
    where id = v_card.id;
  return jsonb_build_object('status', 'interested', 'state', case when v_match is null then 'interested' else 'matched' end,
                            'match_id', v_match);
end $$;

-- ---------------------------------------------------------------------------
-- Signed-in users
-- ---------------------------------------------------------------------------

-- After "Sign in with Slack": join the community linked to the person's Slack workspace.
-- The workspace comes from the person's own identity record, never from the request.
-- Same rules as join_org (email domain, member cap, admin approval).
-- Returns {status: none|joined|already|pending|full|domain, slug, name, domain}.
create or replace function public.join_org_via_slack()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_team text;
  v_slack_user text;
  v_org organizations;
  v_email text;
  v_members int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select team_id, slack_user_id into v_team, v_slack_user from slack_identity(auth.uid());
  if v_team is null then return jsonb_build_object('status', 'none'); end if;
  select o.* into v_org from organizations o join slack_workspaces w on w.org_id = o.id
    where w.team_id = v_team and w.disabled_at is null and slack_plan_includes(o.plan);
  if not found then return jsonb_build_object('status', 'none'); end if;

  if exists (select 1 from memberships where org_id = v_org.id and user_id = auth.uid()) then
    update memberships set slack_user_id = v_slack_user
      where org_id = v_org.id and user_id = auth.uid() and slack_user_id is distinct from v_slack_user
        and not exists (select 1 from memberships x where x.org_id = v_org.id and x.slack_user_id = v_slack_user);
    return jsonb_build_object('status', 'already', 'slug', v_org.slug, 'name', v_org.name);
  end if;
  if v_org.allowed_email_domain is not null then
    select lower(email) into v_email from auth.users where id = auth.uid();
    if v_email is null or split_part(v_email, '@', 2) <> v_org.allowed_email_domain then
      return jsonb_build_object('status', 'domain', 'name', v_org.name, 'domain', v_org.allowed_email_domain);
    end if;
  end if;
  select count(*) into v_members from memberships where org_id = v_org.id;
  if v_members >= v_org.member_limit then
    return jsonb_build_object('status', 'full', 'name', v_org.name);
  end if;
  if v_org.require_approval then
    insert into join_requests (org_id, user_id) values (v_org.id, auth.uid())
      on conflict (org_id, user_id) do update
        set status = case when join_requests.status = 'declined' then 'pending' else join_requests.status end,
            created_at = case when join_requests.status = 'declined' then now() else join_requests.created_at end;
    return jsonb_build_object('status', 'pending', 'name', v_org.name);
  end if;
  insert into memberships (org_id, user_id, slack_user_id)
  values (v_org.id, auth.uid(),
          case when exists (select 1 from memberships x where x.org_id = v_org.id and x.slack_user_id = v_slack_user)
               then null else v_slack_user end)
  on conflict do nothing;
  return jsonb_build_object('status', 'joined', 'slug', v_org.slug, 'name', v_org.name);
end $$;

-- Admin settings: is Slack connected? (Never returns the token.)
drop function if exists public.slack_workspace_status(uuid);
create function public.slack_workspace_status(p_org uuid)
returns table (team_id text, team_name text, installed_at timestamptz, disabled_at timestamptz, disabled_reason text,
               members_linked bigint)
language sql stable security definer set search_path = public, extensions as $$
  select w.team_id, w.team_name, w.installed_at, w.disabled_at, w.disabled_reason,
         (select count(*) from memberships m where m.org_id = p_org and m.slack_user_id is not null)
  from slack_workspaces w where w.org_id = p_org and is_admin(p_org);
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping and grants
-- ---------------------------------------------------------------------------

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('slack-housekeeping', '17 4 * * *', $c$
      delete from public.slack_events_seen where received_at < now() - interval '2 days';
      delete from public.slack_outbox where status <> 'pending' and finished_at < now() - interval '30 days';
    $c$);
  end if;
end $$;

revoke execute on function public.guard_slack_user_id() from public, anon, authenticated;
revoke execute on function public.slack_on_interest() from public, anon, authenticated;
revoke execute on function public.slack_on_match() from public, anon, authenticated;
revoke execute on function public.slack_org_linked(uuid) from public, anon, authenticated;
revoke execute on function public.slack_entitled(uuid) from public, anon, authenticated;
revoke execute on function public.slack_identity(uuid) from public, anon, authenticated;

revoke execute on function public.slack_link_workspace(uuid, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.slack_disable_team(text, text) from public, anon, authenticated;
revoke execute on function public.slack_claim_outbox(int) from public, anon, authenticated;
revoke execute on function public.slack_interest_context(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.slack_respond_card(uuid, text, text, boolean) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.slack_link_workspace(uuid, text, text, text, text, text, text, uuid) to service_role;
    grant execute on function public.slack_disable_team(text, text) to service_role;
    grant execute on function public.slack_claim_outbox(int) to service_role;
    grant execute on function public.slack_interest_context(uuid, uuid, uuid) to service_role;
    grant execute on function public.slack_respond_card(uuid, text, text, boolean) to service_role;
    grant execute on function public.slack_identity(uuid) to service_role;
  end if;
end $$;

revoke execute on function public.join_org_via_slack() from public, anon;
grant execute on function public.join_org_via_slack() to authenticated;
revoke execute on function public.slack_workspace_status(uuid) from public, anon;
grant execute on function public.slack_workspace_status(uuid) to authenticated;
