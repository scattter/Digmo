# Daily Decision Plain Text Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert daily decision generation from structured JSON actions into a plain-text suggestion workflow stored and rendered as text only.

**Architecture:** Replace structured decision generation with plain-text generation at the provider boundary, simplify the shared decision contract, and remove UI/backend flows that depend on action arrays. Preserve database compatibility by allowing historical records to exist while stopping new writes to decision action rows.

**Tech Stack:** TypeScript, Fastify, SQLite, Vitest, Next.js, Ant Design

---

### Task 1: Simplify shared decision types

**Files:**
- Modify: `packages/shared/src/types.ts`
- Test: `apps/api/src/routes/__tests__/decision-routes.test.ts`
- Test: `apps/web` compile-time usages via `pnpm --filter @digmo/web typecheck` if available

**Step 1: Write the failing test**

Update API-facing tests to stop asserting `overallRiskLevel`, `actions`, and `citations`, and instead assert plain-text summary persistence only.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/api test -- decision-routes.test.ts`
Expected: FAIL because route/store/provider still require structured fields.

**Step 3: Write minimal implementation**

Update shared `DailyDecision` and related bind-suggestion types to remove action-oriented fields that are no longer part of the product.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/api test -- decision-routes.test.ts`
Expected: PASS or move failure to the next backend layer.

### Task 2: Convert decision provider to plain-text generation

**Files:**
- Modify: `apps/api/src/modules/decision/provider.ts`
- Modify: `apps/api/src/modules/decision/openai-provider.ts`
- Test: `apps/api/src/modules/decision/__tests__/openai-provider.test.ts`

**Step 1: Write the failing test**

Add tests proving provider accepts plain-text model output and no longer parses JSON schema or action arrays.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/api test -- openai-provider.test.ts`
Expected: FAIL because provider still parses JSON output.

**Step 3: Write minimal implementation**

Change provider contract to return plain text summary only and simplify the model prompt to request plain-text advice.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/api test -- openai-provider.test.ts`
Expected: PASS.

### Task 3: Simplify decision persistence and routes

**Files:**
- Modify: `apps/api/src/infra/decision/sqlite-decision-store.ts`
- Modify: `apps/api/src/routes/decision.ts`
- Test: `apps/api/src/routes/__tests__/decision-routes.test.ts`

**Step 1: Write the failing test**

Update route tests to assert that generation stores plain-text summary and metadata only.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/api test -- decision-routes.test.ts`
Expected: FAIL because routes/store still write structured decision actions.

**Step 3: Write minimal implementation**

Remove action validation, stop writing decision action rows for new runs, and return a plain-text decision payload.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/api test -- decision-routes.test.ts`
Expected: PASS.

### Task 4: Remove suggestion-binding dependencies

**Files:**
- Modify: `apps/api/src/routes/watchlist.ts`
- Modify: `apps/web/components/dashboard/views/portfolio-detail-view.tsx`
- Search: `apps/web` and `apps/api` for `bindSuggestion`, `actionOrder`, `decision.actions`

**Step 1: Write the failing test**

Adjust any tests that depend on binding suggestions from decision actions.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/api test -- watchlist-routes.test.ts`
Expected: FAIL where bind-suggestion logic still assumes action arrays.

**Step 3: Write minimal implementation**

Remove or disable decision-action binding logic so position operations no longer depend on suggestion actions.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/api test -- watchlist-routes.test.ts`
Expected: PASS.

### Task 5: Update web presentation to plain text

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/components/dashboard/dialogs/decision-history-dialog.tsx`
- Modify: `apps/web/components/dashboard/views/portfolio-detail-view.tsx`

**Step 1: Write the failing test**

If UI tests are unavailable, use focused type and build verification after changing all action-based UI references to text-based rendering.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @digmo/web typecheck`
Expected: FAIL on stale `actions` and `overallRiskLevel` references.

**Step 3: Write minimal implementation**

Render `summary` as plain text in latest and history views and remove action/citation blocks.

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS or expose unrelated pre-existing issues only.

### Task 6: Final verification

**Files:**
- Verify touched files only

**Step 1: Run targeted backend tests**

Run: `pnpm --filter @digmo/api test -- openai-provider.test.ts decision-routes.test.ts watchlist-routes.test.ts`
Expected: PASS.

**Step 2: Run targeted frontend verification**

Run: `pnpm --filter @digmo/web typecheck`
Expected: PASS or report unrelated pre-existing issues.

**Step 3: Smoke-test the real API**

Run a local authenticated `POST /v1/portfolios/:portfolioId/daily-decision:generate`
Expected: success with plain-text suggestion persisted.
