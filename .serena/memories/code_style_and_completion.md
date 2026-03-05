# Code style and conventions
- Language: TypeScript.
- Existing style favors semicolons, double quotes, and concise functional helpers.
- Next.js app router layout in `apps/web/app`.
- Shared API contracts imported from `@digmo/shared`.

# Task completion checklist
- Run targeted typecheck for touched app (`pnpm --filter @digmo/web typecheck`).
- If broader changes, run monorepo `pnpm typecheck` and relevant tests.
- Summarize behavior changes and any unverified parts.
