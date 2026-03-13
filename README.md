# Digmo

Digmo 是一个围绕场外基金盘中估值的多端系统 MVP，优先交付估值任务模块与只读 API，再由 Web 与微信小程序复用同一套数据契约。

## 目录

- `apps/api`: Fastify API + 估值任务调度
- `apps/web`: Next.js Web MVP（估值查询）
- `apps/mini`: Taro 微信小程序 MVP（估值查询）
- `packages/shared`: 公共类型、错误码、常量
- `prds`: 产品与工程规划文档

## 快速开始

1. 安装依赖：`pnpm install`
2. 启动 API：`pnpm --filter @digmo/api dev`
3. 启动 Web：`pnpm --filter @digmo/web dev`
4. 启动小程序开发：`pnpm --filter @digmo/mini dev:weapp`

## 说明

- 默认时区：`Asia/Shanghai`
- 估值是盘中估算值，不等同基金公司官方净值
- MVP 数据层优先 MCP 聚合，生产建议替换为持牌/商业数据源

## GitHub 镜像 CI

- 工作流文件：`.github/workflows/api-image.yml`
- 触发条件：`push` 到 `master`（且涉及 `apps/api` / `apps/web` / `packages/shared` / 关键构建文件）或手动触发
- 镜像仓库：
  - `ghcr.io/<github_owner>/digmo-api`
  - `ghcr.io/<github_owner>/digmo-web`
- 标签策略：分支名、Tag、`sha-<commit>`，默认分支额外推送 `latest`

首次使用前请确认仓库 `Actions` 已启用，且工作流权限允许 `Read and write`（用于向 GHCR 推送镜像）。

## Docker Compose 部署操作

以下示例用于在一台 Linux 服务器上通过 Docker Compose 同时部署 `api + web + redis`。

### 1) 服务器准备

```bash
# 安装 Docker / Compose（按你的系统发行版安装）
docker --version
docker compose version
```

如镜像仓库是私有的 GHCR，请先登录（`<GHCR_TOKEN>` 需要 `read:packages` 权限）：

```bash
echo "<GHCR_TOKEN>" | docker login ghcr.io -u <github_username> --password-stdin
```

### 2) 准备部署目录

```bash
mkdir -p /opt/digmo
cd /opt/digmo
```

创建 `docker-compose.prod.yml`（把 `<github_owner>` 替换为你的 GitHub 组织/用户名）：

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning"]
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"

  api:
    image: ghcr.io/<github_owner>/digmo-api:latest
    restart: unless-stopped
    depends_on:
      - redis
    environment:
      TZ: Asia/Shanghai
      PORT: 3001
      WATCHLIST_DB_PATH: /app/apps/api/data/watchlist.sqlite
      REDIS_ENABLED: "true"
      REDIS_URL: redis://redis:6379
      AUTH_JWT_SECRET: "change-this-in-production"
    volumes:
      - api_data:/app/apps/api/data
    ports:
      - "3001:3001"

  web:
    image: ghcr.io/<github_owner>/digmo-web:latest
    restart: unless-stopped
    depends_on:
      - api
    environment:
      API_UPSTREAM: http://api:3001
    ports:
      - "3000:3000"

volumes:
  redisdata:
  api_data:
```

### 3) 首次部署

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

### 4) 日常更新（拉最新镜像并重建容器）

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

### 5) 常用排查命令

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml top
```

### 6) 回滚（按镜像标签回退）

1. 将 `docker-compose.prod.yml` 中镜像标签从 `latest` 改为指定历史标签（如 `sha-xxxxxx`）。
2. 执行：

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### 7) 重要说明（同源代理 + 运行时上游）

`web` 前端默认请求同源路径 `/api/*`，由 Next.js 服务端代理到上游 API。

- 运行时通过 `API_UPSTREAM` 配置后端地址（推荐 compose 内网地址：`http://api:3001`）。
- `API_UPSTREAM` 可在容器启动时变更，不需要重新构建 `digmo-web` 镜像。
- 未配置时默认值为 `http://127.0.0.1:3001`（仅适合 API 与 Web 在同一主机网络可达场景）。
