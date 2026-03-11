# 009 组合页每日决策建议 MVP PRD

## 1. 背景
当前组合页已具备持仓与收益展示能力，但缺少“当日可执行建议”能力。用户虽有自己的组合思路与策略文档，仍需要每天手动整合组合数据、市场信息与外部观点，决策成本高、执行一致性弱。

## 2. 目标
1. 在单组合页面新增“策略文档绑定 + 生成今日建议”闭环。
2. 通过第三方模型输出结构化强指令建议：买入/卖出/持有/再平衡。
3. 支持“仓位操作绑定建议动作”，实现建议与执行闭环。
4. 建议必须附来源依据，且支持历史留档与复盘。
5. 对高风险动作增加二次确认提示。

## 3. 范围
### 3.1 后端
- 新增组合决策文档管理接口。
- 新增每日建议生成、最新建议读取、历史建议读取接口。
- 新增仓位操作记录接口，并支持可选绑定建议动作。
- 新增 OpenAI Provider（Provider 抽象 + 首接 OpenAI）。
- 新增决策数据持久化表（文档、运行记录、动作明细）。

### 3.2 前端（组合详情页）
- 单组合页新增“决策与操作”摘要卡片：`更新`、`管理文档`、`历史` 三个入口。
- 新增“策略文档（Info）”管理面板（Dialog）：文本编辑、Markdown/TXT 上传、保存。
- 新增“建议历史”弹窗（Dialog）：按日期列表 + 展开查看动作明细。
- 基金更新弹窗增加 `加仓/减仓` 模式，支持可选绑定“今日建议动作”。

### 3.3 共享类型
- 新增决策文档、决策动作、每日建议等 DTO 与枚举。
- 新增仓位操作记录 DTO。
- 新增决策相关错误码（`DECISION_DOC_NOT_FOUND`、`DECISION_GENERATION_FAILED`）。

## 4. 数据与接口
### 4.1 新增数据表（SQLite）
1. `portfolio_decision_doc`
   - 组合策略文档版本；同一组合仅 1 个生效版本（`is_active=1`）。
2. `portfolio_daily_decision_run`
   - 每次建议生成运行记录（状态、耗时、模型、token、错误信息）。
3. `portfolio_daily_decision_action`
   - 每次运行对应的结构化动作明细（含 citations）。

### 4.2 新增接口
1. `PUT /v1/portfolios/:portfolioId/decision-doc`
2. `GET /v1/portfolios/:portfolioId/decision-doc`
3. `POST /v1/portfolios/:portfolioId/daily-decision:generate`
4. `GET /v1/portfolios/:portfolioId/daily-decision/latest`
5. `GET /v1/portfolios/:portfolioId/daily-decision/history`
6. `POST /v1/portfolios/:portfolioId/funds/:fundCode/position-operations`
7. `GET /v1/portfolios/:portfolioId/position-operations`

### 4.3 核心规则
1. 仅允许对当前组合内基金输出动作建议。
2. 每条动作建议必须有 `citations`（来源依据非空）。
3. 若动作风险为 `HIGH`，强制 `requiresSecondConfirm=true`。
4. 绑定建议时，`bindSuggestion` 必须指向“当日最新建议”，且 `actionOrder` 必须有效。
5. 生成失败时返回 `DECISION_GENERATION_FAILED`，并写入失败运行记录。
6. 生成输入中包含：
   - 当前组合持仓快照（含 `estimateChangePct` 与 `officialDailyReturn` 双口径）
   - 最近仓位操作历史（含可选 bindSuggestion）
   - 当前生效策略文档版本

## 5. 页面交互规则
1. 单组合页“决策与操作”摘要卡片展示最新建议摘要，并提供：
   - `更新`：触发生成今日建议
   - `管理文档`：打开策略文档管理弹窗
   - `历史`：打开建议历史弹窗
2. “管理文档”弹窗支持上传 `.md/.markdown/.txt`，并可直接编辑后保存；保存后成为当前生效版本。
3. “建议历史”弹窗默认仅展示日期，展开后显示建议摘要、token/耗时、动作与 citations。
4. 动作详情字段：
   - `actionType / fundCode / fundName / rationale / triggerCondition / validUntil / confidence / riskLevel`
   - `citations[]`（标题、摘要、来源类型、可选链接）
5. 更新基金弹窗中，`加仓/减仓` 可选绑定“今日建议动作”；无可绑定建议时显示提示文案。
6. 高风险动作在 UI 中应显示二次确认语义（字段 `requiresSecondConfirm=true`）。

## 6. 配置与降级
1. 配置项：
   - `DECISION_AI_PROVIDER=openai`
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL`
   - `OPENAI_MODEL`
   - `OPENAI_TIMEOUT_MS`
   - `OPENAI_MAX_TOKENS`
   - `OPENAI_ENABLE_WEB_SEARCH`
   - `DECISION_AI_SYSTEM_PROMPT_FILE`
   - `DECISION_AI_DOC_MAX_CHARS`
2. 降级策略：
   - 优先调用 `/v1/responses`；若网关不支持（如 404/405/415/422/501）回退 `/v1/chat/completions`。
   - 若结构化输出失败（非 JSON / schema 不匹配）再尝试纯文本回退；纯文本回退成功时返回 `summary`，`actions=[]`。
   - `OPENAI_API_KEY` 缺失或 `401/403` 鉴权失败不走纯文本回退，直接失败。
   - 结构化结果若“无 citations / 推荐组合外基金”会被服务端拒绝并记失败运行。

## 7. 验证
1. 后端集成测试：
   - 文档保存/读取；
   - 生成建议成功路径；
   - 无文档时拒绝生成；
   - 无来源建议被拒绝并返回失败码；
   - 仓位操作记录可写入并进入模型输入；
   - `/v2/portfolios/daily-profit` 已移除（404）。
2. 后端单元测试：
   - 决策结构校验器（字段/范围/来源必填）；
   - OpenAI Provider 的 `responses -> chat` 回退链路；
   - 纯文本回退链路与文档截断（`DECISION_AI_DOC_MAX_CHARS`）行为。
3. 前端验证：
   - 单组合卡片“更新/管理文档/历史”交互可用；
   - 文档保存、文件上传、建议生成、历史切换可用；
   - 加仓/减仓可选绑定建议动作。

## 8. 验收标准
1. 单组合页可完成“文档绑定 → 生成建议 → 查看历史”的完整闭环。
2. 每条结构化建议动作都附来源依据，且仅涉及组合内基金。
3. 仓位操作可绑定当日建议动作，并在历史记录中保留绑定信息。
4. 高风险动作在 UI 中必须具备二次确认提示语义。
5. 生成失败不会返回不可追溯结构化动作，且历史中可看到失败记录。
