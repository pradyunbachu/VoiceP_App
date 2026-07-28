# Pantry Switching Rearchitecture — Design

**Date:** 2026-07-28
**Branch:** `feature/pantry-switching-rearchitecture`
**Status:** Approved design → implementation

## Problem

Pantry scope is inconsistent across the app. A user "switches" pantries (e.g. to the demo/sample pantry or a shared group) but only some screens and code paths honor the switch:

- **Voice/chat (Voxy) is pantry-blind.** `/api/chat` and `/api/chat/confirm` send no pantry identifier, so every voice/manual command mutates the user's real *personal* pantry regardless of what's selected on screen.
- **Manual "add item" ignores the selected pantry.** `Pantry.tsx` reads from the selected group but writes without `group_id`, so new items land in the personal pantry and vanish from the filtered view.
- **The "demo" pantry is a client-only sentinel.** It's 19 hardcoded items (`constants/demoPantry.ts`) toggled by a `"demo"` string. Substitution is partial — `HomeDashboard` swaps only the item list (stats/shopping/recs still read real data); `MealPlanner`/`SavedRecipes` ignore demo entirely.
- **Backend write/read asymmetry.** Reads with `group_id` resolve the group owner's rows, but creates always write to the caller's own `user_id`. Edits/deletes honor group membership; creates do not. Chat handlers, `shopping-list/match-pantry`, and expiry notifications are all hardcoded to the caller's personal pantry.

**Root cause:** the selected pantry lives in a single un-persisted `useState` in `App.tsx` (`selectedPantryGroup: number | null | "demo"`), manually drilled as a prop. The paths wired up latest (Voxy agent, create mutation) never received it, and the client-only `"demo"` sentinel is invisible to the backend.

## Goals

1. Switching pantries switches **everything** — every read, write, voice/chat command, recs, meal planning — from one shared source of truth.
2. Add a pantry-switcher **dropdown in the top-right nav**.
3. Make the demo pantry a **real, per-user, editable onboarding sandbox** with a **reset** capability.
4. Persist the selected pantry across refreshes.

## Non-goals

- No new `pantries` table / `pantry_id`-on-every-row migration. Reuse the existing group model.
- No cleanup of existing users' previously-seeded personal demo items (see Migration).
- No change to how shopping-list sharing works (separate `group_id`-column mechanism, left as-is).

## Core architecture

**One addressing model.** Every pantry is addressed by a **nullable group id**:
- `My Pantry` → `group_id = null` → the user's personal `pantry_items` rows.
- `Demo Pantry` → a real pantry group owned by the user, seeded with sample items.
- Shared groups → unchanged.

This eliminates the client-only `"demo"` sentinel. All pantries flow through the same code path.

**One shared state.** A `PantryContext` provider in `App.tsx` holds the selected pantry (`number | null`) and setter, hydrated from `localStorage` on load. Every read hook, write hook, and the voice/chat calls consume the selected group id from this context instead of a drilled prop. Flipping it once updates the whole app, Voxy included.

**Owner-indirection (unchanged mechanism).** Shared/demo pantry access continues to resolve `group_id → owner's user_id` and operate on that owner's rows. We do NOT start populating the dead `pantry_items.group_id` column; we make **writes** consistent with the existing **read** indirection instead.

## Demo pantry lifecycle

- **Auto-created once per user.** On first login the backend creates a `Demo Pantry` group owned by the user and seeds the sample items. Gated by a real server-side check (replaces the `voxal_demo_seeded` localStorage flag).
- **Fully real & editable.** A normal pantry group — add/edit/delete, voice/chat, recs, meal planning all work on it. No special-case code.
- **Reset.** `POST /pantry/demo/reset` deletes all items in the user's demo group and re-seeds the original sample set. Fronted by a "Reset Demo Pantry" button (shown in the switcher when demo is selected) behind a confirm dialog.
- **First-run default.** When no `localStorage` selection exists, default to the Demo Pantry **only if the user's personal pantry is empty** (i.e. a genuinely new user); otherwise default to My Pantry so existing users aren't yanked into demo on the first load after deploy. Once the user switches, `localStorage` remembers the choice.

## Backend changes

- **Group-aware writes.** Add `group_id` to `PantryItemCreate`. Introduce a shared `resolve_pantry_user_id(group_id, current_user)` helper (mirroring the read-side owner-indirection, with membership verification). Route every write path through it:
  `POST /pantry`, `POST /pantry/from-expense`, `POST /pantry/store-trip`, `DELETE /pantry/bulk`, `POST /pantry/resync`, `POST /pantry/seed-demo`.
- **Pantry-aware voice/chat.** `/api/chat` and `/api/chat/confirm` accept `group_id`; thread it into `handlers/pantry_handler.py` and `handlers/suggestion_handler.py` so Voxy reads/writes the selected pantry.
- **Group-aware ancillaries.** `shopping-list/match-pantry` (`routes/shopping_list.py`) and expiry notifications (`routes/notifications.py`) resolve the pantry via the same helper.
- **New/changed endpoints:**
  - `POST /pantry/demo/reset` — wipe + re-seed the caller's demo group.
  - Demo group auto-creation on first login (server-side gate).

### Request/response contract (pinned — shared by both agents)

- **Reads** (already partially present): `group_id` passed as a query param; omitted/absent ⇒ personal pantry. Applies to `GET /pantry`, `/pantry/stats`, `/daily-recs`, meal-plan reads.
- **Writes**: `group_id` included in the JSON body (nullable). Absent/`null` ⇒ personal pantry. Applies to pantry create paths, `/api/chat`, `/api/chat/confirm`, `/cook-meal` (already sends it).
- **Membership failure**: endpoints return `403` when a `group_id` is supplied that the user isn't a member of (reuse existing `verify_pantry_group_membership`).
- **Demo reset**: `POST /pantry/demo/reset` takes no body; operates on the caller's demo group; returns the re-seeded item list.

## Frontend changes

- **`PantryContext`** provider in `App.tsx`: `{ selectedGroupId: number | null, setSelectedGroupId }`, persisted to `localStorage` (key e.g. `voxal_selected_pantry`). Replaces the drilled `selectedPantryGroup` prop and the `"demo"` sentinel type across all consumers.
- **All hooks source the group id from context** — reads (`usePantry`, `usePantryStats`, `useDailyRecs`, `useMealPlan`, `useShoppingList` pantry-match), the create mutation (`useCreatePantryItem` — currently drops it), and chat/voice mutations (`useChatMutation` — currently blind, plus `QuickRecordPopup`/`useVoiceProcessor`).
- **Lift `PantryGroupSelector` into `Navigation.tsx`** top-right (`.nav-user` region, before the avatar), reusing the existing Finance-dropdown pattern for styling/outside-click. Remove the duplicate instance on the Pantry page (`Pantry.tsx:768`). The selector consumes `PantryContext`.
- **Remove dead/inconsistent code:** `constants/demoPantry.ts` client substitution and all `"demo"`-sentinel branches; the unused `DailyRecs.tsx` component.
- **Reset affordance** in the selector when the demo pantry is selected → calls `POST /pantry/demo/reset`, invalidates pantry queries.

## Migration / existing users

- Existing users previously had demo items seeded directly into their **personal** pantry (old `seed-demo`). **Leave these alone** — do not delete, to avoid destroying data a user may have kept. Demo-group creation applies going forward; on next login existing users get a fresh Demo group created (empty of their personal data), seeded with samples.
- The dead `pantry_items.group_id` column and its RLS policies remain untouched (not used by the new code either).

## Testing

- **Backend:** unit/integration tests that a create with `group_id` lands in the owner's rows; that `/api/chat` with `group_id` mutates the selected pantry; that `/pantry/demo/reset` wipes + re-seeds; that a non-member `group_id` returns 403.
- **Frontend:** context switch updates all consumers; create/voice write to the selected pantry; persistence across reload; the nav dropdown switches pantries and the reset flow works.
- **End-to-end sanity:** switch to demo → add via voice → item appears in demo only → reset → back to seed set; switch to My Pantry → real data intact.

## Execution (parallel agents, isolated worktrees)

- **Agent A — backend:** model/`group_id` writes, chat/handler threading, demo endpoints + auto-create, ancillaries. Owns `backend/`.
- **Agent B — frontend:** `PantryContext`, hook wiring, nav dropdown, dead-code removal, reset UI. Owns `frontend/`.
- Shared **request/response contract** (above) pins the interface so the two don't diverge.
- Integrate on the feature branch, run tests, then open a **PR for review before merge** (no direct-to-main).
