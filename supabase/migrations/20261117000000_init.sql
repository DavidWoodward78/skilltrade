-- Skill Trade: initial schema
-- Multi-tenant: every trade, match and message belongs to one organization.
-- Row Level Security enforces org separation; state changes go through RPCs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  headline text not null default '',
  bio text not null default '',
  portfolio_url text not null default '',
  availability text not null default '',
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  invite_code text not null unique default encode(extensions.gen_random_bytes(6), 'hex'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

-- Skills are portable: they belong to the person, not the organization.
create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('offer', 'need')),
  category text not null,
  skill text not null check (char_length(skill) between 1 and 80),
  level smallint not null default 2 check (level between 1 and 3),
  created_at timestamptz not null default now()
);
create index on public.user_skills (user_id);
create index on public.user_skills (category, kind);

create table public.interests (
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, from_user, to_user),
  check (from_user <> to_user)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (org_id, user_a, user_b),
  check (user_a < user_b)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (match_id, created_at);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  proposer_id uuid not null references auth.users(id),
  partner_id uuid not null references auth.users(id),
  proposer_gives text not null,
  partner_gives text not null,
  proposer_hours numeric(5,1) not null check (proposer_hours > 0),
  partner_hours numeric(5,1) not null check (partner_hours > 0),
  due_date date not null,
  definition_of_done text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'completed', 'declined', 'cancelled', 'incomplete')),
  -- each side confirms the OTHER side delivered
  proposer_delivery_confirmed_at timestamptz,  -- set by partner
  partner_delivery_confirmed_at timestamptz,   -- set by proposer
  cancelled_by uuid references auth.users(id),
  cancel_reason text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  check (proposer_id <> partner_id)
);
create index on public.trades (org_id, status);
create index on public.trades (proposer_id);
create index on public.trades (partner_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  owner_id uuid not null references auth.users(id),  -- who delivers it
  title text not null check (char_length(title) between 1 and 200),
  due_date date,
  proof_url text,
  proof_note text,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.milestones (trade_id);

create table public.reviews (
  trade_id uuid not null references public.trades(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  reviewee_id uuid not null references auth.users(id),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 280),
  created_at timestamptz not null default now(),
  primary key (trade_id, reviewer_id)
);
create index on public.reviews (reviewee_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  reporter_id uuid not null references auth.users(id),
  reported_id uuid not null references auth.users(id),
  trade_id uuid references public.trades(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.shares_org(p_user uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select p_user = auth.uid() or exists (
    select 1 from memberships a join memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a));
$$;

create or replace function public.in_match(p_match uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from matches where id = p_match and auth.uid() in (user_a, user_b));
$$;

create or replace function public.in_trade(p_trade uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from trades where id = p_trade and auth.uid() in (proposer_id, partner_id));
$$;

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.user_skills enable row level security;
alter table public.interests enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.trades enable row level security;
alter table public.milestones enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

create policy "profiles: read people you share an org with" on public.profiles
  for select using (shares_org(id));
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "orgs: members read" on public.organizations
  for select using (is_member(id));
create policy "orgs: admins update" on public.organizations
  for update using (is_admin(id)) with check (is_admin(id));

create policy "memberships: members read their org" on public.memberships
  for select using (is_member(org_id));
create policy "memberships: admins change roles" on public.memberships
  for update using (is_admin(org_id)) with check (is_admin(org_id));
create policy "memberships: leave or admin removes" on public.memberships
  for delete using (user_id = auth.uid() or is_admin(org_id));

create policy "skills: read people you share an org with" on public.user_skills
  for select using (shares_org(user_id));
create policy "skills: manage own" on public.user_skills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "interests: see your own" on public.interests
  for select using (auth.uid() in (from_user, to_user));
create policy "interests: express within your org" on public.interests
  for insert with check (
    from_user = auth.uid()
    and is_member(org_id)
    and exists (select 1 from memberships m where m.org_id = interests.org_id and m.user_id = interests.to_user)
    and not is_blocked_between(from_user, to_user));
create policy "interests: withdraw your own" on public.interests
  for delete using (from_user = auth.uid());

create policy "matches: participants read" on public.matches
  for select using (auth.uid() in (user_a, user_b));

create policy "messages: participants read" on public.messages
  for select using (in_match(match_id));
create policy "messages: participants send" on public.messages
  for insert with check (
    sender_id = auth.uid() and in_match(match_id)
    and not exists (select 1 from matches m where m.id = match_id and is_blocked_between(m.user_a, m.user_b)));

create policy "trades: participants and org admins read" on public.trades
  for select using (auth.uid() in (proposer_id, partner_id) or is_admin(org_id));

create policy "milestones: trade participants read" on public.milestones
  for select using (in_trade(trade_id));

create policy "reviews: read within shared orgs" on public.reviews
  for select using (shares_org(reviewee_id));

create policy "reports: admins and reporter read" on public.reports
  for select using (reporter_id = auth.uid() or is_admin(org_id));
create policy "reports: members file" on public.reports
  for insert with check (reporter_id = auth.uid() and is_member(org_id));
create policy "reports: admins resolve" on public.reports
  for update using (is_admin(org_id)) with check (is_admin(org_id));

create policy "blocks: manage own" on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Matching: reciprocal interest creates a match
-- ---------------------------------------------------------------------------

create or replace function public.handle_interest()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from interests
             where org_id = new.org_id and from_user = new.to_user and to_user = new.from_user) then
    insert into matches (org_id, user_a, user_b)
    values (new.org_id, least(new.from_user, new.to_user), greatest(new.from_user, new.to_user))
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_interest_created after insert on public.interests
  for each row execute function public.handle_interest();

-- ---------------------------------------------------------------------------
-- RPCs: organizations
-- ---------------------------------------------------------------------------

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
  insert into organizations (name, slug, created_by) values (trim(p_name), v_slug, auth.uid())
    returning * into v_org;
  insert into memberships (org_id, user_id, role) values (v_org.id, auth.uid(), 'admin');
  return v_org;
end $$;

create or replace function public.join_org(p_code text)
returns organizations language plpgsql security definer set search_path = public, extensions as $$
declare v_org organizations;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_org from organizations where invite_code = lower(trim(p_code));
  if not found then raise exception 'Invite code not found'; end if;
  insert into memberships (org_id, user_id) values (v_org.id, auth.uid()) on conflict do nothing;
  return v_org;
end $$;

create or replace function public.rotate_invite_code(p_org uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := encode(gen_random_bytes(6), 'hex');
begin
  if not is_admin(p_org) then raise exception 'Admins only'; end if;
  update organizations set invite_code = v_code where id = p_org;
  return v_code;
end $$;

-- Prevent an org from losing its last admin.
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  -- the whole community is being deleted: allow the cascade
  if not exists (select 1 from organizations where id = old.org_id) then
    return coalesce(new, old);
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    if not exists (select 1 from memberships
                   where org_id = old.org_id and role = 'admin' and user_id <> old.user_id) then
      raise exception 'A community needs at least one admin';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger memberships_guard_last_admin before update or delete on public.memberships
  for each row execute function public.guard_last_admin();

-- ---------------------------------------------------------------------------
-- Reputation (portable across organizations)
-- ---------------------------------------------------------------------------

create or replace function public.reputation(p_user uuid)
returns table (
  trades_completed int,
  trades_accepted int,
  completion_rate numeric,
  on_time_rate numeric,
  avg_rating numeric,
  review_count int,
  cancellations int
) language sql stable security definer set search_path = public, extensions as $$
  with t as (
    select * from trades
    where p_user in (proposer_id, partner_id) and status in ('active', 'completed', 'cancelled', 'incomplete')
  ), closed as (
    select * from t where status in ('completed', 'cancelled', 'incomplete')
  ), mine_delivered as (
    -- when the other side confirmed this user's delivery
    select t.due_date,
           case when t.proposer_id = p_user then t.proposer_delivery_confirmed_at
                else t.partner_delivery_confirmed_at end as delivered_at
    from t
  )
  select
    (select count(*) from t where status = 'completed')::int,
    (select count(*) from t)::int,
    case when (select count(*) from closed) = 0 then null
         else round((select count(*) from closed where status = 'completed')::numeric
                    / (select count(*) from closed), 2) end,
    case when (select count(*) from mine_delivered where delivered_at is not null) = 0 then null
         else round((select count(*) from mine_delivered
                     where delivered_at is not null and delivered_at::date <= due_date)::numeric
                    / (select count(*) from mine_delivered where delivered_at is not null), 2) end,
    (select round(avg(rating), 1) from reviews where reviewee_id = p_user),
    (select count(*) from reviews where reviewee_id = p_user)::int,
    (select count(*) from t where status = 'cancelled' and cancelled_by = p_user)::int
  where shares_org(p_user);
$$;

-- ---------------------------------------------------------------------------
-- Discovery: search and mutual-fit recommendations
-- ---------------------------------------------------------------------------

create or replace function public.discover(p_org uuid, p_query text default null)
returns table (
  user_id uuid,
  display_name text,
  headline text,
  availability text,
  offers jsonb,
  needs jsonb,
  fit_score int,
  they_offer_what_i_need int,
  they_need_what_i_offer int,
  i_am_interested boolean,
  matched boolean
) language sql stable security definer set search_path = public, extensions as $$
  with me as (select auth.uid() as id),
  members as (
    select m.user_id from memberships m, me
    where m.org_id = p_org and m.user_id <> me.id and is_member(p_org)
      and not is_blocked_between(me.id, m.user_id)
  ),
  my_needs as (select distinct category from user_skills, me where user_id = me.id and kind = 'need'),
  my_offers as (select distinct category from user_skills, me where user_id = me.id and kind = 'offer'),
  scored as (
    select mb.user_id,
      (select count(distinct s.category) from user_skills s
        where s.user_id = mb.user_id and s.kind = 'offer' and s.category in (select category from my_needs))::int as a,
      (select count(distinct s.category) from user_skills s
        where s.user_id = mb.user_id and s.kind = 'need' and s.category in (select category from my_offers))::int as b
    from members mb
  )
  select p.id, p.display_name, p.headline, p.availability,
    coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill, 'level', s.level) order by s.category)
              from user_skills s where s.user_id = p.id and s.kind = 'offer'), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill, 'level', s.level) order by s.category)
              from user_skills s where s.user_id = p.id and s.kind = 'need'), '[]'::jsonb),
    -- mutual fit counts double: both sides gain
    (sc.a + sc.b + case when sc.a > 0 and sc.b > 0 then 2 else 0 end)::int,
    sc.a, sc.b,
    exists (select 1 from interests i, me where i.org_id = p_org and i.from_user = me.id and i.to_user = p.id),
    exists (select 1 from matches mt, me where mt.org_id = p_org
            and mt.user_a = least(me.id, p.id) and mt.user_b = greatest(me.id, p.id))
  from scored sc join profiles p on p.id = sc.user_id
  where p_query is null or p_query = '' or
    p.display_name ilike '%' || p_query || '%' or p.headline ilike '%' || p_query || '%' or
    exists (select 1 from user_skills s where s.user_id = p.id
            and (s.skill ilike '%' || p_query || '%' or s.category ilike '%' || p_query || '%'))
  order by 7 desc, p.display_name;
$$;

-- ---------------------------------------------------------------------------
-- RPCs: trade lifecycle
-- ---------------------------------------------------------------------------

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
  v_partner := case when v_m.user_a = auth.uid() then v_m.user_b else v_m.user_a end;
  if is_blocked_between(auth.uid(), v_partner) then raise exception 'Not available'; end if;
  if p_due < current_date then raise exception 'Due date must be in the future'; end if;
  -- new members get one open trade until their first completion
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
  update trades set status = case when p_accept then 'active' else 'declined' end,
                    accepted_at = case when p_accept then now() end
    where id = p_trade returning * into v_t;
  return v_t;
end $$;

create or replace function public.cancel_trade(p_trade uuid, p_reason text)
returns trades language plpgsql security definer set search_path = public, extensions as $$
declare v_t trades;
begin
  select * into v_t from trades where id = p_trade for update;
  if not found or auth.uid() not in (v_t.proposer_id, v_t.partner_id) then raise exception 'Trade not found'; end if;
  if v_t.status not in ('proposed', 'active') then raise exception 'Trade is already closed'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'Give a short reason'; end if;
  update trades set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
    where id = p_trade returning * into v_t;
  return v_t;
end $$;

-- The caller confirms the OTHER side delivered. Both confirmations complete the trade.
create or replace function public.confirm_delivery(p_trade uuid)
returns trades language plpgsql security definer set search_path = public, extensions as $$
declare v_t trades;
begin
  select * into v_t from trades where id = p_trade for update;
  if not found or auth.uid() not in (v_t.proposer_id, v_t.partner_id) then raise exception 'Trade not found'; end if;
  if v_t.status <> 'active' then raise exception 'Only active trades can be confirmed'; end if;
  if auth.uid() = v_t.proposer_id then
    update trades set partner_delivery_confirmed_at = coalesce(partner_delivery_confirmed_at, now())
      where id = p_trade returning * into v_t;
  else
    update trades set proposer_delivery_confirmed_at = coalesce(proposer_delivery_confirmed_at, now())
      where id = p_trade returning * into v_t;
  end if;
  if v_t.proposer_delivery_confirmed_at is not null and v_t.partner_delivery_confirmed_at is not null then
    update trades set status = 'completed', completed_at = now() where id = p_trade returning * into v_t;
  end if;
  return v_t;
end $$;

-- Trades left unconfirmed 14 days past due become incomplete. Run daily (pg_cron) or on demand.
create or replace function public.expire_stale_trades()
returns int language sql security definer set search_path = public, extensions as $$
  with u as (
    update trades set status = 'incomplete'
    where status = 'active' and due_date + 14 < current_date
    returning 1)
  select count(*)::int from u;
$$;

create or replace function public.add_milestone(p_trade uuid, p_owner uuid, p_title text, p_due date)
returns milestones language plpgsql security definer set search_path = public, extensions as $$
declare v_t trades; v_ms milestones;
begin
  select * into v_t from trades where id = p_trade;
  if not found or auth.uid() not in (v_t.proposer_id, v_t.partner_id) then raise exception 'Trade not found'; end if;
  if v_t.status not in ('proposed', 'active') then raise exception 'Trade is closed'; end if;
  if p_owner not in (v_t.proposer_id, v_t.partner_id) then raise exception 'Owner must be in the trade'; end if;
  insert into milestones (trade_id, owner_id, title, due_date) values (p_trade, p_owner, trim(p_title), p_due)
    returning * into v_ms;
  return v_ms;
end $$;

create or replace function public.submit_milestone(p_milestone uuid, p_proof_url text, p_note text)
returns milestones language plpgsql security definer set search_path = public, extensions as $$
declare v_ms milestones; v_status text;
begin
  select * into v_ms from milestones where id = p_milestone for update;
  if not found or v_ms.owner_id <> auth.uid() then raise exception 'Only the owner can submit this milestone'; end if;
  select status into v_status from trades where id = v_ms.trade_id;
  if v_status <> 'active' then raise exception 'Trade is not active'; end if;
  if coalesce(trim(p_proof_url), '') = '' and coalesce(trim(p_note), '') = '' then
    raise exception 'Add a link or a note as proof of delivery';
  end if;
  update milestones set proof_url = nullif(trim(p_proof_url), ''), proof_note = nullif(trim(p_note), ''),
                        submitted_at = now(), confirmed_at = null
    where id = p_milestone returning * into v_ms;
  return v_ms;
end $$;

create or replace function public.confirm_milestone(p_milestone uuid)
returns milestones language plpgsql security definer set search_path = public, extensions as $$
declare v_ms milestones;
begin
  select * into v_ms from milestones where id = p_milestone for update;
  if not found or not in_trade(v_ms.trade_id) or v_ms.owner_id = auth.uid() then
    raise exception 'Only the other side can confirm this milestone';
  end if;
  if v_ms.submitted_at is null then raise exception 'Nothing submitted yet'; end if;
  update milestones set confirmed_at = now() where id = p_milestone returning * into v_ms;
  return v_ms;
end $$;

create or replace function public.leave_review(p_trade uuid, p_rating int, p_comment text)
returns reviews language plpgsql security definer set search_path = public, extensions as $$
declare v_t trades; v_r reviews;
begin
  select * into v_t from trades where id = p_trade;
  if not found or auth.uid() not in (v_t.proposer_id, v_t.partner_id) then raise exception 'Trade not found'; end if;
  if v_t.status not in ('completed', 'incomplete', 'cancelled') then raise exception 'Review once the trade is closed'; end if;
  insert into reviews (trade_id, reviewer_id, reviewee_id, rating, comment)
  values (p_trade, auth.uid(),
          case when v_t.proposer_id = auth.uid() then v_t.partner_id else v_t.proposer_id end,
          p_rating, left(coalesce(trim(p_comment), ''), 280))
  returning * into v_r;
  return v_r;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: organization dashboard
-- ---------------------------------------------------------------------------

create or replace function public.org_stats(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if not is_admin(p_org) then raise exception 'Admins only'; end if;
  with mem as (select user_id from memberships where org_id = p_org),
  tr as (select * from trades where org_id = p_org),
  offers as (select category, count(distinct user_id) n from user_skills
             where kind = 'offer' and user_id in (select user_id from mem) group by category),
  needs as (select category, count(distinct user_id) n from user_skills
            where kind = 'need' and user_id in (select user_id from mem) group by category)
  select jsonb_build_object(
    'members', (select count(*) from mem),
    'members_with_skills', (select count(distinct user_id) from user_skills where user_id in (select user_id from mem)),
    'members_with_completed_trade', (select count(distinct u) from (
        select proposer_id u from tr where status = 'completed'
        union select partner_id from tr where status = 'completed') x),
    'members_with_repeat_trade', (select count(*) from (
        select u from (select proposer_id u from tr where status = 'completed'
                       union all select partner_id from tr where status = 'completed') y
        group by u having count(*) >= 2) z),
    'matches', (select count(*) from matches where org_id = p_org),
    'trades_proposed', (select count(*) from tr),
    'trades_accepted', (select count(*) from tr where accepted_at is not null),
    'trades_active', (select count(*) from tr where status = 'active'),
    'trades_completed', (select count(*) from tr where status = 'completed'),
    'trades_failed', (select count(*) from tr where status in ('cancelled', 'incomplete') and accepted_at is not null),
    'avg_rating', (select round(avg(r.rating), 2) from reviews r join tr on tr.id = r.trade_id),
    'open_reports', (select count(*) from reports where org_id = p_org and resolved_at is null),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('category', c, 'offered', coalesce(o.n, 0), 'needed', coalesce(nd.n, 0),
                                          'gap', coalesce(nd.n, 0) - coalesce(o.n, 0))
                       order by coalesce(nd.n, 0) - coalesce(o.n, 0) desc, c)
      from (select category c from offers union select category from needs) cats
      left join offers o on o.category = cats.c
      left join needs nd on nd.category = cats.c), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Grants and realtime
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.expire_stale_trades() from authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
