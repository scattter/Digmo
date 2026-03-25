# Fund Position T+1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make fund `INCREASE` and `DECREASE` operations settle only after 09:00 on the next working day while keeping direct manual holding edits immediate.

**Architecture:** Extend the position operation model with pending settlement metadata, add Shanghai working-day settlement helpers, and settle due operations inside the watchlist store before reads and future writes. Keep direct `PATCH` fund edits immediate, but recompute the pending operation chain so future settlements still apply from the corrected base.

**Tech Stack:** TypeScript, Fastify, SQLite, Vitest, React, Next.js, Ant Design

---

### Task 1: Add failing time-helper tests for next working day settlement

**Files:**
- Modify: `apps/api/src/utils/time.ts`
- Create or Modify: `apps/api/src/utils/__tests__/time.test.ts`

**Step 1: Write the failing test**

Add tests for:

- Monday afternoon -> Tuesday 09:00 Shanghai
- Friday afternoon -> Monday 09:00 Shanghai
- Saturday noon -> Monday 09:00 Shanghai

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/api test -- apps/api/src/utils/__tests__/time.test.ts`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Implement helpers in `time.ts` for:

- next working date
- next working day settlement instant at `09:00`
- due-settlement check

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/api test -- apps/api/src/utils/__tests__/time.test.ts`
Expected: PASS.

### Task 2: Add failing route tests for pending settlement behavior

**Files:**
- Modify: `apps/api/src/routes/__tests__/watchlist-routes.test.ts`

**Step 1: Write the failing tests**

Add tests covering:

- same-day `DECREASE` does not change holdings immediately
- next working day after `09:00` the holding changes on read
- Friday operation settles on Monday
- multiple pending decreases validate against projected holding
- operation history exposes `status` and `effectiveAt`

Use fake timers so the tests can move across settlement boundaries.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @digmo/api test -- apps/api/src/routes/__tests__/watchlist-routes.test.ts`
Expected: FAIL because operations currently settle immediately and the extra fields do not exist.

### Task 3: Extend shared types and store contracts for pending operations

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`

**Step 1: Add the shared contract**

Extend `PositionOperationRecord` with:

- `status`
- `effectiveAt`
- optional `appliedAt`

Add a `PositionOperationStatus` type if that keeps the API contract clearer.

**Step 2: Extend store-side interfaces**

Update the API store contracts and row types to carry the new settlement metadata through SQLite reads and writes.

**Step 3: Run targeted typecheck**

Run: `pnpm --filter @digmo/api typecheck`
Expected: FAIL or surface the next required implementation changes.

### Task 4: Implement SQLite schema migration and pending operation writes

**Files:**
- Modify: `apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`

**Step 1: Add schema evolution**

Ensure `user_portfolio_fund_operation` has:

- `status`
- `effective_at`
- `applied_at`

Handle existing databases safely with additive migration logic.

**Step 2: Stop immediate holding mutation in `applyPositionOperation`**

Refactor `applyPositionOperation()` so it:

- loads current live holding
- settles due operations first
- loads remaining pending operations for the fund
- computes projected before/after snapshots
- validates projected decreases
- inserts a new `PENDING` row with `effectiveAt`

Do not update `user_portfolio_fund` during submission.

**Step 3: Run targeted tests**

Run: `pnpm --filter @digmo/api test -- apps/api/src/routes/__tests__/watchlist-routes.test.ts`
Expected: still FAIL until settlement-on-read exists, but immediate-settlement assertions should now be closer to expected behavior.

### Task 5: Implement settlement-on-read and settlement-on-write hooks

**Files:**
- Modify: `apps/api/src/infra/watchlist/sqlite-watchlist-store.ts`

**Step 1: Add due-operation settlement helpers**

Create internal helpers that:

- list due pending operations
- apply them in creation order
- update `user_portfolio_fund`
- mark operations as `APPLIED`

**Step 2: Call settlement before relevant reads**

Run settlement before:

- `listPortfolioFunds`
- `listAllPortfolioFunds`
- `getPortfolioFund`
- `listPositionOperations`

**Step 3: Call settlement before future writes**

Run settlement before:

- `applyPositionOperation`
- `updatePortfolioFund`

**Step 4: Rebuild pending projections after direct updates**

After `updatePortfolioFund`, recompute `before/after` projections for remaining pending operations on that fund so they remain consistent with the corrected live base.

**Step 5: Run the route tests**

Run: `pnpm --filter @digmo/api test -- apps/api/src/routes/__tests__/watchlist-routes.test.ts`
Expected: PASS for the new pending-settlement scenarios.

### Task 6: Update route responses and web copy

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/hooks/use-portfolio-actions.ts`
- Modify: `apps/web/components/dashboard/dialogs/update-fund-dialog.tsx`

**Step 1: Propagate the richer operation response**

Ensure the web client accepts `status`, `effectiveAt`, and `appliedAt`.

**Step 2: Update operation success messaging**

Change the add/subtract success text to reference delayed settlement and include the effective date.

**Step 3: Add dialog guidance**

Show a short note in the increase/decrease mode explaining next-working-day `09:00` settlement.

**Step 4: Run web typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS.

### Task 7: Final verification

**Files:**
- Verify touched files only

**Step 1: Run focused API tests**

Run: `pnpm --filter @digmo/api test -- apps/api/src/utils/__tests__/time.test.ts apps/api/src/routes/__tests__/watchlist-routes.test.ts`
Expected: PASS.

**Step 2: Run API typecheck**

Run: `pnpm --filter @digmo/api typecheck`
Expected: PASS.

**Step 3: Run web typecheck**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS.

**Step 4: Review final diff**

Run: `git diff -- docs/plans/2026-03-25-fund-position-t-plus-one-design.md docs/plans/2026-03-25-fund-position-t-plus-one.md packages/shared/src/types.ts apps/api/src/utils/time.ts apps/api/src/routes/__tests__/watchlist-routes.test.ts apps/api/src/infra/watchlist/sqlite-watchlist-store.ts apps/web/lib/api.ts apps/web/hooks/use-portfolio-actions.ts apps/web/components/dashboard/dialogs/update-fund-dialog.tsx`
Expected: diff contains only the T+1 settlement behavior and related copy/contracts.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-25-fund-position-t-plus-one-design.md docs/plans/2026-03-25-fund-position-t-plus-one.md packages/shared/src/types.ts apps/api/src/utils/time.ts apps/api/src/routes/__tests__/watchlist-routes.test.ts apps/api/src/infra/watchlist/sqlite-watchlist-store.ts apps/web/lib/api.ts apps/web/hooks/use-portfolio-actions.ts apps/web/components/dashboard/dialogs/update-fund-dialog.tsx
git commit -m "feat: settle fund position changes next working day"
```
