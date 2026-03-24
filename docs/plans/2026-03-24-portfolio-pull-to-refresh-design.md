# Portfolio Pull-To-Refresh Design

**Date:** 2026-03-24

**Problem**

The web dashboard currently supports explicit refresh through existing request flows, but it does not support pull-to-refresh interactions. The user wants desktop mouse drag and mobile touch drag to trigger a reload on two specific page shapes only:

- the portfolio summary card page
- the single portfolio detail page

The interaction must not interfere with existing drag-and-drop behavior for top tabs or fund rows.

**Decision**

Add a local pull-to-refresh wrapper component and mount it only inside the two target page views instead of attaching the behavior to the global `ant-layout-content` container.

- Summary page refreshes portfolio summary data only.
- Portfolio detail page refreshes current portfolio fund data and the local decision card data.
- The detail page refresh button and the pull gesture use the same refresh action.
- The pull interaction is available for both desktop pointer drag and mobile touch drag.
- The pull interaction is disabled outside the two target pages.

**Why Local Wrappers**

Attaching pull-to-refresh at the global layout level would require filtering around tab dragging, table row dragging, buttons, and form controls across the whole dashboard. A local wrapper around each eligible page keeps the trigger surface narrow and avoids conflicts with:

- top navigation tab dragging
- fund row dragging
- controls outside the target pages

**Interaction Rules**

- Only arm the gesture when the wrapped scroll container is already at scroll top.
- Only respond to clear downward vertical motion.
- Ignore gestures starting from interactive controls or drag handles.
- Show a lightweight top indicator with three states:
  - `下拉刷新`
  - `松开刷新`
  - `正在刷新...`
- Apply resistance while dragging and trigger refresh only after a release threshold.
- Cancel the gesture when the active page changes.

**Data Shape**

The current dashboard hook already has loaders for portfolios, flat funds, and selected portfolio funds. The portfolio detail view also owns a separate local request flow for decision artifacts.

To match page semantics, refresh behavior should be split into focused actions:

- summary page: refresh portfolio summaries only
- detail page: refresh selected portfolio funds plus decision artifacts

The existing global `refreshData()` remains for flows that still need a broad refresh.

**Implementation Shape**

- Create a reusable pull-to-refresh wrapper for pointer and touch gestures.
- Add page-scoped refresh helpers in the dashboard data hook.
- Wrap `AccountSummaryView` with the new component.
- Wrap `PortfolioDetailView` with the new component.
- Reuse the same detail refresh callback for the existing refresh button in the fund table card.

**Success Criteria**

- Pulling down from the top of the summary card page reloads portfolio summary data.
- Pulling down from the top of a portfolio detail page reloads fund data and decision card data.
- The gesture works with both desktop mouse drag and mobile touch drag.
- Pulling from buttons, inputs, menus, tab drag regions, and row drag handles does not trigger refresh.
- Pull-to-refresh does not activate while the page is not scrolled to the top.
- Existing tab drag and fund row drag behavior remain intact.
