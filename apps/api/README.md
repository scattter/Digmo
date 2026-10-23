# @digmo/api

Digmo 的 Fastify 后端，提供用户自助注册与登录、基金盘中估值、组合与持仓交易管理、组合分享、个人 AI 配置和组合分析。账户数据使用 SQLite 持久化，估值和任务状态使用进程内缓存，Redis 用于组合分享缓存。

## 运行

使用 Node.js 22.13+ 和 pnpm 9.12.2。在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @digmo/shared build
cp apps/api/.env.example apps/api/.env
pnpm --filter @digmo/api dev
```

开发环境默认账号为 `admin / admin123456`。生产部署使用 [根目录部署说明](../../README.md#公网部署) 和 `infra/docker-compose.prod.yml`，不能沿用开发密钥或默认密码。

## 数据源

- **盘中估值**：新浪 HTTPS `https://hq.sinajs.cn/list=fu_<基金代码>,of<基金代码>`，使用 GB18030 解码；`fu_` 提供估值、涨跌幅与时间，`of` 提供正式净值及基准日期。
- **净值基准核对**：正式净值已更新、与估值基准不一致时，通过东财 `api.fund.eastmoney.com/f10/lsjz` 的最近三条历史净值核对，避免把不同日期的净值混用。
- **基金资料和披露持仓**：旧天天基金/东方财富 provider 保留兼容代码；当前主估值请求仅使用上述新浪数据和必要的净值日期复核，不调用旧持仓计算流程，`topHoldings` 保持为空。
- 旧 `fundgz.1234567.com.cn` 已停用；新估值的 `method` 是 `SINA_DIRECT`，旧方法类型保留以兼容历史数据。
- 盘中估值请求有超时、响应体积限制与同基金并发合并。货币基金等没有有效估值时返回 `DATA_SOURCE_UNAVAILABLE`（503），批量查询通过 `partialFailed` 返回失败项；不生成模拟估值，不用正式净值替代实时估值。
- 内存缓存最多 2000 项，仓库各类数据最多 2000 个键，每只基金的净值/估值历史最多 256 条；这些缓存重启后清空，不影响 SQLite 中的账户和持仓。

这些是第三方网站公开数据接口，不是有 SLA 的商业 API。接口可用性和数据时间需在部署主机验证；健康检查成功不代表所有基金均可估值。披露持仓和盘中估算都可能滞后，不能当作官方净值或交易保证。

## 主要 API

公开读接口：

- `GET /v1/health`
- `GET /v1/funds/:fundCode/estimate`
- `POST /v1/funds/estimate/batch`（1–50 个基金代码）
- `GET /v1/tasks/valuation/status`

注册与登录接口：

- `POST /v1/auth/register`（公开注册，创建普通用户）
- `POST /v1/auth/login`
- `GET /v1/auth/me`（需要 Bearer token）

注册请求体为 `{ "username": "alice", "password": "用户自行设置的密码" }`。用户名去除前后空白后须为 3–32 位字母、数字、下划线或短横线；密码去除前后空白后须为 12–128 个字符。用户名不区分大小写，重复注册返回 `409 DUPLICATE_USERNAME`，格式不符返回 `400 INVALID_CREDENTIALS`。

注册成功返回 `201` 和 `{ "user": { "id": "...", "username": "alice", "role": "user", "status": "active" } }`。角色和状态由服务端固定，不接受调用方提升权限；密码使用现有加盐哈希方式保存。注册不签发 token，随后调用登录接口获取 token。Web 已提供 `/register` 页面和登录页入口。

注册默认开放，无需管理员审批。当前服务启动仍要求配置生产 JWT 密钥和初始管理员密码；普通用户不需要知道这些配置，也不必通过 CLI 创建账号。

以下接口需要登录，数据按用户隔离：

- `GET /v1/funds/flat?expand=dedup|expanded&sortOrder=desc|asc`
- `GET/POST /v1/portfolios`
- `PATCH/DELETE /v1/portfolios/:portfolioId`
- `GET/POST /v1/portfolios/:portfolioId/funds`
- `PATCH/DELETE /v1/portfolios/:portfolioId/funds/:fundCode`
- 持仓操作记录、组合分享、组合分析文档与分析结果，以及个人 AI 配置接口，见 `src/routes/` 中对应模块。

Web 从同源 `/api/v1/*` 调用，由 Next.js 服务端转发到 API 的 `/v1/*`。

仅管理员可调用的全站 AI 白名单接口（普通用户返回 `403`，未登录返回 `401`）：

- `GET /v1/settings/decision-ai/allowed-origins`：返回 `{ "allowedOrigins": ["https://api.openai.com"], "enforced": true }`，`enforced` 表示当前环境是否校验白名单。
- `PUT /v1/settings/decision-ai/allowed-origins`：提交 `{ "allowedOrigins": ["https://api.openai.com", "https://ai.example.com"] }` 替换完整名单，返回保存后的名单和 `enforced`。最多 100 个地址，自动规范化和去重；必须使用 HTTPS origin，可含端口，不可带路径、凭据、查询参数或片段。空数组表示禁止所有 AI 服务，不会回退到环境变量。

## 配置

完整开发配置见 `.env.example`。应用会读取工作目录下的 `.env`，容器通过环境变量注入配置。

| 配置 | 说明 |
| --- | --- |
| `WATCHLIST_DB_PATH` | SQLite 路径；开发默认 `./data/watchlist.sqlite`，容器固定到持久卷 `/app/apps/api/data/watchlist.sqlite` |
| `AUTH_JWT_SECRET` | 生产必填，至少 32 字符的独立随机密钥；修改后旧 token 失效 |
| `AUTH_BOOTSTRAP_ADMIN_USERNAME` | 初始管理员名，默认 `admin` |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | 生产必填，至少 12 字符且不能使用默认密码；只在账号不存在时创建 |
| `AUTH_ACCESS_TOKEN_EXPIRES_IN_SEC` | 登录 token 有效期，默认 43200 秒 |
| `CORS_ORIGINS` | 逗号分隔 HTTP(S) origin；生产默认不允许跨域，同源 Web 不需要填写 |
| `DECISION_AI_ALLOWED_ORIGINS` | 页面尚未保存白名单时使用的生产 AI 服务 HTTPS origin 名单，默认 `https://api.openai.com`，不填写 `/v1` 等路径；页面保存后以数据库为准 |
| `OPENAI_TIMEOUT_MS` / `OPENAI_MAX_TOKENS` | AI 请求超时和输出长度限制 |
| `DECISION_AI_SYSTEM_PROMPT_FILE` | 可选的系统提示词文件路径，容器内需可读 |
| `REDIS_ENABLED` / `REDIS_URL` | 分享缓存配置，生产 Compose 已启用内网 Redis |
| `VALUATION_TARGET_FUNDS` | 定时估值的基金代码，逗号分隔；默认按需查询 |
| `EASTMONEY_*` | 基金资料与持仓行情兼容配置，不代表盘中估值仍使用旧 fundgz |

生产默认防护：业务请求按已验证且未过期的登录令牌用户 ID 每分钟 300 次；无令牌或无效令牌按实际连接 IP 每分钟 300 次，不信任客户端转发的 IP。登录使用独立连接 IP 额度（每分钟 60 次），同时按用户名（不区分大小写）每分钟 10 次。注册使用另一个独立连接 IP 额度，每分钟最多 5 次尝试，超限返回 `429` 和 `Retry-After` 响应头。匿名查询不会占用登录或注册额度；`GET/HEAD /v1/health` 不参与业务限流。请求体最大 1 MiB。限流使用单实例内存，重启后重置；经 Web 代理的访客仍会共享连接 IP 及注册额度，公网入口仍应配置流量限制。

管理员可从 Web 右上角头像菜单的「AI 服务白名单」维护全站名单，配置复用 SQLite `app_meta` 保存，无需单独迁移或重启。未保存时沿用环境变量，保存后优先读取数据库，重启也保留；开发环境不强制校验白名单。用户填写的 AI 地址在生产环境必须命中当前名单，保存个人配置和实际调用都会检查，因此删除地址会阻止已有配置的后续调用。重定向不会自动跟随。个人 API Key 保存在服务器 SQLite 中；卷和完整备份必须限制访问权限。

## 用户与数据 CLI

创建用户时可通过 `USER_PASSWORD` 传入密码，避免将密码写入 shell 历史：

```bash
read -r -s -p '输入新用户密码: ' USER_PASSWORD
export USER_PASSWORD
pnpm --filter @digmo/api user:create -- --username alice --role user
unset USER_PASSWORD
```

重置已有用户密码（保持账号 ID 和组合）：

```bash
read -r -s -p '输入新密码（至少12字符）: ' USER_PASSWORD
export USER_PASSWORD
pnpm --filter @digmo/api user:password -- --username alice
unset USER_PASSWORD
```

生产镜像用编译后的 CLI，例如：

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -e USER_PASSWORD api node dist/cli.js user:password --username admin
```

密码重置不会使已签发的 token 自动失效。如旧默认密码已在公网使用，升级时应同时更换 `AUTH_JWT_SECRET` 并重建 API 容器。仅修改 `AUTH_BOOTSTRAP_ADMIN_PASSWORD` 不会重置已有账号。

组合迁移：

```bash
pnpm --filter @digmo/api data:export -- --username alice --out ./alice-export.json
pnpm --filter @digmo/api data:import -- --in ./alice-export.json
```

导出文件含账户和持仓等敏感数据。该迁移格式不等于完整数据库备份，升级前应停 API 并备份整个数据目录。`db/schema.sql` 是 PostgreSQL 的目标结构，当前运行服务并未使用 PostgreSQL。

## 轻量检查

```bash
pnpm --filter @digmo/api typecheck
pnpm --filter @digmo/api test
```

测试和类型检查不替代 Docker 镜像构建、线上网络、TLS、真实登录与重启后持久化验收。
