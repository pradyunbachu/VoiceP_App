# Pantry Switching Rearchitecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pantry selection consistent across every read, write, and voice/chat path from one shared source of truth, add a top-right pantry switcher, and turn the demo pantry into a real per-user editable onboarding sandbox with reset.

**Architecture:** Every pantry is addressed by a nullable group id (`null` = personal, a group id = demo or shared group). The backend scopes pantry rows via the `pantry_items.group_id` column (personal = `group_id IS NULL AND user_id = me`; group = `group_id = X` after membership check) — the same model `shopping_list` already uses. (This CORRECTS an earlier owner-indirection idea, which can't represent a demo pantry owned by the same user.) The frontend replaces the drilled `selectedPantryGroup` prop + client-only `"demo"` sentinel with a persisted `PantryContext` consumed by all hooks and the nav switcher.

**Tech Stack:** FastAPI + Supabase (Python) backend; React 18 + Vite + TanStack React Query (TypeScript) frontend.

## Global Constraints

- Pantry access model: reuse `pantry_groups` / `pantry_group_members` AND the existing (currently unused) `pantry_items.group_id` column. Scope rows by `group_id` (personal = `group_id IS NULL AND user_id = me`; group = `group_id = X`). Do NOT add a `pantries` table. Do NOT use owner-`user_id` indirection for scoping.
- Contract — reads: `group_id` as query param, absent ⇒ personal pantry (`group_id IS NULL`).
- Contract — writes: `group_id` in JSON body, absent/`null` ⇒ personal; a value sets `pantry_items.group_id` on the new row.
- Contract — membership failure: `403` via existing `verify_pantry_group_membership`.
- Demo pantry = a real `pantry_groups` row owned by the user, name `"Demo Pantry"`; its items carry that group's `group_id`, seeded from the existing demo sample set.
- Do NOT delete existing users' previously-seeded personal demo items (they stay `group_id IS NULL` in My Pantry).
- Existing shared groups: backfill their items' `group_id` via one-time migration (Task A0).
- Git: work on branch `feature/pantry-switching-rearchitecture`; integrate, then open a PR — never merge to `main` directly.
- Frontend `localStorage` key for selection: `voxal_selected_pantry`.

---

## Execution model

Two tracks run as **parallel agents in isolated git worktrees**:

- **Agent A — Backend** owns everything under `backend/`. Tasks A1–A5.
- **Agent B — Frontend** owns everything under `frontend/`. Tasks B1–B5.

The tracks share only the request/response contract in Global Constraints, so they can proceed independently. **Track C** (integration) runs after both land on the feature branch.

Within each track, tasks are ordered by dependency and each ends with a commit. Follow TDD where a test harness exists (`backend/pytest.ini` + `backend/tests/` for Python; check `frontend/` for `vitest` before writing frontend tests — if absent, verify via typecheck + the manual steps noted per task rather than inventing a framework).

---

# TRACK A — BACKEND (Agent A)

### Task A0: Backfill migration for existing shared groups

Before scoping switches to the `group_id` column, existing shared-group items (currently all `group_id IS NULL`) must be stamped so shared pantries keep their contents.

**Files:**
- Create: `backend/migrations/<timestamp>_backfill_pantry_group_id.sql`
- Test: manual verification against a DB snapshot (SQL migration; no unit test harness).

**Interfaces:**
- Produces: every `pantry_items` row that belongs to a shared pantry has `group_id` set; personal + old personal-demo items remain `group_id IS NULL`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Backfill pantry_items.group_id for existing NON-demo shared groups.
-- Today a shared group surfaces the OWNER's personal rows, so we stamp the
-- owner's currently-personal items with the group id. Demo groups are created
-- fresh (Task A3) and are excluded here.
UPDATE pantry_items pi
SET group_id = pg.id
FROM pantry_groups pg
WHERE pg.owner_id = pi.user_id
  AND pg.name <> 'Demo Pantry'
  AND pi.group_id IS NULL;
```
> Caveat: if an owner belongs to multiple shared groups this rule is ambiguous — in that case DO NOT run the blanket UPDATE; instead leave items personal (safe) and record the limitation in the PR. Confirm the current data shape (how many owners have >1 non-demo group) before applying.

- [ ] **Step 2: Verify against a snapshot**

Run the migration on a copy/staging DB. Confirm: shared-group members still see the group's items via `GET /pantry?group_id=X`; personal `GET /pantry` no longer shows those items; old personal-demo items (`notes='Demo item'`, `group_id IS NULL`) still show in My Pantry.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/
git commit -m "feat(backend): backfill pantry_items.group_id for existing shared groups"
```

---

### Task A1: `group_id`-column scoping helpers

`backend/routes/pantry_sharing.py` already hosts `verify_pantry_group_membership` (`:26`). Add two helpers that all pantry reads/writes share, replacing the owner-indirection `_resolve_pantry_user_id` currently in `meal_plan.py:37`.

**Files:**
- Modify: `backend/routes/pantry_sharing.py` — add `verify_pantry_access` + `scope_pantry_query`.
- Modify: `backend/routes/meal_plan.py:37` — delete `_resolve_pantry_user_id`; switch its read call sites to `scope_pantry_query`.
- Test: `backend/tests/test_pantry_sharing.py`

**Interfaces:**
- Produces:
  - `verify_pantry_access(current_user_id: str, group_id: int | None) -> None` — no-op for `None`; raises `HTTPException(403)` if not a member of `group_id`.
  - `scope_pantry_query(query, current_user_id: str, group_id: int | None)` — returns `query.eq("group_id", group_id)` for a group, else `query.eq("user_id", current_user_id).is_("group_id", "null")` for personal. (Caller verifies access first for groups.)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_pantry_sharing.py
import pytest
from fastapi import HTTPException
from routes import pantry_sharing

class _Q:  # records the filters applied
    def __init__(self): self.calls = []
    def eq(self, k, v): self.calls.append(("eq", k, v)); return self
    def is_(self, k, v): self.calls.append(("is_", k, v)); return self

def test_access_noop_for_personal():
    pantry_sharing.verify_pantry_access("user-1", None)  # must not raise

def test_access_403_for_non_member(monkeypatch):
    monkeypatch.setattr(pantry_sharing, "verify_pantry_group_membership", lambda u, g: False)
    with pytest.raises(HTTPException) as exc:
        pantry_sharing.verify_pantry_access("user-1", 42)
    assert exc.value.status_code == 403

def test_scope_personal_filters_null_group():
    q = _Q()
    pantry_sharing.scope_pantry_query(q, "user-1", None)
    assert ("eq", "user_id", "user-1") in q.calls
    assert ("is_", "group_id", "null") in q.calls

def test_scope_group_filters_group_id():
    q = _Q()
    pantry_sharing.scope_pantry_query(q, "user-1", 42)
    assert ("eq", "group_id", 42) in q.calls
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pantry_sharing.py -v`
Expected: FAIL (`verify_pantry_access` / `scope_pantry_query` undefined)

- [ ] **Step 3: Implement the helpers in `pantry_sharing.py`**

```python
def verify_pantry_access(current_user_id: str, group_id: int | None) -> None:
    if group_id is None:
        return
    if not verify_pantry_group_membership(current_user_id, group_id):
        raise HTTPException(status_code=403, detail="Not a member of this pantry group")

def scope_pantry_query(query, current_user_id: str, group_id: int | None):
    """Apply pantry scoping to a supabase query builder.
    Personal = user's own rows with no group; group = all rows for that group."""
    if group_id is None:
        return query.eq("user_id", current_user_id).is_("group_id", "null")
    return query.eq("group_id", group_id)
```
Ensure `HTTPException` is imported at the top of `pantry_sharing.py`.

- [ ] **Step 4: Migrate `meal_plan.py` reads**

Delete `_resolve_pantry_user_id` in `backend/routes/meal_plan.py:37`. At each of its read sites (`:176,387,551,702`) call `verify_pantry_access(current_user_id, group_id)` then build the pantry query with `scope_pantry_query(supabase.table("pantry_items").select(...), current_user_id, group_id)`.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_pantry_sharing.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/routes/pantry_sharing.py backend/routes/meal_plan.py backend/tests/test_pantry_sharing.py
git commit -m "feat(backend): group_id-column scoping helpers for pantry access"
```

---

### Task A2: Group-scoped pantry reads + writes

Add `group_id` to the create schema; writes set `group_id` on the row (verifying access for groups); reads scope via `scope_pantry_query`.

**Files:**
- Modify: `backend/schemas.py:102` (`PantryItemCreate`) — add `group_id`.
- Modify: `backend/routes/pantry.py` — reads `GET /pantry` (`:143`), `/pantry/stats` (`:618`); writes `create_pantry_item` (`:251`), `from-expense` (`:318`), `store-trip` (`:407`), `bulk delete` (`:576`), `resync` (`:755`).
- Test: `backend/tests/test_pantry_writes.py`

**Interfaces:**
- Consumes: `verify_pantry_access`, `scope_pantry_query` (Task A1).
- Produces: pantry create accepts optional body field `group_id: int | None`; the new row's `group_id` = that value; existing-item merge lookup (`_find_existing_pantry_item`) is scoped to the same pantry (personal-null vs group).

- [ ] **Step 1: Add `group_id` to `PantryItemCreate`**

In `backend/schemas.py`, inside `class PantryItemCreate` (after `expiration_predicted`):
```python
    group_id: Optional[int] = Field(default=None)
```

- [ ] **Step 2: Write the failing test**

```python
# backend/tests/test_pantry_writes.py
from schemas import PantryItemCreate

def test_pantry_create_accepts_group_id():
    assert PantryItemCreate(name="Milk", group_id=42).group_id == 42

def test_pantry_create_group_id_defaults_none():
    assert PantryItemCreate(name="Milk").group_id is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_pantry_writes.py -v`
Expected: FAIL (validation error) → PASS after Step 1.

- [ ] **Step 4: Scope `create_pantry_item`**

In `backend/routes/pantry.py` `create_pantry_item`, near the top:
```python
from routes.pantry_sharing import verify_pantry_access
verify_pantry_access(current_user["id"], item.group_id)
```
- The existing-item merge lookup must be scoped to the SAME pantry: update `_find_existing_pantry_item` to accept `group_id` and apply `scope_pantry_query` (personal → `group_id IS NULL`; group → `group_id = X`). Replace `_find_existing_pantry_item(current_user["id"], item_name)` with the group-aware call.
- On insert, add `"group_id": item.group_id` to the row dict; keep `"user_id": current_user["id"]` (the creator).

- [ ] **Step 5: Scope the reads**

`GET /pantry` (`:143`) and `/pantry/stats` (`:618`) currently resolve an owner id. Replace that with: `verify_pantry_access(current_user["id"], group_id)` then build the query via `scope_pantry_query(supabase.table("pantry_items").select(...), current_user["id"], group_id)`.

- [ ] **Step 6: Apply to the other write paths**

For `from-expense` (`:318`), `store-trip` (`:407`), `bulk delete` (`:576`), `resync` (`:755`): accept optional `group_id` (body/param), `verify_pantry_access(...)`, set `"group_id"` on inserted rows, and scope any pre-write lookups/deletes with `scope_pantry_query`. Leave non-pantry `current_user["id"]` uses (expense ownership, audit) untouched.

- [ ] **Step 7: Write a scoping test**

```python
# backend/tests/test_pantry_writes.py (append)
def test_create_sets_group_id_on_row(monkeypatch):
    import routes.pantry as pantry_mod
    captured = {}
    monkeypatch.setattr(pantry_mod, "verify_pantry_access", lambda uid, gid: None)
    # stub the insert to capture the row dict; assert row["group_id"] == 42 when item.group_id=42
    # and row["group_id"] is None for a personal create.
```
(Adapt to the stub/fixture style in `backend/tests/`.)

- [ ] **Step 8: Run tests**

Run: `cd backend && python -m pytest tests/test_pantry_writes.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/schemas.py backend/routes/pantry.py backend/tests/test_pantry_writes.py
git commit -m "feat(backend): scope pantry reads/writes by group_id column"
```

---

### Task A3: Demo pantry as a real group + reset + auto-create

**Files:**
- Modify: `backend/routes/pantry.py` — repurpose `seed-demo` (`:674`), add `POST /pantry/demo/reset`, add first-login demo-group creation.
- Reference: existing demo item list in `seed-demo` (`pantry.py:674-752`) is the seed source of truth.
- Test: `backend/tests/test_demo_pantry.py`

**Interfaces:**
- Produces:
  - `ensure_demo_group(user_id) -> int` — returns the user's demo group id, creating + seeding it once if absent.
  - `POST /pantry/demo/reset` — deletes all items scoped to the caller's demo `group_id`, re-seeds, returns the seeded items.
- Demo items carry `group_id = <demo group id>` (NOT scoped by the `notes` field). This keeps them out of personal `GET /pantry` (`group_id IS NULL`) automatically.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_demo_pantry.py
def test_ensure_demo_group_creates_once(monkeypatch):
    import routes.pantry as pantry_mod
    # stub supabase: first call finds no demo group, creates one with id 7, seeds items
    # assert ensure_demo_group returns 7 and a second call returns 7 without re-seeding
    ...

def test_demo_reset_wipes_and_reseeds(monkeypatch):
    import routes.pantry as pantry_mod
    # stub supabase; assert delete-by-group-owner then insert of the sample set
    ...
```
(Flesh out with the `backend/tests/` stub conventions.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_demo_pantry.py -v`
Expected: FAIL (`ensure_demo_group` undefined)

- [ ] **Step 3: Implement `ensure_demo_group` + reset**

```python
DEMO_GROUP_NAME = "Demo Pantry"

def _demo_sample_items() -> list[dict]:
    """The canonical demo seed set (moved out of the old seed-demo body)."""
    return [ ... ]  # lift the hardcoded list from the old seed-demo endpoint

def ensure_demo_group(user_id: str) -> int:
    existing = supabase.table("pantry_groups").select("id").eq("owner_id", user_id).eq("name", DEMO_GROUP_NAME).execute()
    if existing.data:
        return existing.data[0]["id"]
    grp = supabase.table("pantry_groups").insert({"owner_id": user_id, "name": DEMO_GROUP_NAME}).execute()
    gid = grp.data[0]["id"]
    supabase.table("pantry_group_members").insert({"group_id": gid, "user_id": user_id}).execute()
    _seed_demo_items(user_id, gid)
    return gid

def _seed_demo_items(owner_id: str, group_id: int) -> list[dict]:
    # Demo items carry the demo group_id so personal GET /pantry (group_id IS NULL) never shows them.
    rows = [{**it, "user_id": owner_id, "group_id": group_id, "notes": "Demo item"} for it in _demo_sample_items()]
    return supabase.table("pantry_items").insert(rows).execute().data
```

```python
@router.post("/pantry/demo/reset")
@limiter.limit("10/minute")
async def reset_demo_pantry(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    gid = ensure_demo_group(current_user["id"])
    # Scope the wipe to the demo group_id — never touches personal (group_id IS NULL) rows.
    supabase.table("pantry_items").delete().eq("group_id", gid).execute()
    items = _seed_demo_items(current_user["id"], gid)
    return {"message": "Demo pantry reset", "group_id": gid, "items": items}
```
> Scoping by `group_id` (not `notes`) means reset can never delete a user's real personal items, and demo items are invisible to personal `GET /pantry`. No special-case filtering needed anywhere else.

- [ ] **Step 4: Wire first-login auto-create**

Where the app currently triggers `seed-demo` on first login (frontend did this; now server-owned), add demo-group creation. Simplest: call `ensure_demo_group(current_user["id"])` inside an existing "on auth / me" endpoint, or expose `GET /pantry/groups` (already used by the selector) to lazily `ensure_demo_group` before returning the list. Choose the path that the frontend group-list fetch already hits and make it idempotent.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_demo_pantry.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/pantry.py backend/tests/test_demo_pantry.py
git commit -m "feat(backend): demo pantry as real group with reset + first-login auto-create"
```

---

### Task A4: Pantry-aware voice/chat

**Files:**
- Modify: `backend/routes/chat.py` (`/chat`, `/chat/confirm`) — accept `group_id`, thread into handlers.
- Modify: `backend/handlers/pantry_handler.py` (reads `:119`, writes `:205,268,302,349,419`), `backend/handlers/suggestion_handler.py` (`:48,177,343,396,495`).
- Test: `backend/tests/test_chat_pantry_scope.py`

**Interfaces:**
- Consumes: `verify_pantry_access`, `scope_pantry_query` (A1).
- Produces: chat request models gain optional `group_id: int | None`; handler pantry helpers accept an explicit `group_id` and scope every `pantry_items` query via `scope_pantry_query`, and set `group_id` on any inserts.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_chat_pantry_scope.py
def test_chat_request_accepts_group_id():
    from schemas import ChatRequest  # or wherever the chat body model lives
    req = ChatRequest(message="add milk", history=[], group_id=42)
    assert req.group_id == 42
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_chat_pantry_scope.py -v`
Expected: FAIL (`group_id` not a field)

- [ ] **Step 3: Add `group_id` to chat request models + verify in route**

Add `group_id: Optional[int] = None` to the chat and chat-confirm request models. In each route, `verify_pantry_access(current_user["id"], body.group_id)` and pass `group_id` (and `current_user["id"]`) down to `pantry_handler` / `suggestion_handler` calls.

- [ ] **Step 4: Thread `group_id` through the handlers**

In `pantry_handler.py` and `suggestion_handler.py`, change the pantry helpers to take `current_user_id` + `group_id` and build every `pantry_items` query via `scope_pantry_query(query, current_user_id, group_id)` (replacing direct `.eq("user_id", ...)`), and set `group_id` on inserts. Do not change non-pantry uses.

- [ ] **Step 5: Run tests**

Run: `cd backend && python -m pytest tests/test_chat_pantry_scope.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/routes/chat.py backend/handlers/pantry_handler.py backend/handlers/suggestion_handler.py backend/schemas.py backend/tests/test_chat_pantry_scope.py
git commit -m "feat(backend): thread selected pantry group through voice/chat handlers"
```

---

### Task A5: Group-aware ancillaries (match-pantry + notifications)

**Files:**
- Modify: `backend/routes/shopping_list.py:350` (`match-pantry`, hardcoded `user_id` at `:371`).
- Modify: `backend/routes/notifications.py:304` (expiry alerts).
- Test: `backend/tests/test_ancillary_pantry_scope.py`

**Interfaces:**
- Consumes: `verify_pantry_access`, `scope_pantry_query` (A1).

- [ ] **Step 1: Write the failing test** — assert `match-pantry` with `group_id` scopes the pantry query by `group_id` (stub `scope_pantry_query` to capture the filter).
- [ ] **Step 2: Run to verify it fails.** Run: `cd backend && python -m pytest tests/test_ancillary_pantry_scope.py -v`
- [ ] **Step 3:** In `match-pantry`, accept `group_id`, `verify_pantry_access(...)`, and replace the hardcoded `.eq("user_id", user_id)` at `:371` with `scope_pantry_query(...)`.
- [ ] **Step 4:** Notifications are a background job iterating users — for expiry alerts, resolve each membership so a shared/demo pantry's expiring items notify the right members. If notifications currently iterate `user_id` only, keep personal behavior and add group members via `pantry_group_members`; scope-guard so this stays minimal (document any deferral).
- [ ] **Step 5: Run tests.** Expected: PASS
- [ ] **Step 6: Commit**

```bash
git add backend/routes/shopping_list.py backend/routes/notifications.py backend/tests/test_ancillary_pantry_scope.py
git commit -m "feat(backend): group-aware match-pantry and expiry notifications"
```

---

# TRACK B — FRONTEND (Agent B)

### Task B1: `PantryContext` with persistence

**Files:**
- Create: `frontend/src/context/PantryContext.tsx`
- Modify: `frontend/src/App.tsx:62` (replace `useState`), wrap render tree in the provider.
- Test: `frontend/src/context/PantryContext.test.tsx` (only if `vitest` present — check `frontend/package.json`).

**Interfaces:**
- Produces: `PantryProvider` + `usePantrySelection()` returning `{ selectedGroupId: number | null, setSelectedGroupId: (id: number | null) => void }`, persisted to `localStorage["voxal_selected_pantry"]`. NOTE: type is `number | null` — the `"demo"` sentinel is removed entirely.

- [ ] **Step 1:** Create `PantryContext.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

const STORAGE_KEY = 'voxal_selected_pantry'
type Ctx = { selectedGroupId: number | null; setSelectedGroupId: (id: number | null) => void }
const PantryContext = createContext<Ctx | null>(null)

function readInitial(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === 'null') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

export function PantryProvider({ children }: { children: ReactNode }) {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(readInitial)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, selectedGroupId === null ? 'null' : String(selectedGroupId)) } catch {}
  }, [selectedGroupId])
  return <PantryContext.Provider value={{ selectedGroupId, setSelectedGroupId }}>{children}</PantryContext.Provider>
}

export function usePantrySelection(): Ctx {
  const ctx = useContext(PantryContext)
  if (!ctx) throw new Error('usePantrySelection must be used within PantryProvider')
  return ctx
}
```

- [ ] **Step 2:** Wrap the app tree in `App.tsx` with `<PantryProvider>` (inside the existing providers). Remove the `useState<number | null | "demo">` at `App.tsx:62` and the prop drilling of `selectedPantryGroup`/`setSelectedPantryGroup`; consumers will read the context in B2/B3/B4.
- [ ] **Step 3:** If `vitest` present, add a test that `setSelectedGroupId(42)` persists to `localStorage` and re-hydrates. If absent, verify via `cd frontend && npm run build` typecheck.
- [ ] **Step 4:** Run: `cd frontend && npm run build` — Expected: builds clean.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/PantryContext.tsx frontend/src/App.tsx
git commit -m "feat(frontend): persisted PantryContext for selected pantry"
```

---

### Task B2: Wire read hooks/components to context; remove `"demo"` sentinel

**Files:**
- Modify: `frontend/src/components/{Pantry,ShoppingList,HomeDashboard,Chef,MealPlanner,SavedRecipes}.tsx` — read `selectedGroupId` from `usePantrySelection()` instead of props.
- Modify read hooks that take `group_id`: `hooks/queries/usePantry.ts`, `useDailyRecs.ts`, `useMealPlan`, shopping-list pantry match.
- Delete: `frontend/src/constants/demoPantry.ts` usage (client substitution) — remove all `DEMO_PANTRY_ITEMS` branches and `isDemoMode`/`"demo"` checks.

- [ ] **Step 1:** In each consumer, replace the prop-derived `apiGroupId`/`isDemoMode` logic with `const { selectedGroupId } = usePantrySelection()` and pass `selectedGroupId ?? undefined` where `group_id` was passed. Delete `DEMO_PANTRY_ITEMS` imports and the `isDemoMode ? demoItems : apiItems` substitutions (`Pantry.tsx:192-206`, `ShoppingList.tsx:63`, `HomeDashboard.tsx:52`).
- [ ] **Step 2:** Confirm React Query keys still include `group_id` (they do — `queryKeys.ts:79,81,111,133`); no change needed beyond passing the context value.
- [ ] **Step 3:** Run: `cd frontend && npm run build` — Expected: clean (no remaining references to the `"demo"` sentinel or `DEMO_PANTRY_ITEMS`). Grep to confirm: `grep -rn '"demo"\|DEMO_PANTRY_ITEMS' frontend/src` returns nothing.
- [ ] **Step 4: Commit**

```bash
git add frontend/src
git commit -m "refactor(frontend): read pantry selection from context; drop client demo sentinel"
```

---

### Task B3: Wire write + voice/chat mutations to context

**Files:**
- Modify: `hooks/mutations/usePantryMutations.ts` (`useCreatePantryItem` `:40-54` — currently drops `group_id`).
- Modify: `hooks/mutations/useChatMutation.ts` (`:87-108` — `/chat` + `/chat/confirm` send no group id).
- Modify: `components/Pantry.tsx:371,403` (create/quick-add omit `group_id`).
- Modify: voice entry points `components/QuickRecordPopup.tsx`, `hooks/useVoiceProcessor.ts` (no group awareness).

- [ ] **Step 1:** In `useCreatePantryItem`, ensure the mutation body includes `group_id` from context (or from the item payload). In `Pantry.tsx` `handleCreate`/`handleQuickAdd`, add `group_id: selectedGroupId ?? undefined` to the created item.
- [ ] **Step 2:** In `useChatMutation`, add `group_id: selectedGroupId ?? undefined` to both the `/chat` and `/chat/confirm` request bodies. Source `selectedGroupId` from `usePantrySelection()` (the hook is called within a component under the provider).
- [ ] **Step 3:** Ensure `QuickRecordPopup` (rendered at `App.tsx:454` without pantry props) now works because the chat mutation reads context directly — verify the recorder's chat calls flow through `useChatMutation`. If the recorder builds its own request, add `group_id` there too.
- [ ] **Step 4:** Run: `cd frontend && npm run build` — Expected: clean. Manually verify (during Track C) that a voice "add milk" while a non-personal pantry is selected writes to that pantry.
- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): pass selected pantry group through create + voice/chat mutations"
```

---

### Task B4: Lift `PantryGroupSelector` into the top-right nav + reset UI

**Files:**
- Modify: `frontend/src/components/Navigation.tsx` — add the selector in `.nav-user` (`:173-198`), before the avatar.
- Modify: `frontend/src/components/PantryGroupSelector.tsx` — consume `usePantrySelection()` (instead of `selectedGroupId`/`onSelectGroup` props); add "Reset Demo Pantry" action when the demo group is selected.
- Modify: `frontend/src/components/Pantry.tsx:768` — remove the duplicate selector instance.
- Create hook: `hooks/mutations/useResetDemo.ts` → `POST /api/pantry/demo/reset`.

- [ ] **Step 1:** Refactor `PantryGroupSelector` to read/write selection via `usePantrySelection()`. Its group list already includes "My Pantry" + groups; the Demo group now appears as a normal group returned by the groups fetch (Task A3), so remove the hardcoded `"Demo Pantry"` option (`:252`) and the `"demo"` label logic (`:176`).
- [ ] **Step 2:** Add a "Reset Demo Pantry" button rendered when `selectedGroupId` is the demo group id (identify by group name `"Demo Pantry"` from the fetched list). On click → confirm dialog → `useResetDemo()` mutation → invalidate `queryKeys.pantry.all`.
- [ ] **Step 3:** Place `<PantryGroupSelector />` in `Navigation.tsx` `.nav-user`, reusing the Finance-dropdown pattern (`Navigation.tsx:111-170`) for outside-click + `AnimatePresence`. Add styles to `Navigation.css` if needed (reuse `.nav-dropdown*` classes).
- [ ] **Step 4:** Remove the `<PantryGroupSelector>` render at `Pantry.tsx:768` (now global).
- [ ] **Step 5:** Run: `cd frontend && npm run build` — Expected: clean.
- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): global top-right pantry switcher with demo reset"
```

---

### Task B5: Remove dead code + first-run default

**Files:**
- Delete: `frontend/src/components/DailyRecs.tsx` (unused — `App.tsx:26` comment confirms removed) and `frontend/src/constants/demoPantry.ts` (no longer referenced after B2).
- Remove: the `App.tsx:142-155` client-side `seed-demo` POST + `voxal_demo_seeded` localStorage gate (demo now server-owned per A3).
- Modify: initial selection default — when no `localStorage` value, default to the demo group id **only if the user's personal pantry is empty**, else My Pantry (`null`).

- [ ] **Step 1:** Delete the two files; run `grep -rn 'DailyRecs\|demoPantry\|voxal_demo_seeded' frontend/src` and remove every remaining reference.
- [ ] **Step 2:** Implement the first-run default: after the groups + pantry-count queries resolve, if `localStorage["voxal_selected_pantry"]` is unset, set selection to the demo group id when personal pantry item count is 0, else leave `null`.
- [ ] **Step 3:** Run: `cd frontend && npm run build` — Expected: clean, no dead references.
- [ ] **Step 4: Commit**

```bash
git add -A frontend/src
git commit -m "chore(frontend): remove dead demo code; server-owned demo + first-run default"
```

---

# TRACK C — INTEGRATION (after A + B land on the feature branch)

### Task C1: Integrate, verify end-to-end, open PR

- [ ] **Step 1:** Merge both worktrees onto `feature/pantry-switching-rearchitecture`. Resolve any `schemas.py` overlap (A2 + A4 both edit it).
- [ ] **Step 2:** Backend: `cd backend && python -m pytest -q` — Expected: all pass.
- [ ] **Step 3:** Frontend: `cd frontend && npm run build` — Expected: clean.
- [ ] **Step 4:** Manual E2E (both servers up): switch to Demo via top-right dropdown → add an item by voice → it appears in Demo only → "Reset Demo" restores the seed set → switch to My Pantry → real data intact and unaffected. Confirm selection survives a page refresh.
- [ ] **Step 5:** Invoke `superpowers:requesting-code-review` on the diff; address findings.
- [ ] **Step 6:** Open the PR:

```bash
git push -u origin feature/pantry-switching-rearchitecture
gh pr create --title "Pantry switching rearchitecture: consistent scope + top-right switcher + real demo pantry" --body "<summary + test evidence>"
```
Do NOT merge to `main` — leave the PR for review.

---

## Self-review notes

- **Spec coverage:** backfill migration (A0) ✓; scoping helpers (A1) ✓; group-scoped reads+writes (A2) ✓; pantry-aware voice/chat (A4) ✓; ancillaries (A5) ✓; demo-as-real-group + reset + auto-create (A3, B4, B5) ✓; context/persistence (B1, B5) ✓; all-hooks-from-one-source (B2, B3) ✓; top-right switcher (B4) ✓; existing-users-untouched (A3 note, global constraint) ✓; PR-not-merge (C1) ✓.
- **Architecture corrected:** switched from owner-`user_id` indirection to the `pantry_items.group_id` column (matching `shopping_list`), because a self-owned demo pantry can't be distinguished from personal under indirection. Demo items are separated cleanly by `group_id`, not the `notes` field.
- **Open implementation decision flagged in A0:** the shared-group backfill rule is ambiguous if an owner has multiple non-demo groups. Verify the data shape first; prefer leaving items personal (safe) if ambiguous, and note it in the PR.
