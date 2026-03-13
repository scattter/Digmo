FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --filter @digmo/web...

FROM deps AS build

COPY apps/web apps/web
COPY packages/shared packages/shared

ARG NEXT_PUBLIC_API_BASE_URL="http://localhost:3001"
ENV NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL}"

RUN pnpm --filter @digmo/shared build
RUN pnpm --filter @digmo/web build
RUN mkdir -p /app/apps/web/public

FROM node:22-alpine AS runtime

ENV NODE_ENV="production"
ENV PORT="3000"
WORKDIR /app

RUN addgroup -S digmo && adduser -S digmo -G digmo

COPY --from=build /app/apps/web/.next/standalone /app
COPY --from=build /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build /app/apps/web/public /app/apps/web/public

RUN chown -R digmo:digmo /app

USER digmo

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
