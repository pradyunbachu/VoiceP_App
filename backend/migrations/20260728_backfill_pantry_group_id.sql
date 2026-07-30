-- Backfill pantry_items.group_id for existing NON-demo shared groups.
--
-- Context: pantry scoping is moving from owner-user_id indirection to the
-- pantry_items.group_id column (matching how shopping_list already scopes).
-- Today every pantry_items.group_id is NULL, and a shared group surfaces the
-- OWNER's personal rows. To preserve shared-pantry contents under the new
-- scoping we stamp the owner's currently-personal items with the group id.
--
-- Demo groups are created fresh + seeded by the application (Task A3), so they
-- are excluded here (name = 'Demo Pantry').
--
-- Personal items and old personal-demo items (seeded directly into the personal
-- pantry by the legacy seed-demo endpoint) intentionally stay group_id IS NULL,
-- so they remain visible in "My Pantry".
--
-- !! DO NOT execute this file blindly. See the ambiguity caveat below. !!

-- ---------------------------------------------------------------------------
-- SAFETY CHECK (run FIRST, do not skip):
-- The blanket UPDATE below is only correct if no owner belongs to more than one
-- NON-demo group. If an owner owns/belongs to multiple non-demo groups, this
-- rule is ambiguous (which group should the owner's personal items belong to?).
-- In that case DO NOT run the UPDATE: leave those items personal (safe) and
-- record the limitation in the PR.
--
-- Run this query to confirm the data shape before applying:
--
--   SELECT pg.owner_id, count(*) AS non_demo_group_count
--   FROM pantry_groups pg
--   WHERE pg.name <> 'Demo Pantry'
--   GROUP BY pg.owner_id
--   HAVING count(*) > 1;
--
-- Expected for a safe backfill: ZERO rows. If any rows are returned, stop and
-- handle those owners manually instead of running the blanket UPDATE.
-- ---------------------------------------------------------------------------

BEGIN;

UPDATE pantry_items pi
SET group_id = pg.id
FROM pantry_groups pg
WHERE pg.owner_id = pi.user_id
  AND pg.name <> 'Demo Pantry'
  AND pi.group_id IS NULL;

COMMIT;
