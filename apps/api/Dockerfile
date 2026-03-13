FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --filter @digmo/api...

FROM deps AS build

COPY apps/api apps/api
COPY packages/shared packages/shared

RUN pnpm --filter @digmo/shared build
RUN pnpm --filter @digmo/api build

FROM node:22-alpine AS runtime

ENV NODE_ENV="production"
WORKDIR /app

RUN addgroup -S digmo && adduser -S digmo -G digmo

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/shared /app/packages/shared
COPY --from=build /app/apps/api /app/apps/api

RUN mkdir -p /app/apps/api/data && chown -R digmo:digmo /app

USER digmo
WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/index.js"]
