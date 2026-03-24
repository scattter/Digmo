# Portfolio Pull-To-Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add desktop and mobile pull-to-refresh to the portfolio summary card page and portfolio detail page without interfering with existing drag-and-drop interactions.

**Architecture:** Implement a reusable local pull-to-refresh wrapper that owns pointer and touch gesture state, then mount it only around the summary and detail page bodies. Split dashboard refresh actions into page-scoped callbacks so summary refreshes only portfolio summaries while detail refreshes portfolio funds plus decision artifacts, and route the existing detail refresh button through the same callback.

**Tech Stack:** TypeScript, React 19, Next.js App Router, Ant Design, dnd-kit

---

### Task 1: Add page-scoped refresh methods to the dashboard hook

**Files:**
- Modify: `apps/web/hooks/use-dashboard-data.ts`
- Verify: `apps/web/app/fund-dashboard.tsx`

**Step 1: Review current loader boundaries**

Confirm which existing callbacks in `useDashboardData()` fetch:

- portfolio summary list
- selected portfolio funds
- flat funds

Document which state flags are currently toggled for each loader.

**Step 2: Add focused refresh helpers**

Implement dedicated async helpers in `useDashboardData()` for:

- `refreshPortfoliosOnly(options?)`
- `refreshSelectedPortfolioOnly(options?)`

Keep the existing `refreshData(options?)` intact for broader flows.

**Step 3: Preserve loading and error behavior**

Reuse the existing loading state pattern so the focused refresh helpers:

- set only the relevant loading flags
- clear stale errors before firing
- keep `isBusy` coherent with the new scoped refresh calls

**Step 4: Run targeted typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS or surface only unrelated pre-existing issues.

### Task 2: Build a reusable pull-to-refresh wrapper

**Files:**
- Create: `apps/web/components/dashboard/common/pull-to-refresh.tsx`

**Step 1: Define the wrapper API**

Create a component API that accepts at minimum:

- wrapped children
- `onRefresh`
- `disabled`
- `triggerThreshold`
- optional ignore selector or ignore predicate

The component should expose no dashboard-specific assumptions.

**Step 2: Implement pointer and touch gesture tracking**

Inside the wrapper:

- track `pointerdown`, `pointermove`, `pointerup`, and `pointercancel`
- allow activation only when the nearest scroll container is at `scrollTop === 0`
- require downward vertical movement to exceed horizontal movement before taking control
- apply drag resistance instead of linear translation

**Step 3: Implement refresh state and indicator UI**

Render a lightweight top indicator with the three approved states:

- `下拉刷新`
- `松开刷新`
- `正在刷新...`

Keep the content translated during drag and while the refresh promise is pending, then animate back to rest.

**Step 4: Guard against conflicting start targets**

Ignore gestures beginning from:

- `button`, `input`, `textarea`, `select`, `a`
- elements with `[role="button"]`
- explicitly marked drag handles or drag regions via data attributes/classes

**Step 5: Run targeted typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS or move any failure to the integration tasks.

### Task 3: Integrate pull-to-refresh into the summary card page

**Files:**
- Modify: `apps/web/app/fund-dashboard.tsx`
- Modify: `apps/web/components/dashboard/views/account-summary-view.tsx`
- Verify: `apps/web/components/dashboard/cards/portfolio-summary-card.tsx`

**Step 1: Create a summary-page refresh callback**

In `FundDashboard`, compose a callback that refreshes portfolio summaries only by calling the new dashboard hook helper.

**Step 2: Wrap the summary page body**

Mount `PullToRefresh` around the summary page content only, not around the top navigation, tab list, or global `Content` container.

**Step 3: Keep card clicks intact**

Verify the summary cards still support normal click-to-enter behavior and that a simple click does not arm a pull gesture.

**Step 4: Run targeted typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS.

### Task 4: Integrate pull-to-refresh into the portfolio detail page

**Files:**
- Modify: `apps/web/app/fund-dashboard.tsx`
- Modify: `apps/web/components/dashboard/views/portfolio-detail-view.tsx`
- Modify: `apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx`

**Step 1: Create a detail-page refresh callback**

In `PortfolioDetailView`, compose a single refresh action that runs both:

- the parent-provided selected-portfolio refresh callback
- the local `loadDecisionArtifacts()` callback

Use this combined callback for both the pull gesture and the existing refresh button path.

**Step 2: Wrap the detail page body**

Mount `PullToRefresh` around the detail-page body so it covers:

- the decision card
- the ratio card section
- the fund list card

Do not attach it to the top nav tabs or the full layout container.

**Step 3: Mark conflict-prone nested controls**

Add explicit ignore markers where needed for nested drag and control areas, especially:

- fund row drag handle/button
- any future detail-page drag affordance

If the existing selectors are sufficient, keep the change minimal.

**Step 4: Route the refresh button through the same callback**

Ensure the existing refresh button in `PortfolioFundsTable` still works and now executes the same composed detail refresh action used by pull-to-refresh.

**Step 5: Run targeted typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS.

### Task 5: Manual interaction verification

**Files:**
- Verify touched files only

**Step 1: Start the web app**

Run: `pnpm --filter @digmo/web dev`
Expected: local dashboard is reachable in the browser.

**Step 2: Verify summary-page pull-to-refresh**

Manual checks:

- open the summary card page
- scroll to top
- drag downward with a mouse
- confirm indicator states progress correctly
- confirm refresh triggers only after threshold release

**Step 3: Verify detail-page pull-to-refresh**

Manual checks:

- open a single portfolio detail page
- scroll to top
- drag downward with a mouse
- confirm fund list and decision card refresh together

**Step 4: Verify non-trigger scenarios**

Manual checks:

- drag while not at scroll top and confirm no refresh
- click buttons and controls and confirm no accidental refresh
- drag a tab and confirm no accidental refresh
- drag a fund row handle and confirm no accidental refresh
- switch tabs mid-gesture and confirm state resets cleanly

**Step 5: Verify touch behavior**

Manual checks using device emulation or a real touch device:

- repeat summary-page and detail-page pull-to-refresh
- confirm the same threshold and indicator behavior

### Task 6: Final verification and commit

**Files:**
- Verify touched files only

**Step 1: Run final web verification**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS.

**Step 2: Review the final diff**

Run: `git diff -- apps/web/hooks/use-dashboard-data.ts apps/web/app/fund-dashboard.tsx apps/web/components/dashboard/views/account-summary-view.tsx apps/web/components/dashboard/views/portfolio-detail-view.tsx apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx apps/web/components/dashboard/common/pull-to-refresh.tsx`
Expected: diff contains only the pull-to-refresh implementation and related refresh wiring.

**Step 3: Commit**

```bash
git add docs/plans/2026-03-24-portfolio-pull-to-refresh-design.md docs/plans/2026-03-24-portfolio-pull-to-refresh.md apps/web/hooks/use-dashboard-data.ts apps/web/app/fund-dashboard.tsx apps/web/components/dashboard/views/account-summary-view.tsx apps/web/components/dashboard/views/portfolio-detail-view.tsx apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx apps/web/components/dashboard/common/pull-to-refresh.tsx
git commit -m "feat(web): add portfolio pull-to-refresh"
```
