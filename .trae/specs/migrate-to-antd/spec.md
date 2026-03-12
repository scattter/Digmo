# Migrate to Ant Design Spec

## Why
The project currently uses shadcn/ui (based on Radix UI and Tailwind). The user wants to replace the entire component system with Ant Design (antd) to standardize the UI/UX, leverage Ant Design's comprehensive component library, and optimize the page layout with a focus on mobile responsiveness.

## What Changes
- **Dependency Changes**:
    -   ADD: `antd`, `@ant-design/nextjs-registry`, `@ant-design/icons`.
    -   REMOVE: `@radix-ui/*`, `class-variance-authority`, `lucide-react` (replace with antd icons), `sonner` (replace with antd message/notification).
- **Configuration**:
    -   Setup Ant Design Registry for Next.js App Router in `apps/web/app/layout.tsx`.
    -   Configure global theme (ConfigProvider) if necessary.
- **Component Replacement**:
    -   Replace all components in `apps/web/components/ui` (or delete them and use `antd` directly).
    -   Refactor all pages and feature components to import from `antd` instead of local UI components.
    -   Replace `lucide-react` icons with `@ant-design/icons`.
- **Layout Optimization**:
    -   Refactor `DashboardLayout` using Ant Design's `Layout` (Sider, Header, Content).
    -   Implement responsive behavior (collapsible Sider, Drawer for mobile menu).
    -   Use `Row`, `Col`, `Flex`, and `Space` for internal page layouts.
- **Form Migration**:
    -   Migrate `react-hook-form` + `zod` usage to Ant Design `Form` where appropriate, or wrap Ant Design inputs with `Controller` if complex validation reuse is needed. (Prefer native Antd Form for consistency).

## Impact
- **Affected Specs**: None directly, but `optimize-portfolio-detail-layout` will be superseded by this migration.
- **Affected Code**:
    -   `apps/web/package.json`
    -   `apps/web/app/layout.tsx`
    -   `apps/web/app/**` (all pages)
    -   `apps/web/components/**` (all components)
    -   `apps/web/lib/utils.ts` (cn utility might be less used)

## ADDED Requirements
### Requirement: Ant Design Integration
The system SHALL use Ant Design v5+ for all UI components.
- **Scenario**: Global Theme
    -   **WHEN** the app loads
    -   **THEN** Ant Design styles and theme tokens should be applied correctly.

### Requirement: Mobile Responsiveness
The system SHALL provide a usable interface on mobile devices.
- **Scenario**: Mobile Navigation
    -   **WHEN** viewing on a small screen
    -   **THEN** the sidebar should be hidden or collapsed, accessible via a hamburger menu (Drawer).
- **Scenario**: Responsive Grids
    -   **WHEN** viewing lists or dashboards
    -   **THEN** content should stack or resize using Ant Design's Grid system (xs, sm, md, lg, xl, xxl).

## MODIFIED Requirements
### Requirement: UI Components
**Original**: used shadcn/ui (Radix + Tailwind).
**New**: MUST use Ant Design components.
-   Buttons, Inputs, Selects, Checkboxes, Switches -> `antd` equivalents.
-   Dialogs/Modals -> `antd` Modal.
-   Toasts/Notifications -> `antd` Message/Notification.
-   Tables -> `antd` Table.
-   Tabs -> `antd` Tabs.
-   Cards -> `antd` Card.

## REMOVED Requirements
### Requirement: Shadcn/Radix UI
**Reason**: Replacing with Ant Design.
**Migration**: Delete `apps/web/components/ui` folder after migration is complete.
