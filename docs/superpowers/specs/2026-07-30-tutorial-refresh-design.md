# Onboarding Tutorial Refresh — Design

**Date:** 2026-07-30
**Status:** Approved → implementation

## Goal

Update the first-run onboarding (`TutorialOverlay`) so it's current with the app, looks consistent with the new flat palette, emphasizes **speaking** as the core interaction, walks the main features in a clear order, and points first-time users to the **Demo Pantry** sandbox.

## Approach

Keep the existing spotlight/interactive engine (spotlight cutouts, per-step targets, "try it" interaction). This is a **content + flow update**, not a rewrite:
- Rewrite `TUTORIAL_STEPS` to the flow below.
- Add `data-tutorial` anchors to the individual nav tabs (Shopping, Chef, Planner) so each gets its own spotlight; reuse the existing anchor on the Pantry tab and `pantry-switcher` / `voxy-fab` / `hero-meal` / `cooking-stats`.
- No visual rewrite — the tutorial card already uses CSS variables, so it inherits the flat-palette refresh. Light polish only if something looks off.

**Demo pantry framing (decided):** *point it out, don't force-switch.* A step spotlights the top-right switcher and explains the Demo Pantry is a safe sandbox with sample items to experiment in.

## Flow (11 steps — home dashboard first, then features)

1. **Welcome** (no target) — what Voxal is; offer a ~60s tour.
2. **Just speak** ⭐ (target: `voxy-fab`) — the core interaction: tap the mic and talk, **hold spacebar to quick-record anywhere**, or type. "This is how you do almost everything."
3. **Tonight's Pick** (target: `hero-meal`) — personalized meal from your pantry, prioritizes expiring items; tap for the recipe.
4. **Your stats** (target: `cooking-stats`) — streak / pantry / shopping / budget cards; tap any to dive in.
5. **Demo Pantry sandbox** ⭐ (target: `pantry-switcher`) — "New here? Switch to the Demo Pantry — a safe sandbox with sample items. Play freely, nothing touches your real data, reset anytime."
6. **Log an expense** (hands-on; target: `voxy-fab`, `waitForInteraction`) — try *"I spent $12 at Trader Joe's on groceries."* Voxal extracts store/amount/category **and offers to add the items to your pantry.**
7. **Pantry** (target: Pantry tab, fallback `mobile-nav`) — tracks the kitchen: quantities, stock, expiration; add by voice or drag.
8. **Shopping List** (target: Shopping tab, fallback `mobile-nav`) — what to buy; add by voice, check off, move bought items into the pantry.
9. **Chef** (target: Chef tab, fallback `mobile-nav`) — drag ingredients into the bowl → recipes, or ask "what can I make?"
10. **Planner** (target: Planner tab, fallback `mobile-nav`) — plan the week, auto-build a shopping list from the plan.
11. **Finish** (no target) — "Just talk — the voice bar's on every page. Try the Demo Pantry, then switch to My Pantry when ready. Enjoy!"

Speaking is emphasized in 2, 6, 11; demo pantry in 5 and 11; the expense→pantry→shopping→chef→planner arc is steps 6–10; all home content leads (2–5).

## Files

- `frontend/src/components/TutorialOverlay.tsx` — rewrite `TUTORIAL_STEPS`.
- `frontend/src/components/Navigation.tsx` — add `data-tutorial` anchors to Shopping/Chef/Planner tabs (and a clear one on Pantry).
- (CSS only if a spotlight/target needs adjustment.)

## Out of scope

- Steps spotlight the nav tab and explain (point-it-out); they do **not** navigate through each page live.
- No change to the trigger logic (`voxal_tutorial_seen` first-run gate) or the spotlight engine.
