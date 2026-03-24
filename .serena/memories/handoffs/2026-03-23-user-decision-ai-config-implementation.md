Task: implement user-configurable LLM settings for daily decision generation in Digmo, but implementation must happen in a new conversation/window because current context is full.

Environment:
- Repo: /Users/zhangke/code/self/Digmo
- Monorepo: apps/api, apps/web, packages/shared
- Current mode was Plan Mode only; no repo files were modified in this conversation.

Confirmed user decisions:
- No fallback to backend default model. If a user has not configured a personal model, daily decision generation must be unavailable.
- Web should proactively disable the "更新建议" button when the user has not configured personal model settings.
- API key editing mode: masked display only; never return plain key to frontend. When editing existing config, blank key means keep existing key.
- Client scope: Web only for now. Backend APIs should be reusable by future clients.
- Secret storage level for this iteration: plaintext in SQLite is acceptable.
- Architecture choice: separate settings table + separate settings API. Do not stuff LLM config into app_user and do not overload auth/me.
- UI placement: same user menu area as logout; add "AI 模型配置" above "退出登录".

Relevant existing code discovered:
- apps/api/src/app.ts
  - buildApp currently creates a single process-level OpenAIDecisionProvider from config.decisionAi and passes it into registerDecisionRoutes.
- apps/api/src/routes/decision.ts
  - POST /v1/portfolios/:portfolioId/daily-decision:generate currently uses deps.provider.generateDailyDecision(...) and persists deps.provider.model.
- apps/api/src/modules/decision/openai-provider.ts
  - OpenAIDecisionProvider is cheap to instantiate from options and suitable for request-time creation.
- apps/api/src/infra/watchlist/sqlite-watchlist-store.ts
  - Existing user-scoped preference pattern already exists via user_portfolio_layout_preference.
  - WatchlistStore interface is here and is a suitable place to add get/set user decision AI config methods.
  - app_user table already exists and should remain focused on auth identity.
- apps/api/src/routes/watchlist.ts
  - Existing GET/PATCH /v1/portfolios/tab-layout is a good style reference for user-scoped settings endpoints.
- apps/web/components/dashboard/layout/top-nav-layout.tsx
  - Current avatar dropdown only contains logout.
- apps/web/app/fund-dashboard.tsx
  - Handles auth check, current user, top-nav wiring, and portfolio tab layout preference fetch.
  - Best place to own decision AI settings state/dialog open state and pass handlers down.
- apps/web/components/dashboard/views/portfolio-detail-view.tsx
  - Contains the current "更新建议" button and calls generateDailyDecision(portfolio.id).
  - Currently only disables the button when no decision doc or busy.
- apps/web/lib/api.ts
  - Existing API helper patterns and current auth/me, portfolio tab layout, decision APIs.
- packages/shared/src/constants.ts and packages/shared/src/types.ts
  - Need shared error/type additions here.

Intended implementation plan:
1. Backend persistence
- Add a new SQLite table user_decision_ai_config with columns:
  - user_id TEXT PRIMARY KEY
  - base_url TEXT NOT NULL
  - api_key TEXT NOT NULL
  - model TEXT NOT NULL
  - created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  - updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
- Extend WatchlistStore + SqliteWatchlistStore with:
  - getDecisionAiConfig(userId)
  - upsertDecisionAiConfig(userId, { baseUrl, model, apiKey? })
- Store plaintext api_key for now.

2. Backend settings API
- Add protected endpoints at /v1/settings/decision-ai:
  - GET returns { config: null | { baseUrl, model, hasApiKey: true, maskedApiKey, updatedAt } }
  - PATCH accepts { baseUrl, model, apiKey? }
    - First save requires non-empty apiKey.
    - Later edits may omit/blank apiKey to preserve existing key.
    - Never return plain apiKey.
- Add validation and a dedicated shared error code for invalid settings if useful.

3. Decision generation changes
- Replace static provider injection with a provider factory or equivalent per-request provider creation in decision route.
- On generate route, before checking doc/funds, fetch the current user’s decision AI config.
- If absent, return a 400 business error with code DECISION_AI_CONFIG_REQUIRED and message telling user to configure AI model settings first.
- When config exists, instantiate OpenAIDecisionProvider using user baseUrl/apiKey/model plus server-owned systemPrompt/timeout/maxTokens/docMaxChars.
- Persist the actual user model name into DailyDecision.model.

4. Shared contracts
- packages/shared/src/constants.ts
  - add DECISION_AI_CONFIG_REQUIRED
  - optionally add INVALID_DECISION_AI_CONFIG for backend validation
- packages/shared/src/types.ts
  - add UserDecisionAiConfigSummary type for frontend/backend contract

5. Web API layer
- apps/web/lib/api.ts
  - add fetchDecisionAiConfig()
  - add updateDecisionAiConfig({ baseUrl, model, apiKey? })
- Reuse existing ensureOk error path. If generateDailyDecision fails with DECISION_AI_CONFIG_REQUIRED, frontend should surface targeted guidance and open config dialog.

6. Web UI
- Create a new dialog component similar to existing create/share/import dialogs, e.g. apps/web/components/dashboard/dialogs/decision-ai-config-dialog.tsx
- Fields:
  - 调用地址 (required)
  - 模型名称 (required)
  - API Key
- Existing-config behavior:
  - Show masked key or “已配置” helper text, not plain value.
  - Blank API Key input means keep current key.
- Add menu item in TopNavLayout user dropdown above logout. Likely requires a new onOpenDecisionAiConfig prop.
- In FundDashboard:
  - fetch decision AI config after auth success
  - own config summary + dialog state + saving state
  - wire top-nav menu item to open dialog
  - pass decisionAiConfigured and an open-settings callback into PortfolioDetailView
- In PortfolioDetailView:
  - disable 更新建议 when !decisionAiConfigured
  - show explicit message when no config is present
  - include a button/link to open the config dialog
  - if backend still returns DECISION_AI_CONFIG_REQUIRED on generate, show message and open config dialog

7. Tests and verification
- Backend tests in apps/api/src/routes/__tests__/decision-routes.test.ts or new route test file:
  - GET settings returns null when not configured
  - PATCH initial save requires apiKey
  - PATCH later save can omit apiKey and preserves old key
  - GET never leaks plain apiKey
  - settings are isolated per user
  - generate route returns DECISION_AI_CONFIG_REQUIRED when user config missing
  - generate route uses user model/baseUrl/apiKey and stores model in decision record
  - two users with different configs do not interfere
- Verification commands:
  - pnpm --filter @digmo/api test
  - pnpm --filter @digmo/api typecheck
  - pnpm --filter @digmo/web typecheck

Files likely to touch:
- packages/shared/src/constants.ts
- packages/shared/src/types.ts
- apps/api/src/app.ts
- apps/api/src/routes/decision.ts
- apps/api/src/infra/watchlist/sqlite-watchlist-store.ts
- possibly new apps/api/src/routes/settings.ts or extend an existing route registration path
- apps/api/src/routes/__tests__/decision-routes.test.ts and/or new tests
- apps/web/lib/api.ts
- apps/web/app/fund-dashboard.tsx
- apps/web/components/dashboard/layout/top-nav-layout.tsx
- apps/web/components/dashboard/views/portfolio-detail-view.tsx
- new apps/web/components/dashboard/dialogs/decision-ai-config-dialog.tsx

Important note for next conversation:
- Because the user explicitly asked to implement in a new window, start implementation there, not here.
- Since there is already a plan, the next conversation should use the executing-plans workflow rather than re-planning.
