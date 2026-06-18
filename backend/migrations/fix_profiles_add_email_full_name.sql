-- Fix: signup failing with "Database error saving new user"
--
-- Root cause: the on_auth_user_created trigger (handle_new_user) inserts into
-- public.profiles (id, email, username), but the profiles table never had an
-- `email` column. Every new auth user therefore threw
--   column "email" of relation "profiles" does not exist
-- which rolled back the auth.users insert -> 500 on /signup and /admin/users.
--
-- `full_name` is added in the same migration because the sharing features
-- (pantry_sharing.py, shopping_list_sharing.py) select email, full_name from
-- profiles and were silently broken for the same reason.

alter table public.profiles add column if not exists email     text;
alter table public.profiles add column if not exists full_name text;

-- Backfill the two existing users from auth.users so lookups work for them too.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;
