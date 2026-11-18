-- Identity verification via LinkedIn and GitHub sign-in.
-- Badges are set only by the database, from auth.identities, never by the user.

alter table public.profiles
  add column if not exists verified_github text,          -- GitHub username
  add column if not exists verified_linkedin boolean not null default false;

-- Users may edit only these profile columns. Verification columns are off-limits.
revoke update on public.profiles from authenticated, anon;
grant update (display_name, headline, bio, portfolio_url, availability, avatar_url, username, portfolio_public)
  on public.profiles to authenticated;

create or replace function public.sync_verification(p_user uuid)
returns void language sql security definer set search_path = public, extensions as $$
  update profiles set
    verified_github = (
      select coalesce(i.identity_data->>'user_name', i.identity_data->>'preferred_username')
      from auth.identities i where i.user_id = p_user and i.provider = 'github'
      order by i.created_at desc limit 1),
    verified_linkedin = exists (
      select 1 from auth.identities i where i.user_id = p_user and i.provider in ('linkedin_oidc', 'linkedin'))
  where id = p_user;
$$;

create or replace function public.handle_identity_change()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  perform sync_verification(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end $$;

drop trigger if exists on_identity_change on auth.identities;
create trigger on_identity_change after insert or update or delete on auth.identities
  for each row execute function public.handle_identity_change();

-- The profile row is created after the first identity on sign-up, so sync again then.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name',
                           split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  perform sync_verification(new.id);
  return new;
end $$;

-- Backfill anyone who already signed in with a provider.
select sync_verification(id) from profiles;

revoke execute on function public.sync_verification(uuid) from public, anon, authenticated;
revoke execute on function public.handle_identity_change() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Discover returns verification; verified people rank a little higher among equal fits.
drop function if exists public.discover(uuid, text);
create function public.discover(p_org uuid, p_query text default null)
returns table (
  user_id uuid,
  display_name text,
  headline text,
  availability text,
  avatar_url text,
  verified_github text,
  verified_linkedin boolean,
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
  select p.id, p.display_name, p.headline, p.availability, p.avatar_url, p.verified_github, p.verified_linkedin,
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
  order by 10 desc,
    (p.verified_github is not null or p.verified_linkedin) desc,
    (p.avatar_url <> '') desc,
    p.display_name;
$$;
revoke execute on function public.discover(uuid, text) from public, anon;
grant execute on function public.discover(uuid, text) to authenticated;

-- Public portfolio shows verification badges (and partners' badges).
create or replace function public.public_portfolio(p_username text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with p as (
    select * from profiles where username = lower(p_username) and portfolio_public
  ),
  items as (
    select t.id, t.completed_at,
      case when t.proposer_id = p.id then t.proposer_gives else t.partner_gives end as delivered,
      case when t.proposer_id = p.id then t.proposer_hours else t.partner_hours end as hours,
      case when t.proposer_id = p.id then t.partner_gives else t.proposer_gives end as received,
      case when t.proposer_id = p.id then t.partner_id else t.proposer_id end as partner_id,
      case when t.proposer_id = p.id then t.proposer_delivery_confirmed_at else t.partner_delivery_confirmed_at end <= (t.due_date + 1)::timestamptz as on_time
    from trades t, p
    where t.status = 'completed' and p.id in (t.proposer_id, t.partner_id)
      and case when t.proposer_id = p.id then t.proposer_showcase else t.partner_showcase end
  )
  select case when not exists (select 1 from p) then null else (
    select jsonb_build_object(
      'name', p.display_name,
      'username', p.username,
      'headline', p.headline,
      'bio', p.bio,
      'avatar_url', p.avatar_url,
      'link', p.portfolio_url,
      'member_since', p.created_at,
      'verified_github', p.verified_github,
      'verified_linkedin', p.verified_linkedin,
      'stats', (select to_jsonb(r) from rep_stats(p.id) r),
      'trades', coalesce((
        select jsonb_agg(jsonb_build_object(
          'delivered', i.delivered,
          'hours', i.hours,
          'received', i.received,
          'completed_at', i.completed_at,
          'on_time', i.on_time,
          'proof', coalesce((
            select jsonb_agg(jsonb_build_object('title', m.title, 'url', m.proof_url) order by m.created_at)
            from milestones m
            where m.trade_id = i.id and m.owner_id = p.id and m.confirmed_at is not null and m.proof_url is not null), '[]'::jsonb),
          'review', (select jsonb_build_object('rating', rv.rating, 'comment', rv.comment)
                     from reviews rv where rv.trade_id = i.id and rv.reviewee_id = p.id),
          'partner_verified', (select pp.verified_github is not null or pp.verified_linkedin
                               from profiles pp where pp.id = i.partner_id),
          'partner', (select jsonb_build_object('name', pp.display_name, 'avatar_url', pp.avatar_url, 'username', pp.username,
                                                'verified', pp.verified_github is not null or pp.verified_linkedin)
                      from profiles pp where pp.id = i.partner_id and pp.portfolio_public)
        ) order by i.completed_at desc)
        from items i), '[]'::jsonb)
    ) from p
  ) end;
$$;
revoke execute on function public.public_portfolio(text) from public;
grant execute on function public.public_portfolio(text) to anon, authenticated;

-- Admin flags: unverified members in closed pairs are the main fake-account signal,
-- so expose verification to admins through the existing profile read policy (no change needed).
