-- Notification badges for the bottom menu.

-- When each person last opened each chat.
create table if not exists public.match_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
alter table public.match_reads enable row level security;
drop policy if exists "match_reads: own" on public.match_reads;
create policy "match_reads: own" on public.match_reads
  for select using (user_id = auth.uid());

create or replace function public.mark_match_read(p_match uuid)
returns void language sql security definer set search_path = public, extensions as $$
  insert into match_reads (match_id, user_id, last_read_at)
  select p_match, auth.uid(), now()
  where in_match(p_match)
  on conflict (match_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;

create or replace function public.nav_counts(p_org uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with me as (select auth.uid() as id)
  select case when not is_member(p_org) then '{}'::jsonb else jsonb_build_object(
    -- people interested in me that I haven't answered (no interest back, no match)
    'discover', (
      select count(*) from interests i, me
      where i.org_id = p_org and i.to_user = me.id
        and not exists (select 1 from interests b where b.org_id = p_org and b.from_user = me.id and b.to_user = i.from_user)
        and not is_blocked_between(me.id, i.from_user)
        and exists (select 1 from memberships m where m.org_id = p_org and m.user_id = i.from_user and m.suspended_at is null)),
    -- chats with something new: never opened, or a message from them since I last looked
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
    -- trades waiting on me
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
      else 0 end
  ) end;
$$;

revoke execute on function public.mark_match_read(uuid) from public, anon;
grant execute on function public.mark_match_read(uuid) to authenticated;
revoke execute on function public.nav_counts(uuid) from public, anon;
grant execute on function public.nav_counts(uuid) to authenticated;
