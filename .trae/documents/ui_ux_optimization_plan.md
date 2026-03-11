# Portfolio Detail Layout Optimization Plan

This plan outlines the steps to optimize the UI/UX of the Portfolio Detail page, specifically focusing on the Fund List table layout, card height, and modal styling, as well as replacing native alerts with shadcn components.

## 1. Replace Native Alerts with Shadcn UI

Although a preliminary search did not reveal explicit `alert()` or `confirm()` calls in the codebase, we will ensure that all user interactions (especially deletions) use Shadcn UI components.

- **Audit:** Double-check for any `window.alert`, `window.confirm`, or `window.prompt` usages in the entire `apps/web` directory.
- **Implementation:**
    - If any are found, replace them with:
        - `toast` from `sonner` or `use-toast` for notifications.
        - `AlertDialog` for confirmations (Delete Portfolio, Delete Fund).
    - **Verify:** Ensure `apps/web/app/fund-dashboard.tsx` uses `AlertDialog` for delete actions (already present, but will verify usage).

## 2. Optimize Fund List Table Layout

We will modify `PortfolioFundsTable` to support a responsive layout with sticky columns and horizontal scrolling.

- **Target Component:** `apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx`
- **Changes:**
    - **Container:** Ensure the `Table` is wrapped in a container with `overflow-x-auto` (shadcn `Table` usually handles this, but we might need a custom wrapper for sticky columns to work properly).
    - **Sticky Columns:**
        - **Drag Handle:** Sticky to the left (`left-0`).
        - **Fund Name:** Sticky to the left (`left-[50px]`).
        - **Fund Amount:** Sticky to the left (`left-[230px]` approx, or just let it scroll if it takes too much space. Given the user's request, we will attempt to make it sticky or at least ensuring the first two are). *Decision: Drag Handle and Name are critical. Amount is requested. We will make Drag Handle and Name sticky left. Operations sticky right.*
        - **Operations:** Sticky to the right (`right-0`).
    - **Styling:** Add `bg-background` or `bg-card` to sticky cells to prevent transparency issues when scrolling. Add shadows or borders to indicate scrolling if possible.

## 3. Adjust Fund List Card Height

We will modify the container card of the Fund List to ensure it expands with the content.

- **Target Component:** `apps/web/components/dashboard/features/portfolios/portfolio-funds-table.tsx`
- **Changes:**
    - Remove `max-h-[70vh]` from the `Card` container.
    - Remove `overflow-y-auto` from the `CardContent`.
    - This will allow the card to grow to the full height of the table, delegating vertical scrolling to the main page or parent container.

## 4. Fix Modal Background Transparency

We will fix the background issue in `UpdateFundDialog` and potentially other dialogs.

- **Target Component:** `apps/web/components/ui/dialog.tsx` (Global fix) or `apps/web/components/dashboard/dialogs/update-fund-dialog.tsx`.
- **Analysis:** The `DialogContent` uses `bg-surface`. We will check if `bg-surface` is correctly resolving to a color.
- **Changes:**
    - Change `bg-surface` to `bg-background` (standard shadcn) in `apps/web/components/ui/dialog.tsx` to ensure consistent opaque background.
    - Verify `z-index` and `DialogOverlay` settings.

## 5. Verification

- **Manual Verification:**
    - Open the Portfolio Detail page.
    - Check if the Fund List table scrolls horizontally on small screens.
    - Check if "Drag Handle", "Fund Name", and "Operations" columns are sticky.
    - Check if the Card height expands to fit all funds (no internal scrollbar).
    - Open the "Update Position" (pencil icon) dialog and verify the background is white (not transparent).
    - Trigger delete actions to ensure `AlertDialog` is used.

