-- "Interested in you" on Discover: let the receiver set an interest aside, and
-- share one definition of "waiting for your answer" between the page and the badge.
alter table public.interests add column if not exists dismissed_at timestamptz;

create or replace function public.dismiss_interest(p_org uuid, p_from uuid)
returns void language sql security definer set search_path = public, extensions as $$
  update interests set dismissed_at = now()
  where org_id = p_org and from_user = p_from and to_user = auth.uid();
$$;
revoke execute on function public.dismiss_interest(uuid, uuid) from public, anon;
grant execute on function public.dismiss_interest(uuid, uuid) to authenticated;

create or replace function public.incoming_interest(p_org uuid)
returns setof uuid language sql stable security definer set search_path = public, extensions as $$
  select i.from_user from interests i
  where i.org_id = p_org and i.to_user = auth.uid() and i.dismissed_at is null and is_member(p_org)
    and not exists (select 1 from interests b where b.org_id = p_org and b.from_user = auth.uid() and b.to_user = i.from_user)
    and not is_blocked_between(auth.uid(), i.from_user)
    and exists (select 1 from memberships m where m.org_id = p_org and m.user_id = i.from_user and m.suspended_at is null)
  order by i.created_at desc;
$$;
revoke execute on function public.incoming_interest(uuid) from public, anon;
grant execute on function public.incoming_interest(uuid) to authenticated;

-- nav_counts: 'discover' now = (select count(*) from incoming_interest(p_org));
-- full definition as applied lives in the live project (same as 000500 otherwise).
