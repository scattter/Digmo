# Digmo project overview
- Purpose: Off-exchange fund intraday valuation MVP with shared API/data contracts across Web and WeChat mini-program.
- Monorepo structure:
  - apps/api: Fastify API + valuation task scheduler
  - apps/web: Next.js web MVP
  - apps/mini: Taro mini-program MVP
  - packages/shared: shared types/constants/errors
  - prds: product/engineering planning docs
- Stack: TypeScript monorepo managed by pnpm + turbo; Next.js 15/React 19 on web.
- Timezone default: Asia/Shanghai.
