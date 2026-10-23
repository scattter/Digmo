# Digmo

Digmo 是一个自托管的基金组合管理与盘中估值工具。Web 端支持用户自助注册与登录、组合和持仓管理、交易记录、收益汇总、组合分享，以及使用个人 AI 服务配置生成组合分析。估值来自公开行情与基金披露数据，不等同基金公司公布的净值。

当前建议的部署方式是 **Docker Compose + Web + API + Redis**，适合单机、小规模使用。账户、组合、交易和 AI 配置保存在 SQLite；Redis 用于组合分享缓存，行情和估值缓存保存在 API 进程内。当前不支持多个 API 实例共享 SQLite 横向扩容。

## 项目目录

- `apps/api`：Fastify API、基金数据获取、估值任务、用户与数据管理 CLI。
- `apps/web`：Next.js Web，浏览器通过同源 `/api/*` 调用后端。
- `apps/mini`：Taro 微信小程序基础工程，独立配置 API 地址。
- `packages/shared`：Web/API/小程序共用的类型与常量。
- `infra`：本地 Redis 与生产 Compose 配置。
- `sites-hosted`：独立托管实验目录，未接完整登录流程，不属于下面的 Docker 部署方案。
- `prds`：产品与工程规划文档。

## 本地开发

使用 Node.js 22.13 或以上版本（API 使用 `node:sqlite`）和项目指定的 pnpm 9.12.2。

```bash
pnpm install --frozen-lockfile
pnpm --filter @digmo/shared build
cp apps/api/.env.example apps/api/.env
pnpm --filter @digmo/api dev
```

首次运行先生成共享包的 JS 和类型；修改共享包后也需重新生成。另开终端运行 Web：

```bash
pnpm --filter @digmo/web dev
```

访问 `http://localhost:3000/login`。仅开发环境默认创建 `admin / admin123456`；生产环境必须设置自己的管理员密码与 JWT 密钥。修改初始账号环境变量不会覆盖数据库中已有账号。

用户也可以从登录页点击“立即注册”，或访问 `/register` 自助注册。用户名为 3–32 位字母、数字、下划线或短横线，且不区分大小写；密码为 12–128 个字符，前后空白不计入。注册成功后返回登录页，使用新账号登录；自助注册创建普通用户，账户之间的组合、持仓等私人数据相互隔离。

小程序开发命令为 `pnpm --filter @digmo/mini dev:weapp`。小程序公网访问需要单独配置 HTTPS API 地址和平台允许的请求域名。

## 数据与估值

- 盘中估值已改用新浪 HTTPS 行情 `hq.sinajs.cn` 的 `fu_` 基金数据，并结合 `of` 正式净值日期核对基准；旧 `fundgz.1234567.com.cn` 接口已停用。
- 当前主估值路径仅使用新浪 `fu_/of` 和必要时的东财历史净值复核，浏览器无需直连第三方行情站点。原基金资料、披露持仓和个股行情 provider 保留兼容代码，当前估值不通过这些持仓重新计算，也不填充重仓股行情。
- 持仓披露存在时间差，基金停牌、QDII 时区和未覆盖资产都会影响盘中估算；界面数值不能当作成交价或收益保证。
- 第三方公开接口没有可用性承诺，可能限流或变更；接口返回空数据、错误页或无效值时，系统应报告不可用，而不能用模拟行情填充。
- 并非所有基金都提供盘中估值。货币基金等缺少有效估值时，单只查询返回不可用，批量查询通过 `partialFailed` 保留失败项，不用正式净值冒充盘中估值。
- 默认时区为 `Asia/Shanghai`。部署机需要可访问行情服务的 DNS 与 HTTPS 出口。

详细接口和配置见 [API 说明](apps/api/README.md)。

## 公网部署

### 1. 准备镜像和部署目录

镜像由 `.github/workflows/api-image.yml` 构建到：

- `ghcr.io/<github_owner>/digmo-api`
- `ghcr.io/<github_owner>/digmo-web`

工作流在 `master` 上的应用、共享代码、构建配置或 `.dockerignore` 变更时触发，也可手动运行。标签包括分支名、`sha-<commit>` 和默认分支的 `latest`。首次使用需启用 Actions 并允许工作流写入 Packages。

在服务器安装 Docker Compose；私有镜像需先通过 `docker login ghcr.io` 登录。将仓库的 `infra/docker-compose.prod.yml` 复制到 `/opt/digmo/docker-compose.prod.yml`。

```bash
mkdir -p /opt/digmo
cd /opt/digmo
umask 077
touch .env
```

编辑 `/opt/digmo/.env`：

```dotenv
DIGMO_IMAGE_PREFIX=ghcr.io/你的GitHub用户名或组织
DIGMO_IMAGE_TAG=latest
DIGMO_WEB_PORT=3000
AUTH_JWT_SECRET=替换为至少32字符的独立随机密钥
AUTH_BOOTSTRAP_ADMIN_USERNAME=admin
AUTH_BOOTSTRAP_ADMIN_PASSWORD=替换为至少12字符的独立强密码
DECISION_AI_ALLOWED_ORIGINS=https://api.openai.com
OPENAI_TIMEOUT_MS=120000
OPENAI_MAX_TOKENS=16384
```

可用 `openssl rand -hex 32` 生成密钥、`openssl rand -hex 16` 生成初始密码，分别保存到对应项。不要使用示例文字或把 `.env` 提交到版本库。

### 2. 启动与访问

```bash
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl --fail http://127.0.0.1:3000/api/v1/health
```

生产配置只将 Web 绑定到服务器的 `127.0.0.1:3000`；API 与 Redis 不发布宿主机端口。使用 Nginx、Caddy 等反向代理为 Web 提供 HTTPS，公网只开放反向代理的 80/443 端口。不要把 Redis 的 6379 或 API 的 3001 直接开放到公网。

Nginx 已配置证书的 HTTPS `server` 中可使用：

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 1m;
    client_body_timeout 15s;
    proxy_connect_timeout 5s;
    proxy_read_timeout 65s;
}

# 组合分析包含模型推理及最多一次重试，等待时间需覆盖 Web 的 300 秒上限。
location ~ ^/api/v1/portfolios/[^/]+/daily-decision:generate$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 1m;
    client_body_timeout 15s;
    proxy_connect_timeout 5s;
    proxy_read_timeout 310s;
}
```

浏览器访问 `https://你的域名/login`，可以使用初始管理员账号登录，也可以点击“立即注册”自行创建普通账号。注册默认开放，无需管理员代为创建或审批；当前启动流程仍要求部署者配置 JWT 密钥和初始管理员密码，这不影响普通用户自助注册。

`/api/*` 由 Web 服务端转发到 `http://api:3001`；更改 `API_UPSTREAM` 后重建 Web 容器即可生效，不必重新构建镜像。

### 3. 从旧版升级

先备份数据，保留原来的 Compose 项目名与 `api_data` 卷；换目录或项目名可能创建新卷，看起来像账户与组合丢失。不要执行 `docker compose down -v`。

新版生产环境拒绝默认 JWT 密钥、弱初始密码，以及数据库中仍使用默认密码的管理员。先设置上述环境变量并拉取新镜像。已有 `admin / admin123456` 的部署，可在服务器用新 CLI 修改旧账号密码，保留账号 ID 和组合：

```bash
docker compose -f docker-compose.prod.yml pull
read -r -s -p '输入管理员新密码（至少12字符）: ' USER_PASSWORD
export USER_PASSWORD
docker compose -f docker-compose.prod.yml run --rm --no-deps -e USER_PASSWORD api node dist/cli.js user:password --username admin
unset USER_PASSWORD
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

`.env` 中的 `AUTH_BOOTSTRAP_ADMIN_PASSWORD` 用于首次创建，**不会重置已有账号密码**。已有登录令牌不会因密码重置自动失效，升级时还需要更换 `AUTH_JWT_SECRET` 并重建 API 容器，让旧令牌失效后重新登录。

### 4. 持久化、备份与回滚

`api_data` 保存 `/app/apps/api/data` 下的 SQLite 文件，包含账户、持仓、交易记录、分析文档和个人 AI API Key。数据库与备份按敏感文件管理；目前个人 API Key 保存在服务器数据库中，不能向不受信任的人开放卷、备份或宿主机访问权限。

可停 API 后复制整个数据目录，避免复制到写入一半的 SQLite 文件（期间站点不可用）：

```bash
docker compose -f docker-compose.prod.yml stop web api
mkdir -p ./backups
chmod 700 ./backups
docker compose -f docker-compose.prod.yml cp api:/app/apps/api/data ./backups/api-data
docker compose -f docker-compose.prod.yml start api web
```

每次备份使用不同目标目录，并将备份保存到服务器之外。CLI 的 `data:export` 是组合迁移工具，不替代整个数据库备份。恢复时停止 API、还原数据目录并保持容器用户拥有读写权限。

日常更新为 `pull` 后 `up -d --remove-orphans`。回滚时把 `DIGMO_IMAGE_TAG` 改成已验证的 `sha-<commit>`，再执行相同命令；涉及数据库结构变化时，需同时评估对应数据库备份。

### 5. 配置与运行边界

- 同源 Web 不需要 CORS 配置；需要跨域时，在 `CORS_ORIGINS` 中填写逗号分隔的完整 origin。
- 管理员可从右上角头像菜单进入「AI 服务白名单」，每行填写一个 HTTPS origin（例如 `https://ai.example.com`，可包含端口，不含 `/v1` 等路径）。保存到 SQLite 后立即用于生产环境的配置保存和 AI 调用，无需重启；普通用户无法查看或修改管理接口。清空名单会禁止所有 AI 服务调用，删除地址也会阻止已有配置的后续调用。
- 页面保存的白名单优先于 `DECISION_AI_ALLOWED_ORIGINS`；未保存时沿用该环境变量，默认 `https://api.openai.com`。保存后重启不会被环境变量覆盖。开发环境仍不强制校验白名单；用户个人 AI 调用地址仍可包含 `/v1` 等路径。
- API 和 Web 代理限制请求体为 1 MiB，Web 上游请求最多等待 60 秒；API 内存限流仅覆盖单实例，不能替代反向代理的并发与流量控制。
- 已登录业务请求按验证后的用户 ID 独立限流；匿名流量、登录流量、注册流量分别按连接 IP 限流，注册最多每分钟 5 次尝试，健康检查不受业务额度影响。Web 代理后的访客仍共享连接 IP 和注册额度，不信任访客自报的转发 IP。
- `/v1/health` 成功仅说明 API 进程可响应，不证明所有基金数据源正常。部署后还要实际登录、查询目标基金、保存持仓并重启容器检查持久化。
- `.dockerignore` 排除本地数据库、环境文件和导出文件，镜像不应包含开发者账户或私人持仓。
- Web 的 Next.js 已更新到 `15.5.28`，React/React DOM 更新到 `19.0.9`，仍需持续关注后续[官方安全公告](https://nextjs.org/blog/nextjs-security-update-october-14-2026)。

排查运行问题：

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 api web
docker compose -f docker-compose.prod.yml ps
```
