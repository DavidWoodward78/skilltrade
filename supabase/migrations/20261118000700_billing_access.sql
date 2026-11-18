-- Paid communities: 30-day trial, plans with member caps, read-only when lapsed,
-- join requests with admin approval, optional email-domain restriction,
-- and an owner-only switch for free pilots.

-- ---------- Organization billing + access settings ----------
alter table public.organizations
  add column if not exists plan text not null default 'trial'
    check (plan in ('trial', 'community', 'growth', 'enterprise', 'pilot')),
  add column if not exists billing_status text not null default 'trialing'
    check (billing_status in ('trialing', 'active', 'past_due', 'canceled', 'lapsed')),
  add column if not exists trial_ends_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists member_limit int not null default 50,
  add column if not exists current_period_end timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists require_approval boolean not null default true,
  add column if not exists allowed_email_domain text
    check (allowed_email_domain is null or allowed_email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');

-- Admins may change only these settings directly; billing fields come from Stripe or the owner.
revoke update on public.organizations from authenticated, anon;
grant update (name, require_approval, allowed_email_domain) on public.organizations to authenticated;

-- Can this community start new matches and trades right now?
create or replace function public.org_is_active(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from organizations o where o.id = p_org and (
      o.plan = 'pilot'
      or (o.billing_status = 'trialing' and o.trial_ends_at > now())
      or o.billing_status = 'active'
      -- a week's grace while a card payment is retried
      or (o.billing_status = 'past_due' and coalesce(o.current_period_end, now()) > now() - interval '7 days')
    ));
$$;

-- ---------- Owner (platform) admins ----------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;
drop policy if exists "platform_admins: see self" on public.platform_admins;
create policy "platform_admins: see self" on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function public.owner_orgs()
returns table (id uuid, name text, slug text, plan text, billing_status text, trial_ends_at timestamptz,
               member_limit int, members bigint, created_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select o.id, o.name, o.slug, o.plan, o.billing_status, o.trial_ends_at, o.member_limit,
         (select count(*) from memberships m where m.org_id = o.id), o.created_at
  from organizations o where is_platform_admin() order by o.created_at desc;
$$;

create or replace function public.owner_set_plan(p_org uuid, p_plan text, p_limit int)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_platform_admin() then raise exception 'Owner only'; end if;
  update organizations set
    plan = p_plan,
    member_limit = greatest(1, p_limit),
    billing_status = case when p_plan = 'pilot' then 'active'
                          when p_plan = 'trial' then 'trialing' else billing_status end,
    trial_ends_at = case when p_plan = 'trial' then greatest(trial_ends_at, now() + interval '30 days') else trial_ends_at end
  where id = p_org;
end $$;

-- ---------- Join requests ----------
create table if not exists public.join_requests (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  primary key (org_id, user_id)
);
alter table public.join_requests enable row level security;
drop policy if exists "join_requests: own or admin" on public.join_requests;
create policy "join_requests: own or admin" on public.join_requests
  for select using (user_id = auth.uid() or is_admin(org_id));
-- Admins can see who's asking even before they're members
drop policy if exists "profiles: admins see requesters" on public.profiles;
create policy "profiles: admins see requesters" on public.profiles
  for select using (exists (select 1 from join_requests jr where jr.user_id = profiles.id and jr.status = 'pending' and is_admin(jr.org_id)));

-- Joining: returns {status: joined|pending|full|domain|already, slug, name}
drop function if exists public.join_org(text);
create function public.join_org(p_code text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org organizations;
  v_email text;
  v_members int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_org from organizations where invite_code = lower(trim(p_code));
  if not found then raise exception 'Invite code not found'; end if;
  if exists (select 1 from memberships where org_id = v_org.id and user_id = auth.uid()) then
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
  insert into memberships (org_id, user_id) values (v_org.id, auth.uid()) on conflict do nothing;
  return jsonb_build_object('status', 'joined', 'slug', v_org.slug, 'name', v_org.name);
end $$;

create or replace function public.decide_join(p_org uuid, p_user uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_org organizations;
begin
  if not is_admin(p_org) then raise exception 'Admins only'; end if;
  select * into v_org from organizations where id = p_org;
  if p_approve then
    if (select count(*) from memberships where org_id = p_org) >= v_org.member_limit then
      return 'full';
    end if;
    insert into memberships (org_id, user_id) values (p_org, p_user) on conflict do nothing;
  end if;
  update join_requests set status = case when p_approve then 'approved' else 'declined' end,
         decided_by = auth.uid(), decided_at = now()
   where org_id = p_org and user_id = p_user;
  return case when p_approve then 'approved' else 'declined' end;
end $$;

-- Requests I'm still waiting on (for the communities page)
create or replace function public.my_pending_requests()
returns table (org_name text, requested_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select o.name, jr.created_at from join_requests jr join organizations o on o.id = jr.org_id
  where jr.user_id = auth.uid() and jr.status = 'pending' order by jr.created_at desc;
$$;

-- ---------- New communities start a 30-day trial ----------
create or replace function public.create_org(p_name text)
returns organizations language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org organizations;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'community'; end if;
  if exists (select 1 from organizations where slug = v_slug) then
    v_slug := v_slug || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
  end if;
  insert into organizations (name, slug, created_by, plan, billing_status, trial_ends_at, member_limit)
  values (trim(p_name), v_slug, auth.uid(), 'trial', 'trialing', now() + interval '30 days', 50)
  returning * into v_org;
  insert into memberships (org_id, user_id, role) values (v_org.id, auth.uid(), 'admin');
  return v_org;
end $$;

-- ---------- Read-only when the plan has lapsed ----------
drop policy if exists "interests: express within your org" on public.interests;
create policy "interests: express within your org" on public.interests
  for insert with check (
    from_user = auth.uid()
    and is_active_member(org_id)
    and org_is_active(org_id)
    and exists (select 1 from memberships m where m.org_id = interests.org_id
                and m.user_id = interests.to_user and m.suspended_at is null)
    and not is_blocked_between(from_user, to_user));

create or replace function public.propose_trade(
  p_match uuid, p_i_give text, p_they_give text, p_my_hours numeric, p_their_hours numeric,
  p_due date, p_done text
) returns trades language plpgsql security definer set search_path = public, extensions as $$
declare
  v_m matches;
  v_t trades;
  v_partner uuid;
begin
  select * into v_m from matches where id = p_match and auth.uid() in (user_a, user_b);
  if not found then raise exception 'Match not found'; end if;
  if not is_active_member(v_m.org_id) then raise exception 'Your account is paused while an admin reviews reports'; end if;
  if not org_is_active(v_m.org_id) then raise exception 'This community''s plan has ended. Ask an admin to renew it to start new trades.'; end if;
  v_partner := case when v_m.user_a = auth.uid() then v_m.user_b else v_m.user_a end;
  if is_blocked_between(auth.uid(), v_partner) then raise exception 'Not available'; end if;
  if exists (select 1 from memberships where org_id = v_m.org_id and user_id = v_partner and suspended_at is not null) then
    raise exception 'Not available';
  end if;
  if p_due < current_date then raise exception 'Due date must be in the future'; end if;
  if (select count(*) from trades where auth.uid() in (proposer_id, partner_id) and status = 'completed') = 0
     and (select count(*) from trades where auth.uid() in (proposer_id, partner_id) and status in ('proposed', 'active')) >= 1 then
    raise exception 'Finish your first trade before opening another';
  end if;
  insert into trades (org_id, match_id, proposer_id, partner_id, proposer_gives, partner_gives,
                      proposer_hours, partner_hours, due_date, definition_of_done)
  values (v_m.org_id, v_m.id, auth.uid(), v_partner, trim(p_i_give), trim(p_they_give),
          p_my_hours, p_their_hours, p_due, trim(p_done))
  returning * into v_t;
  return v_t;
end $$;

create or replace function public.respond_trade(p_trade uuid, p_accept boolean)
returns trades language plpgsql security definer set search_path = public, extensions as $$
declare v_t trades;
begin
  select * into v_t from trades where id = p_trade for update;
  if not found or v_t.partner_id <> auth.uid() then raise exception 'Only the invited partner can respond'; end if;
  if v_t.status <> 'proposed' then raise exception 'This trade is no longer waiting for a response'; end if;
  if p_accept and not is_active_member(v_t.org_id) then
    raise exception 'Your account is paused while an admin reviews reports';
  end if;
  if p_accept and not org_is_active(v_t.org_id) then
    raise exception 'This community''s plan has ended. Ask an admin to renew it to start new trades.';
  end if;
  update trades set status = case when p_accept then 'active' else 'declined' end,
                    accepted_at = case when p_accept then now() end
    where id = p_trade returning * into v_t;
  return v_t;
end $$;

-- ---------- Badge: admins also see pending join requests ----------
create or replace function public.nav_counts(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with me as (select auth.uid() as id)
  select case when not is_member(p_org) then '{}'::jsonb else jsonb_build_object(
    'discover', (select count(*) from incoming_interest(p_org)),
    'matches', (
      select count(*) from matches mt, me
      where mt.org_id = p_org and me.id in (mt.user_a, mt.user_b)
        and not is_blocked_between(mt.user_a, mt.user_b)
        and (
          not exists (select 1 from match_reads r where r.match_id = mt.id and r.user_id = me.id)
          or exists (
            select 1 from messages msg
            where msg.match_id = mt.id and msg.sender_id <> me.id
              and msg.created_at > (select r.last_read_at from match_reads r where r.match_id = mt.id and r.user_id = me.id)))),
    'trades', (
      (select count(*) from trades t, me
        where t.org_id = p_org and t.status = 'proposed' and t.partner_id = me.id)
      + (select count(*) from milestones ms join trades t on t.id = ms.trade_id, me
        where t.org_id = p_org and t.status = 'active' and me.id in (t.proposer_id, t.partner_id)
          and ms.owner_id <> me.id and ms.submitted_at is not null and ms.confirmed_at is null)
      + (select count(*) from trades t, me
        where t.org_id = p_org and t.status in ('completed', 'incomplete', 'cancelled') and t.accepted_at is not null
          and me.id in (t.proposer_id, t.partner_id)
          and coalesce(t.completed_at, t.created_at) > now() - interval '30 days'
          and not exists (select 1 from reviews rv where rv.trade_id = t.id and rv.reviewer_id = me.id))),
    'admin', case when is_admin(p_org)
      then (select count(*) from reports where org_id = p_org and resolved_at is null)
         + (select count(*) from join_requests where org_id = p_org and status = 'pending')
      else 0 end
  ) end;
$$;

-- ---------- Grants ----------
revoke execute on function public.org_is_active(uuid) from public, anon;
grant execute on function public.org_is_active(uuid) to authenticated;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
revoke execute on function public.owner_orgs() from public, anon;
grant execute on function public.owner_orgs() to authenticated;
revoke execute on function public.owner_set_plan(uuid, text, int) from public, anon;
grant execute on function public.owner_set_plan(uuid, text, int) to authenticated;
revoke execute on function public.join_org(text) from public, anon;
grant execute on function public.join_org(text) to authenticated;
revoke execute on function public.decide_join(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_join(uuid, uuid, boolean) to authenticated;
revoke execute on function public.my_pending_requests() from public, anon;
grant execute on function public.my_pending_requests() to authenticated;
revoke execute on function public.create_org(text) from public, anon;
grant execute on function public.create_org(text) to authenticated;
revoke execute on function public.propose_trade(uuid, text, text, numeric, numeric, date, text) from public, anon;
grant execute on function public.propose_trade(uuid, text, text, numeric, numeric, date, text) to authenticated;
revoke execute on function public.respond_trade(uuid, boolean) from public, anon;
grant execute on function public.respond_trade(uuid, boolean) to authenticated;
