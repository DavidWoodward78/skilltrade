-- Profile photos: avatar_url on profiles + a public "avatars" storage bucket.
-- Each user can only write inside a folder named after their user id.

alter table public.profiles add column if not exists avatar_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- discover() now returns the photo too
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
  -- people with photos rank slightly higher among equal fits
  order by 8 desc, (p.avatar_url <> '') desc, p.display_name;
$$;

revoke execute on function public.discover(uuid, text) from public, anon;
grant execute on function public.discover(uuid, text) to authenticated;

-- Only photos stored in this project's avatars bucket are allowed.
alter table public.profiles add constraint avatar_url_from_storage
  check (avatar_url = '' or avatar_url like 'https://%/storage/v1/object/public/avatars/%');
