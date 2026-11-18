-- Trust & safety
-- 1. Fault: an unfinished trade only counts against the side that didn't deliver.
-- 2. Reputation counts unique partners.
-- 3. Members reported by 2+ different people are paused until an admin reviews.
-- 4. Admins see suspicious patterns (closed pairs, instant trades, repeat reports).

-- ---------- 1. Fault attribution ----------

alter table public.trades
  add column if not exists proposer_failed boolean not null default false,
  add column if not exists partner_failed boolean not null default false;

-- Past due + 14 days: whoever's delivery was never confirmed is at fault.
create or replace function public.expire_stale_trades()
returns int language sql security definer set search_path = public, extensions as $$
  with u as (
    update trades
       set status = 'incomplete',
           proposer_failed = proposer_delivery_confirmed_at is null,
           partner_failed = partner_delivery_confirmed_at is null
     where status = 'active' and due_date + 14 < current_date
    returning 1)
  select count(*)::int from u;
$$;
revoke execute on function public.expire_stale_trades() from public, anon, authenticated;

-- ---------- 2. Reputation with fault + unique partners ----------

drop function if exists public.reputation(uuid);
drop function if exists public.rep_stats(uuid);

create function public.rep_stats(p_user uuid)
returns table (
  trades_completed int,
  trades_accepted int,
  completion_rate numeric,
  on_time_rate numeric,
  avg_rating numeric,
  review_count int,
  cancellations int,
  incompletes int,
  unique_partners int
) language sql stable security definer set search_path = public, extensions as $$
  with t as (
    select *,
      case when proposer_id = p_user then partner_id else proposer_id end as partner,
      case when proposer_id = p_user then proposer_failed else partner_failed end as i_failed,
      case when proposer_id = p_user then proposer_delivery_confirmed_at else partner_delivery_confirmed_at end as delivered_at
    from trades
    where p_user in (proposer_id, partner_id) and accepted_at is not null
  ),
  done as (select * from t where status = 'completed'),
  my_fails as (
    select * from t
    where (status = 'incomplete' and i_failed) or (status = 'cancelled' and cancelled_by = p_user)
  )
  select
    (select count(*) from done)::int,
    (select count(*) from t)::int,
    case when (select count(*) from done) + (select count(*) from my_fails) = 0 then null
         else round((select count(*) from done)::numeric
                    / ((select count(*) from done) + (select count(*) from my_fails)), 2) end,
    case when (select count(*) from t where delivered_at is not null) = 0 then null
         else round((select count(*) from t where delivered_at is not null and delivered_at::date <= due_date)::numeric
                    / (select count(*) from t where delivered_at is not null), 2) end,
    (select round(avg(rating), 1) from reviews where reviewee_id = p_user),
    (select count(*) from reviews where reviewee_id = p_user)::int,
    (select count(*) from t where status = 'cancelled' and cancelled_by = p_user)::int,
    (select count(*) from t where status = 'incomplete' and i_failed)::int,
    (select count(distinct partner) from done)::int;
$$;
revoke execute on function public.rep_stats(uuid) from public, anon, authenticated;

create function public.reputation(p_user uuid)
returns table (
  trades_completed int,
  trades_accepted int,
  completion_rate numeric,
  on_time_rate numeric,
  avg_rating numeric,
  review_count int,
  cancellations int,
  incompletes int,
  unique_partners int
) language sql stable security definer set search_path = public, extensions as $$
  select * from rep_stats(p_user) where shares_org(p_user);
$$;
revoke execute on function public.reputation(uuid) from public, anon;
grant execute on function public.reputation(uuid) to authenticated;

-- ---------- 3. Auto-pause after reports ----------

alter table public.memberships
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

create or replace function public.is_active_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from memberships
                 where org_id = p_org and user_id = auth.uid() and suspended_at is null);
$$;

create or replace function public.handle_report()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if (select count(distinct reporter_id) from reports
      where org_id = new.org_id and reported_id = new.reported_id and resolved_at is null) >= 2 then
    update memberships
       set suspended_at = coalesce(suspended_at, now()),
           suspended_reason = coalesce(suspended_reason, 'Reported by 2 or more members')
     where org_id = new.org_id and user_id = new.reported_id and role <> 'admin';
  end if;
  return new;
end $$;

drop trigger if exists on_report_created on public.reports;
create trigger on_report_created after insert on public.reports
  for each row execute function public.handle_report();

-- Paused members can't start anything new.
drop policy if exists "interests: express within your org" on public.interests;
create policy "interests: express within your org" on public.interests
  for insert with check (
    from_user = auth.uid()
    and is_active_member(org_id)
    and exists (select 1 from memberships m where m.org_id = interests.org_id
                and m.user_id = interests.to_user and m.suspended_at is null)
    and not is_blocked_between(from_user, to_user));

drop policy if exists "messages: participants send" on public.messages;
create policy "messages: participants send" on public.messages
  for insert with check (
    sender_id = auth.uid() and in_match(match_id)
    and exists (select 1 from matches m where m.id = match_id
                and is_active_member(m.org_id) and not is_blocked_between(m.user_a, m.user_b)));

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
  update trades set status = case when p_accept then 'active' else 'declined' end,
                    accepted_at = case when p_accept then now() end
    where id = p_trade returning * into v_t;
  return v_t;
end $$;

-- Discover hides paused members and shows nothing to a paused caller.
drop function if exists public.discover(uuid, text);
create function public.discover(p_org uuid, p_query text default null)
returns table (
  user_id uuid,
  display_name text,
  headline text,
  availability text,
  avatar_url text,
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
    where m.org_id = p_org and m.user_id <> me.id and m.suspended_at is null
      and is_active_member(p_org)
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
  select p.id, p.display_name, p.headline, p.availability, p.avatar_url,
    coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill, 'level', s.level) order by s.category)
              from user_skills s where s.user_id = p.id and s.kind = 'offer'), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('category', s.category, 'skill', s.skill, 'level', s.level) order by s.category)
              from user_skills s where s.user_id = p.id and s.kind = 'need'), '[]'::jsonb),
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
  order by 8 desc, (p.avatar_url <> '') desc, p.display_name;
$$;

-- ---------- 4. Suspicious patterns for admins ----------

create or replace function public.org_flags(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  if not is_admin(p_org) then raise exception 'Admins only'; end if;
  with done as (
    select * from trades where org_id = p_org and status = 'completed'
  ),
  pairs as (
    select least(proposer_id, partner_id) a, greatest(proposer_id, partner_id) b, count(*) n
    from done group by 1, 2
  ),
  partners as (  -- distinct completed-trade partners per person, across all communities
    select u, count(distinct o) n from (
      select proposer_id u, partner_id o from trades where status = 'completed'
      union all select partner_id, proposer_id from trades where status = 'completed') x
    group by u
  ),
  closed_pairs as (
    select a, b, n from pairs
    where n >= 2
      and (select n from partners where u = a) = 1
      and (select n from partners where u = b) = 1
  ),
  fast as (
    select id, proposer_id, partner_id, extract(epoch from completed_at - accepted_at) / 60 as minutes
    from done where completed_at - accepted_at < interval '1 hour'
  ),
  reported as (
    select reported_id, count(distinct reporter_id) n from reports
    where org_id = p_org and resolved_at is null group by reported_id having count(distinct reporter_id) >= 1
  )
  select coalesce(jsonb_agg(f), '[]'::jsonb) into v from (
    select jsonb_build_object('kind', 'closed_pair', 'users', jsonb_build_array(a, b),
      'detail', n || ' completed trades with each other and no one else') f from closed_pairs
    union all
    select jsonb_build_object('kind', 'fast_trade', 'users', jsonb_build_array(proposer_id, partner_id),
      'trade_id', id, 'detail', 'Accepted and completed in ' || greatest(1, round(minutes)) || ' min') from fast
    union all
    select jsonb_build_object('kind', 'reported', 'users', jsonb_build_array(reported_id),
      'detail', 'Open reports from ' || n || ' member' || case when n > 1 then 's' else '' end) from reported
    union all
    select jsonb_build_object('kind', 'paused', 'users', jsonb_build_array(user_id),
      'detail', 'Paused ' || to_char(suspended_at, 'Mon DD') || ': ' || coalesce(suspended_reason, 'by an admin'))
    from memberships where org_id = p_org and suspended_at is not null
  ) flags;
  return v;
end $$;

-- ---------- Grants ----------
revoke execute on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_active_member(uuid) to authenticated;
revoke execute on function public.handle_report() from public, anon, authenticated;
revoke execute on function public.org_flags(uuid) from public, anon;
grant execute on function public.org_flags(uuid) to authenticated;
revoke execute on function public.discover(uuid, text) from public, anon;
grant execute on function public.discover(uuid, text) to authenticated;
revoke execute on function public.propose_trade(uuid, text, text, numeric, numeric, date, text) from public, anon;
grant execute on function public.propose_trade(uuid, text, text, numeric, numeric, date, text) to authenticated;
revoke execute on function public.respond_trade(uuid, boolean) from public, anon;
grant execute on function public.respond_trade(uuid, boolean) to authenticated;
