-- Let sample (test) members use portraits shipped with the site under /samples/.
-- Real members still upload to the avatars storage bucket only.
alter table public.profiles drop constraint if exists avatar_url_from_storage;
alter table public.profiles add constraint avatar_url_from_storage check (
  avatar_url = ''
  or avatar_url like 'https://%/storage/v1/object/public/avatars/%'
  or avatar_url ~ '^/samples/[a-z0-9/-]+\.(jpg|png|webp)$'
);
