# Fund Position T+1 Design

**Date:** 2026-03-25

**Problem**

The current fund position operation flow applies `INCREASE` and `DECREASE` immediately. That is inconsistent with the expected fund workflow in this product: position changes should take effect only after 09:00 on the next working day.

The current implementation updates `user_portfolio_fund` synchronously when the operation is submitted, and the web client immediately refreshes the portfolio funds list. This makes the position appear to update at once instead of remaining pending.

Version 1 should interpret "next trading day" as "next working day":

- skip Saturday and Sunday
- do not model China public holidays or temporary market closures yet

**Decision**

Change fund position operations from an immediate mutation model to a pending-settlement model.

- `INCREASE` and `DECREASE` create a pending operation record instead of updating the live holding immediately.
- Each pending operation stores its next-working-day `09:00` effective time in Shanghai time.
- Portfolio fund reads and future position writes settle all due pending operations before returning or validating data.
- Direct manual updates (`PATCH /funds/:fundCode`) remain immediate.

**Data Model**

Extend `user_portfolio_fund_operation` and the shared operation contract with settlement fields:

- `status`: `PENDING | APPLIED`
- `effectiveAt`: when the operation becomes eligible to affect holdings
- `appliedAt`: when the system actually applied it

The existing before/after fields remain, but their meaning changes:

- on creation, they describe the projected holding state after applying all prior pending operations plus the new one
- after settlement, they still match the actual holding transition that was applied

**Time Rules**

Add Shanghai working-day helper utilities:

- compute next working date from a source time
- compute next working day settlement instant at `09:00`
- determine whether a pending operation is due

Examples for v1:

- Monday 14:00 submit -> Tuesday 09:00 effective
- Tuesday 08:30 submit -> Wednesday 09:00 effective
- Friday 15:00 submit -> Monday 09:00 effective
- Saturday submit -> Monday 09:00 effective

**Operation Flow**

When the user submits `INCREASE` or `DECREASE`:

1. Load the current live holding for the fund.
2. Load pending operations for the same portfolio fund ordered by creation time.
3. Compute the projected holding state after those pending operations.
4. Validate the new operation against the projected state.
5. Insert a new `PENDING` operation with computed `before/after` snapshots and `effectiveAt`.
6. Do not update `user_portfolio_fund` yet.

This prevents over-selling while multiple pending decreases exist for the same fund.

**Settlement Flow**

Introduce a settlement routine at the store layer:

- find due pending operations where `effective_at <= now`
- apply them in creation order per fund
- update `user_portfolio_fund`
- mark each operation as `APPLIED` with `appliedAt`

Run this settlement routine before:

- listing portfolio funds
- listing all portfolio funds
- reading a single portfolio fund
- creating another position operation for the same fund
- listing operation history for a portfolio

This makes the system self-healing even if no background job runs exactly at 09:00.

**Direct Manual Updates**

`PATCH /v1/portfolios/:portfolioId/funds/:fundCode` remains immediate.

If the fund has pending operations, the store recomputes the projected `before/after` chain for those future operations using the new live holding as the base. This keeps pending operations internally consistent after a manual correction.

**Frontend Behavior**

The web client should stop implying immediate settlement.

- Success text changes to "已提交加仓/减仓，将于 YYYY-MM-DD 09:00 生效"
- The operation dialog shows a short note that fund increases/decreases settle after 09:00 on the next working day
- Immediate refresh still happens after submission, but the visible holding remains unchanged until settlement time

Version 1 does not add live countdowns, polling, or a pending-operation list in the UI.

**Out of Scope**

- real China exchange holiday calendar
- automatic browser-side polling exactly at 09:00
- canceling pending operations
- merging multiple pending operations into one
- changing share/lot semantics from the current amount-based position model

**Success Criteria**

- Submitted fund increases and decreases do not change visible holdings before the next working day at 09:00.
- The same operations become visible after settlement time on the next read.
- Friday operations settle on Monday at 09:00.
- Multiple pending decreases cannot exceed the projected holding.
- Direct manual updates still work immediately and do not corrupt pending operation projections.
