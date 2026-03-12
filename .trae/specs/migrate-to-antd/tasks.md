# Tasks

- [x] Task 1: Setup Ant Design in Next.js
    - [x] Install dependencies: `antd`, `@ant-design/nextjs-registry`, `@ant-design/icons` in `apps/web`.
    - [x] Create `theme/themeConfig.ts` (optional) or define basic theme.
    - [x] Configure `AntdRegistry` in `apps/web/app/layout.tsx` (or a dedicated provider component) to ensure styles work with App Router.
    - [x] Verify basic Ant Button rendering on the home page.

- [x] Task 2: Migrate Global Layout & Navigation
    - [x] Refactor `apps/web/components/dashboard/layout/dashboard-layout.tsx` (or equivalent) to use `antd` `Layout` (Header, Sider, Content).
    - [x] Implement responsive Sider (collapsible on desktop, Drawer on mobile).
    - [x] Replace `lucide-react` icons in navigation with `@ant-design/icons`.
    - [x] Ensure the layout structure supports the existing nested routes.

- [x] Task 3: Migrate Dashboard Page (`fund-dashboard.tsx` & widgets)
    - [x] Replace `Card`, `Button`, `Badge` in `apps/web/app/fund-dashboard.tsx`.
    - [x] Refactor `status-feedback.tsx` and other widgets to use Ant Design.
    - [x] Replace `Dialog` usage with `antd` `Modal`.

- [x] Task 4: Migrate Funds Feature (Tables & Dialogs)
    - [x] Refactor `flat-funds-table.tsx` to use `antd` `Table`.
        -   Implement columns, pagination, and sorting using `antd` Table props.
        -   Replace row actions (DropdownMenu) with `antd` `Dropdown` or simple Buttons.
    - [x] Refactor `update-fund-dialog.tsx` to use `antd` `Modal` and `Form`.
    - [x] Refactor `portfolio-funds-table.tsx` to use `antd` `Table`.

- [x] Task 5: Migrate Portfolios Feature (Dialogs & Lists)
    - [x] Refactor `create-portfolio-dialog.tsx` to use `antd` `Modal` and `Form`.
        -   Replace `Input`, `Select`, `Label` with `antd` Form.Item components.
    -   [x] Check for any other portfolio-related components and migrate them.

- [x] Task 6: Global Cleanup & Verification
    - [x] Search for any remaining `@/components/ui` imports.
    - [x] Search for any remaining `lucide-react` imports.
    - [x] Remove `apps/web/components/ui` directory.
    - [x] Remove unused dependencies from `package.json` (`radix-ui`, `lucide-react`, `class-variance-authority`, `sonner`, etc.).
    - [x] Verify build (`pnpm build`) to ensure no type errors or missing imports.
    - [x] Verify mobile layout on all major screens.
