-- Public portfolios: opt-in page at /p/<username> showing verified, completed trades.

alter table public.profiles
  add column if not exists username text unique
    check (username ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'),
  add column if not exists portfolio_public boolean not null default false;

-- Each side can hide a completed trade from their own portfolio.
alter table public.trades
  add column if not exists proposer_showcase boolean not null default true,
  add column if not exists partner_showcase boolean not null default true;

-- Reputation numbers without the shared-community check (internal only).
create or replace function public.rep_stats(p_user uuid)
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
    (select count(*) from t where status = 'cancelled' and cancelled_by = p_user)::int;
$$;
revoke execute on function public.rep_stats(uuid) from public, anon, authenticated;

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
  select * from rep_stats(p_user) where shares_org(p_user);
$$;

-- Hide or show one of your completed trades on your portfolio.
create or replace function public.set_showcase(p_trade uuid, p_show boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update trades
     set proposer_showcase = case when proposer_id = auth.uid() then p_show else proposer_showcase end,
         partner_showcase  = case when partner_id  = auth.uid() then p_show else partner_showcase end
   where id = p_trade and auth.uid() in (proposer_id, partner_id);
  if not found then raise exception 'Trade not found'; end if;
end $$;

-- Everything the public page needs, readable without signing in.
-- Returns null unless the person has turned their portfolio on.
-- A partner's name and photo appear only if that partner's portfolio is public too.
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
          'partner', (select jsonb_build_object('name', pp.display_name, 'avatar_url', pp.avatar_url, 'username', pp.username)
                      from profiles pp where pp.id = i.partner_id and pp.portfolio_public)
        ) order by i.completed_at desc)
        from items i), '[]'::jsonb)
    ) from p
  ) end;
$$;

revoke execute on function public.set_showcase(uuid, boolean) from public, anon;
grant execute on function public.set_showcase(uuid, boolean) to authenticated;
revoke execute on function public.public_portfolio(text) from public;
grant execute on function public.public_portfolio(text) to anon, authenticated;
