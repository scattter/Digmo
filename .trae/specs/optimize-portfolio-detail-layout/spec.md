# Portfolio Detail Layout Optimization Spec

## Why
The current portfolio detail view has suboptimal information hierarchy. The "Decision & Operation" panel consumes excessive screen space, overshadowing the most critical information: fund performance. The relationship between Fund Performance, Decision/Operation, and Ratio Achievement should be presented with appropriate weighting and layout, rather than a vertical stack where one dominates. Additionally, the manual refresh status message needs visual improvement.

## What Changes
- **Layout Restructuring**:
  - Adopt a grid-based or split-view layout for the portfolio detail page.
  - **Level 1 (Fund List)**: Should be the most prominent element, taking up the primary visual area (e.g., top or left-main).
  - **Level 2 (Decision & Operation)**: Optimized to be more compact or placed alongside Level 3.
  - **Level 3 (Ratio Analysis)**: Placed alongside Level 2 or in a secondary row/column.
  - Specifically, create a layout where "Decision" and "Ratio" do not push the "Fund List" too far down, or integrate them better. Given the "Horizontal importance" requirement, a top-level summary row or a side-by-side layout for secondary info above the main table is appropriate.
- **Component Optimization**:
  - **Decision Panel**: Reduce its default footprint. It currently displays a large card. We will make it more compact or collapsible, or move detailed operations to the drawer (which already exists) and keep only the summary visible and concise.
  - **Ratio Panel**: Ensure it fits well in the new layout.
- **Visual Tweaks**:
  - **StatusFeedback**: Update the style of "Current is manual update mode..." to be more subtle or standard (e.g., using an Alert component or a refined status bar).

## Impact
- **Affected Specs**: None directly.
- **Affected Code**:
  - `apps/web/app/fund-dashboard.tsx`: Main layout orchestration.
  - `apps/web/components/dashboard/widgets/status-feedback.tsx`: Style update.

## MODIFIED Requirements
### Requirement: Portfolio Detail View Layout
The portfolio detail view SHALL display information in the following order of visual prominence:
1.  **Fund Performance (List)**: Primary focus.
2.  **Decision & Operations**: Secondary focus.
3.  **Ratio Analysis**: Tertiary focus.

The layout SHALL arrange these elements to reflect "horizontal importance" where appropriate, avoiding a single vertical stack that hides lower elements. A suggested layout is:
- Top Row: Compact "Decision" Summary + "Ratio" Summary (if applicable) side-by-side or in a grid.
- Main Area: Fund List Table.

### Requirement: Decision Panel Display
The decision panel SHALL be optimized to occupy less vertical space while retaining key actions (Update, View History, Open Detail).

### Requirement: Status Feedback Style
The manual update status message SHALL use a standard UI pattern (e.g., `Alert` or a styled badge/banner) that is consistent with the design system and visually appropriate.
