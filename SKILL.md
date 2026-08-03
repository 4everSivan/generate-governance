---
name: generate-governance
description: >-
  Analyze a project codebase and generate AI governance documents (constitution.md,
  AGENTS.md, {TOOL}.md). Automatically detects language, framework, architecture, and
  domain to produce role-appropriate governance constraints. Supports Claude, Gemini,
  Codex, Kiro, and Kimi Code tool entries. Use when the user wants to set up or refresh
  project governance documentation. Manual-only: trigger only when user explicitly
  requests governance generation.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
  - Workflow
  - AskUserQuestion
  - mcp__semble__search
  - mcp__semble__find_related
---

# Generate Governance

为项目自动生成 AI 治理三件套: `constitution.md` (安全红线与工作模式), `AGENTS.md` (项目事实层), `{TOOL}.md` (工具入口). Kimi Code 目标额外生成原生桥接入口 `.kimi-code/AGENTS.md`.

## 输入参数

- `$ARGUMENTS` — `[target-path] [--tool claude|gemini|codex|kiro|kimi]`
- target-path 默认为当前路径 (`.`); 无法识别为项目时提示用户指定.
- `--tool` 指定目标工具入口; 未指定时由 Phase 2 按现有入口提出建议.

## Phase 1: 项目分析

### 运行时检测

先检测当前运行环境, 决定走哪条分析路径:

- **Claude Code 路径 (Phase 1-C)**: 若当前环境提供 `Workflow` 工具, 走此路径. 用 `workflow-analyze.js` 并行 5 agent 分析, 产出结构化 project profile JSON, 交互用 `AskUserQuestion`.
- **Codex 降级路径 (Phase 1-D)**: 若无 `Workflow` 工具 (Codex 等环境), 走此路径. 先检测 `semble` MCP 是否可用: 可用时优先用 `mcp__semble__search` / `mcp__semble__find_related` 做语义检索, 仅在 semble 不可用或返回上下文不足时降级到 Grep/Glob/Read 字面扫描. 复杂维度可选派 subagent 深入, 自行组装与 Claude Code 路径结构一致的 project profile JSON, 交互用纯文本提问.

两条路径产出的 project profile JSON 结构必须一致 (字段名, 嵌套, enum 值对齐 `workflow-analyze.js` 的 SUMMARIZE_SCHEMA), 以保证后续确认和模板填充无差异.

1. 确认 target-path 存在且包含可识别项目特征 (go.mod / package.json / Cargo.toml / requirements.txt / Makefile / src/ 等).
2. 若不满足, 提示用户并询问是否继续最小生成.

### Phase 1-C: Claude Code 路径

使用 Workflow 工具执行 `workflow-analyze.js`:

```
Workflow({scriptPath: "workflow-analyze.js", args: {targetPath: "<target-path>"}})
```

`scriptPath` 用相对 skill 自身根目录的路径 (`workflow-analyze.js`), 不写死 `.agents/skills/...` 或 `~/.codex/skills/...` 等具体安装路径. skill 运行时的工作目录即 skill 根, 这样无论安装到 `.agents/skills/` 还是 `~/.codex/skills/` 都能正确加载.

获取项目画像 (project profile JSON), 进入 Phase 2.

### Phase 1-D: Codex 降级路径

不调用 `workflow-analyze.js` (它依赖 Claude Code Workflow API). 改为指令式扫描目标项目, 自行组装 project profile JSON.

**1.D.0 探索工具选择**

先检测当前环境是否提供 `semble` MCP:

- 若可用: 代码结构理解, 实现定位, 调用关系查找等语义检索优先使用 `mcp__semble__search` / `mcp__semble__find_related`; 仅对精确字符串、全仓库字面匹配、确认符号残留, 或 semble 返回上下文不足时, 才降级到 Grep/Glob/Read.
- 若不可用: 使用 Grep/Glob/Read 指令式扫描.

此规则与该 skill 自身生成的 `{{#has_mcp_semble}}` 能力块一致 (先语义检索, 后字面扫描), 避免 Codex 路径在 semble 可用时违反用户全局 CLAUDE.md 的 semble-first 约定.

**1.D.1 指令式扫描 (主)**

按 1.D.0 选定的探索工具执行以下扫描, 覆盖 5 个分析维度:

- **语言与构建**: `Glob **/{go.mod,package.json,Cargo.toml,requirements.txt,pyproject.toml,Makefile,setup.py}` → 推断主语言与构建系统.
- **依赖分类**: `Read` 依赖文件 (manifest / lock), `Grep` 关键词分类: db_driver (postgres/mysql/redis/mongo/sqlalchemy/gorm) / mq (kafka/rabbitmq/nats) / cache (redis/memcached) / http (express/gin/fastapi/axios) / auth (jwt/passport/oauth).
- **部署维度**: `Glob **/{Dockerfile,docker-compose*.yml,docker-compose*.yaml,k8s/**/*.yaml,*.tf,*.tfvars}` → deploy 证据.
- **API 维度**: `Glob **/{routes,controllers,handlers,api,endpoints,app/api,pages/api}/**` + `Glob **/{openapi.yaml,openapi.yml,swagger.json,schema.graphql,*.proto,asyncapi.yaml}` → api 证据 (框架/路由/契约).
- **安全维度**: `Grep -i "auth|secret|token|password|credential|permission"` → security 证据 (认证机制/敏感数据).
- **运维维度**: `Glob **/{monitoring,alerts,grafana,prometheus,alertmanager}/**` + `Glob **/{prometheus.yml,alertmanager.yml,rules.yml}` → maintenance 证据.

**1.D.2 可选 subagent 深入**

对命中的复杂维度, 派 subagent 深入 (仅当证据量大或分散时):

- **api 命中且 routes/controllers 文件多**: 派一个 subagent, 任务 "读取 `<target-path>` 下 routes/ 与 controllers/ 的 handler 文件, 总结: 使用的 API 框架, 路由路径列表, 认证入口文件, 契约文件". subagent 返回结构化文本, 提取填入 api_summary.
- **security 命中且证据分散**: 派一个 subagent, 任务 "扫描 `<target-path>` 的认证机制与敏感数据处理, 总结: auth_mechanism, 敏感字段处理位置, 权限模型". 提取填入 security_summary.

subagent 返回的是结构化文本, 主 agent 负责提取关键字段组装 profile, 不直接信任 subagent 的推断结论 (需有代码证据).

**1.D.3 组装 project profile JSON**

按 `workflow-analyze.js` 的 SUMMARIZE_SCHEMA 结构组装:

- `project_name`: 目标目录名, 或 manifest 的 name 字段.
- `language` / `framework` / `build_system` / `entry_points` / `arch_pattern`: 从代码结构扫描得出; 无证据时使用空数组或 `unknown`, 不补造.
- `domain`: 用中文描述项目领域 (具体优于泛化, "电商后端服务" 优于 "后端服务").
- `role`: 中文专家角色, 模式 "精通 {language} 的 {domain_specialist}".
- `priorities`: 有序优先级列表. 命中 database+api → `数据安全 > API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度`; 命中 api 无 database → `API 安全与契约兼容 > ...`; 非 DB 非 API → `服务可用性 > ...`. **不得仅因缺 auth entrypoints 推断 internal API 并降级** (对齐 review-checklist:27); 缺 auth 证据标注 "auth 未检测, 风险未知".
- `dimensions`: code 总是命中; database (db_driver 依赖或迁移脚本); api (路由/控制器/契约/框架/测试证据); deploy (Dockerfile/k8s/Terraform/CI); maintenance (监控/告警配置). api 缺 auth 证据标 LOW confidence.
- `scope`: 关键技术逗号分隔列表.
- `deps_summary` / `scripts_summary` / `dirs_summary` / `security_summary`: 分别从依赖, 配置, 目录和安全扫描压缩得出; 缺失项保留空集合或显式 unknown.
- `api_summary`: { frameworks, route_paths, schema_files, auth_entrypoints, test_paths, evidence, confidence }.
- `deployment_summary`: { has_dockerfile, has_docker_compose, has_k8s, has_terraform, ci_pipeline, description, evidence, confidence }.
- `maintenance_summary`: { log_locations, monitoring_tools, alert_configs, evidence, confidence }.
- `confidence`: { language, framework, arch_pattern, dimensions, api } 各 HIGH/MEDIUM/LOW/UNKNOWN.

组装后进入 Phase 2; 无结构化提问工具时使用该阶段的 Codex 文本交互.

## Phase 2: 建议设置确认

分析后构造单一 `proposed_settings`, 一次呈现并确认生成配置. 它包含:

- `tool`: 按 `CLAUDE.md` → `GEMINI.md` → `CODEX.md` → `KIRO.md` → (`KIMI.md` 或 `.kimi-code/AGENTS.md`) → 默认 `claude` 推荐. Kimi 双入口算一个工具; 多个不同工具并存时标记为未决选择.
- `file_strategies`: 扫描 `constitution.md`, `AGENTS.md`, 所有工具入口及 `user-custom` 区块; 已存在文件默认建议 merge, 新文件标记 create.
- `confirmed_dimensions`: 展示每个维度的证据与 confidence; code 始终命中, 弱证据维度必须显式标注.
- `confirmed_capabilities`: 只列出当前环境检测到的 MCP/skills/workflow capabilities 及将启用的规则; 接受建议即确认这些能力.
- `user_redlines`: 展示模板基线红线; 默认无额外用户红线, 可在调整时按维度补充.
- `review_context`: 只从 Phase 1 已有结果和本次用户回复派生的短暂审查上下文, 用于判断是否需要高风险预览与 `Apply`; 不写入决策日志或新增项目文件.

### Phase 2.1: 审查上下文与受限决策门控

`review_context` 只服务本次确认, 不新增扫描 agent、CLI、Git 历史检查或持久化文件. 它最多包含:

- `protected_writes`: 已存在且策略为 merge / overwrite 的目标文件.
- `semantic_maps`: 每个 `protected_write` 的有界语义映射: 目标文件与段落/事实分类、当前内容依据、拟议动作、保留的 user-custom 内容及仍有歧义的边界.
- `weak_evidence`: 将要启用但 evidence 或 confidence 为 LOW / UNKNOWN 的维度、能力或事实.
- `policy_or_scope_conflicts`: 已展示的现有治理规则冲突、工具入口冲突或用户范围冲突.
- `history_status`: 仅为 `not-checked`、`unavailable` 或 `checked`; 默认 `not-checked`. 只有用户明确要求审计，或已展示现有治理冲突且用户同意后，才可以检查 Git 历史。历史不可用只报告 `unavailable`，不得推断“历史安全”，也不得为此新增扫描步骤。
- `validation_gaps`: 已确认输出范围内仍需后续验证的项目事实；仅在最终列表非空时进入 AGENTS 的事实边界表。

以下任一项触发高风险门控: 对已存在文件执行 merge / overwrite、启用弱证据内容、或存在未解决的规则/范围冲突。新建且高置信度的文件保持原有的一次确认，不增加 Preview / Apply。

高风险场景先合并相近问题，再最多呈现三组且按影响排序: (1) 既有文件写入边界，(2) 证据与项目规则冲突，(3) 工具、能力或范围冲突。每个推荐项必须同时给出一个真实替代项及其代价；但文件策略仍保留 merge / overwrite / skip 三个原生选项。超过三组的未决项必须列为剩余阻塞，不得因未展示而允许写入。

merge / overwrite 必须先完成对应 `semantic_map`; 无法给出有界映射时，不得合并或覆盖，只能请求澄清或选择 skip。`validation_gaps` 只能记录最终生成文件中仍待验证的项目事实，绝不记录文件策略、历史状态、待执行 `Apply`、提问过程或其他临时决策状态。

检测候选 MCP 服务:

| 能力 | 规则用途 |
|------|----------|
| `semble` | 代码搜索优先级, 语义检索, find-related |
| `tokensave` | 代码图探索, 依赖分析, 长期决策记录 |
| `headroom` | 上下文压缩, 原文 hash 追溯, 压缩统计 |
| `context7` | 第三方库/API/CLI/云服务文档查询 |
| `fetch` | 外部 URL 与官方资料获取 |

检测候选 skills 与工作流能力:

| 能力 | 规则用途 |
|------|----------|
| `improve-codebase-architecture` | 架构改进, 解耦, 可测试性分析 |
| Superpowers skill suite | 原因未知的 bug 与中型任务; 进入后遵循其完整内部 skill 链路 |
| `grill-me` | 小型但有歧义的任务; 每次使用前取得用户明确确认 |
| OpenSpec / OPSX | 大型重构, 从 0 构建, 新功能模块与系统契约变化 |
| `documents` / `pdf` / `spreadsheets` / `presentations` | 文档, PDF, 表格, 演示文稿生成与视觉验证 |
| `pua` | 失败多次后的强制换路与穷尽方案, 仅用户明确确认时写入 |

### 能力规范化映射 (CapabilityProfile)

每个检测到的能力归一化为 `CapabilityProfile`, 字段:

- `id`: 规范化能力 ID.
- `kind`: `mcp` | `skill` | `skill-suite` | `workflow`.
- `detected`: 当前环境是否检测到.
- `confirmed`: 是否经 Phase 2 已展示结果的用户确认.
- `detection_basis`: 检测依据 (manifest 命中, suite 元数据, CLI 可用, 初始化状态等).
- `template_condition`: 对应模板条件 token.

Superpowers 额外字段:

- `complete`: 是否构成完整 suite.
- `members`: 已发现成员 skill 列表.
- `missing_members`: 引用但无法解析的成员.

派生规则:

- `detected` 不自动推出 `confirmed`; `confirmed` 只能来自 Phase 2 已展示结果的用户确认.
- `detected` 中每一项必须是完整的 `CapabilityProfile` 对象; 非对象或缺少必填字段时直接失败, 不得静默忽略.
- 能力条件仅在 `detected && confirmed` 时成立.
- Superpowers 条件还必须满足 `complete === true`.
- 组合条件由依赖能力派生, 不接受独立确认.

检测名称 -> 规范能力 ID -> kind -> 模板条件 token 的唯一映射 (运行时能力映射由本表生成, 是唯一事实源):

| 检测名称 / 别名 | 规范 ID | kind | 模板条件 token |
|----------------|---------|------|---------------|
| `semble` | `semble` | `mcp` | `has_mcp_semble` |
| `tokensave` | `tokensave` | `mcp` | `has_mcp_tokensave` |
| `headroom` | `headroom` | `mcp` | `has_mcp_headroom` |
| `context7` | `context7` | `mcp` | `has_mcp_context7` |
| `fetch` | `fetch` | `mcp` | `has_mcp_fetch` |
| `improve-codebase-architecture` | `improve-codebase-architecture` | `skill` | `has_skill_architecture` |
| Superpowers (using-superpowers 及其成员) | `superpowers` | `skill-suite` | `has_skill_superpowers` |
| `grill-me` | `grill-me` | `skill` | `has_skill_grill_me` |
| OpenSpec / OPSX | `openspec` | `workflow` | `has_workflow_openspec` |
| `pua` | `pua` | `skill` | `has_skill_pua` |

派生组合条件 (由依赖能力派生, 不接受独立确认):

| 派生条件 | 依赖 |
|----------|------|
| `has_workflow_superpowers_and_openspec` | `has_skill_superpowers` 与 `has_workflow_openspec` 均确认 |

# capability: artifacts (any)
| `documents` | `documents` | `skill` | `has_skill_artifacts` |
| `pdf` | `pdf` | `skill` | `has_skill_artifacts` |
| `spreadsheets` | `spreadsheets` | `skill` | `has_skill_artifacts` |
| `presentations` | `presentations` | `skill` | `has_skill_artifacts` |
# /capability

`artifacts` 分组以 `any` 语义聚合: 任意一个成员检测到并确认即展开 `has_skill_artifacts` 块. 派生组合条件 (如 `has_workflow_superpowers_and_openspec`) 在对应模板消费者就绪后加入, 避免产生无消费者的孤立映射.

检测规则:

- **Superpowers**: 按已注册 suite/plugin 元数据判定完整性; 缺少元数据时, `using-superpowers` 引用的全部成员必须可解析, 且必须显式记录已解析成员 (`resolved_members`), 未提供解析结果视为全部不可解析; 任一缺失记入 `missing_members` 并令 `complete = false`. 只有 `brainstorming` 不构成完整 suite. `complete = false` 时不得生成完整工作流规则.
- **`grill-me`**: 按精确名称或命名空间等价名称检测.
- **OpenSpec**: 分别记录 `openspec` CLI 是否可用与目标项目是否已初始化 (`openspec/config.yaml`, `openspec/` 工作区或已生成 OPSX skills). 不得把 CLI 已安装等同于项目已初始化.

能力状态必须区分:

- `detected`: 当前环境检测到 (不自动推出 `confirmed`).
- `confirmed`: 用户确认写入生成规范 (只能来自 Phase 2 已展示结果).
- `skipped`: 未检测到或用户选择不写入.
- `details`: 对 suite/工作流记录成员 skills, CLI 版本和初始化状态等已验证事实; 不得补造缺失成员或命令.

文件策略语义:

- **merge**: 保留旧文件 `<!-- user-custom -->...<!-- /user-custom -->` 区块, 更新其余生成内容; 标记外用户文本先警告.
- **overwrite**: 备份到 `.governance-backup/` 后重写.
- **skip**: 保留现有文件, 不写入.
- **create**: 仅用于不存在的目标文件.

将项目画像与 confidence, 维度证据, 文件策略, 工具入口, 能力规则摘要, 基线红线和待确认项放在同一消息中. 若已有 `constitution.md`, 同时提示维度应与现有项目治理对齐.

无高风险触发且无未决必选项时使用 AskUserQuestion:

```
header: "生成设置"
question: "是否按以上建议设置生成治理文档?"
options:
  - label: "按建议生成"
    description: "确认展示的工具, 文件策略, 维度, 能力和基线红线"
  - label: "调整"
    description: "一次性修正工具, 文件策略, 维度, 能力或自定义红线"
  - label: "取消"
    description: "不写入任何文件"
```

多个不同工具入口并存等未决必选项存在时, 不提供可直接写入的"按建议生成"; 改为"补充选择"或"取消", 并只收集未决字段. 高风险触发时, "按建议生成"只确认建议设置, 不得直接进入写入；必须完成下述 Preview / Apply。

选择"调整"时一次性收集结构化修正; 未列出的字段沿用已展示建议:

```text
tool: codex
files: constitution.md=merge, AGENTS.md=merge, CODEX.md=overwrite
dimensions: +api, -maintenance
capabilities: semble, superpowers, grill-me, openspec
redlines.database:
- 禁止生产环境执行未审查 DDL
```

除高风险门控中的最多三组问题外，只有以下情况允许追加提问: 调整回复缺少必选字段; 多工具入口仍未选择; 已存在文件仍无策略. 追加问题只询问缺失字段, 不重复已确认内容.

**Codex 降级路径交互**: 若无 `AskUserQuestion`, 输出同一建议设置摘要并要求回复 `按建议生成` / `调整: <结构化修正>` / `取消`. 多工具入口未决时要求在调整中指定 `tool`. 高风险场景改为先收集门控问题、展示 Preview，再要求用户回复精确的 `Apply`；不得把“按建议生成”或旧回复解释为 `Apply`.

确认后得到最终 `tool`, `file_strategies`, `confirmed_dimensions`, `confirmed_capabilities`, `user_redlines`, `review_context`. 选择取消则不写任何文件.

**红线:** 未确认不得写入; 已存在文件必须有策略; 高风险必须 Preview 后取得精确 `Apply`; 无 `semantic_map` 不得 merge / overwrite; 多工具入口不得静默选择; Kimi 两个文件分别记录策略; 弱证据维度不得静默启用; 未检测或未确认的能力不得写成项目强制规则; Superpowers 与 OpenSpec 不得在同一任务中交叉使用.

### Phase 2.5: 高风险预览与 Apply

所有高风险问题解决后，生成只覆盖本次目标的 Preview。Preview 至少逐文件列出路径、create / merge / overwrite / skip 策略、每个 merge / overwrite 的 `semantic_map` 摘要、将写入的 `validation_gaps`（如有）和仍然阻塞的项。它不是写入操作，也不创建备份、日志或额外扫描结果。

仅当 Preview 不含剩余阻塞且用户在当前轮明确选择 `Apply`，才可进入 Phase 3。任何策略、语义映射、范围或证据调整都会使旧 Preview 失效，必须重新预览；用户可改为 skip 或取消。若高风险门控未触发，Phase 2 的一次确认即可进入 Phase 3。

## Phase 3: 模板填充与生成

### 3.1 模板选择

根据命中的维度, 读取对应模板文件:

- `templates/governance/constitution/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/agents/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/tool-entry/{tool}.md`
- 仅当 `tool = kimi` 时, 额外读取 `templates/governance/tool-entry/kimi-native-agents.md`
- `templates/governance/code-standards/{language}.md` 或 `templates/governance/code-standards/generic.md`

模板路径: 优先查找项目 `templates/governance/`, 其次 skill 内置 `templates/governance/`.

代码维度总是尝试加载语言专属编码规范:

| profile.language | 模板 |
|------------------|------|
| `Go` / `Golang` | `code-standards/go.md` |
| `Python` | `code-standards/python.md` |
| `TypeScript` / `JavaScript` / `Node.js` | `code-standards/typescript.md` |
| `Java` / `Kotlin` / `Spring` | `code-standards/java.md` |
| `Rust` | `code-standards/rust.md` |
| 其他或低置信度 | `code-standards/generic.md` |

若项目已有更具体的语言规范文档或 formatter/linter 配置, 语言模板只能作为补充, 不得覆盖项目现有规范.

API 维度使用 Phase 1 的框架, 路由, 契约, 测试与网关证据; 仅检测到 SDK client 或含义不明的 `api/` 目录时标记 LOW confidence, 在 Phase 2 等待确认.

API 维度影响优先级:

- 同时命中 database 和 api: `数据安全 > API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度`
- 命中 api 但未命中 database: `API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度`
- 内部 API 且无敏感数据 (仅经用户显式确认后): `接口契约稳定性 > 服务可用性 > 可恢复性 > 证据可信度`

不得仅因缺少 auth entrypoints 就推断为内部 API 并降级优先级; 缺少 auth 证据是不确定性与风险, 应在画像中标注 "auth 未检测, 风险未知" 由用户确认, 而非自动套用内部 API 优先级.

### 3.2 模板填充

将以下变量替换到模板占位符中:

| 占位符 | 来源 | 示例值 |
|--------|------|--------|
| `{{PROJECT_NAME}}` | profile.project_name | `my-go-service` |
| `{{DATE}}` | runtime.current_date | `2026-06-18` |
| `{{VERSION}}` | generator.default_version | `1.0` |
| `{{SCOPE}}` | profile.scope | `Go, Gin, PostgreSQL, Kubernetes` |
| `{{DOMAIN}}` | profile.domain | `后端服务` |
| `{{ROLE}}` | profile.role | `精通 Go 的架构师` |
| `{{PRIORITIES}}` | profile.priorities | `数据安全 > API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度` (命中 api+database 时) |
| `{{#has_db}}...{{/has_db}}` | 条件 inline: 维度命中时展开 |
| `{{USER_REDLINES_DATABASE}}` | user_input.redlines.database | 用户输入的逐条红线 |
| `{{USER_REDLINES_API}}` | user_input.redlines.api | 用户输入的 API 维度逐条红线 |
| `{{USER_REDLINES_CODE}}` | user_input.redlines.code | 用户输入的代码维度逐条红线 |
| `{{USER_REDLINES_DEPLOY}}` | user_input.redlines.deploy | 用户输入的部署维度逐条红线 |
| `{{USER_REDLINES_MAINTENANCE}}` | user_input.redlines.maintenance | 用户输入的运维维度逐条红线 |
| `{{DIMENSION_SECTIONS}}` | confirmed_dimensions | 已确认维度对应的 `agents/dim-*.md` 有序组合; 固定顺序 code、database、api、deploy、maintenance, 仅插入已确认维度 |

模板中还有以下子对象占位符, 从项目画像的子字段填充:

| 占位符 | 来源路径 | 说明 |
|--------|---------|------|
| `{{PROJECT_DESCRIPTION}}` | profile.domain + profile.deps_summary | 项目一句话描述 |
| `{{DIRS_TABLE}}` | profile.dirs_summary | 目录→用途的 Markdown 表格 |
| `{{REFERENCES_SECTION}}` | profile.dirs_summary | 参考文档路径列表 |
| `{{SCRIPTS_TABLE}}` | profile.scripts_summary | 命令→用途的 Markdown 表格 |
| `{{TOPOLOGY_SECTION}}` | profile.security_summary + profile.deps_summary | 服务拓扑描述 |
| `{{LANGUAGE}}` | profile.language | 编程语言 |
| `{{FRAMEWORK}}` | profile.framework | 框架名 |
| `{{BUILD_SYSTEM}}` | profile.build_system | 构建系统 |
| `{{ENTRY_POINTS}}` | profile.entry_points | 入口文件列表 |
| `{{ARCH_PATTERN}}` | profile.arch_pattern | 架构模式 |
| `{{ARCH_CONFIDENCE}}` | profile.confidence.arch_pattern | 架构推断置信度 |
| `{{DB_DRIVERS}}` | profile.deps_summary.categorized.db_driver | 数据库驱动 |
| `{{MIGRATION_TOOL}}` | profile.scripts_summary.migrate | 迁移工具 |
| `{{DB_TYPE}}` | profile.deps_summary.categorized.db_driver | 数据库类型 |
| `{{HAS_DOCKERFILE}}` | profile.deployment_summary.has_dockerfile | 是否有 Dockerfile |
| `{{HAS_K8S}}` | profile.deployment_summary.has_k8s | 是否有 K8s 配置 |
| `{{HAS_TERRAFORM}}` | profile.deployment_summary.has_terraform | 是否有 Terraform 配置 |
| `{{CI_PIPELINE}}` | profile.deployment_summary.ci_pipeline | CI/CD 描述 |
| `{{LOG_LOCATIONS}}` | profile.maintenance_summary.log_locations | 日志位置 |
| `{{MONITORING_TOOLS}}` | profile.maintenance_summary.monitoring_tools | 监控工具 |
| `{{ALERT_CONFIGS}}` | profile.maintenance_summary.alert_configs | 告警配置 |
| `{{API_FRAMEWORKS}}` | profile.api_summary.frameworks | API 框架 |
| `{{API_ROUTE_PATHS}}` | profile.api_summary.route_paths | 路由/控制器/Handler 路径 |
| `{{API_SCHEMA_FILES}}` | profile.api_summary.schema_files | OpenAPI/Swagger/GraphQL/proto 契约文件 |
| `{{API_AUTH_ENTRYPOINTS}}` | profile.api_summary.auth_entrypoints | 认证/授权入口 |
| `{{API_TEST_PATHS}}` | profile.api_summary.test_paths | API/integration/e2e/contract 测试路径 |
| `{{API_CONFIDENCE}}` | profile.api_summary.confidence | API 维度检测置信度 |
| `{{CAPABILITIES_SUMMARY}}` | confirmed_capabilities | 已确认能力的名称、确认状态与检测依据摘要; 不输出规则正文 |
| `{{LANGUAGE_CODE_STANDARDS}}` | profile.language + code-standards 模板 | 语言专属编码规范, 未命中时使用 generic |
| `{{VALIDATION_GAPS_TABLE}}` | derived_review_context.validation_gaps | 最终仍待验证的项目事实表行; 只在 AGENTS 的 `has_validation_gaps` 条件内使用 |

**条件 block 语法:**
- `{{#has_db}}...{{/has_db}}` — 命中 database 维度时展开 inline 内容 (用于角色描述中的子句)
- `{{#has_api}}...{{/has_api}}` — 命中 api 维度时展开 inline 内容
- `{{#has_deploy}}...{{/has_deploy}}` — 命中 deploy 维度时展开 inline 内容
- `{{#has_maintenance}}...{{/has_maintenance}}` — 命中 maintenance 维度时展开 inline 内容
- `{{#has_mcp_semble}}...{{/has_mcp_semble}}` — 检测到并经用户确认 `semble` 时展开
- `{{#has_mcp_tokensave}}...{{/has_mcp_tokensave}}` — 检测到并经用户确认 `tokensave` 时展开
- `{{#has_mcp_headroom}}...{{/has_mcp_headroom}}` — 检测到并经用户确认 `headroom` 时展开
- `{{#has_mcp_context7}}...{{/has_mcp_context7}}` — 检测到并经用户确认 `context7` 时展开
- `{{#has_mcp_fetch}}...{{/has_mcp_fetch}}` — 检测到并经用户确认 `fetch` 时展开
- `{{#has_skill_architecture}}...{{/has_skill_architecture}}` — 检测到并经用户确认架构改进 skill 时展开
- `{{#has_skill_superpowers}}...{{/has_skill_superpowers}}` — 检测到并经用户确认完整 Superpowers suite 时展开
- `{{#has_skill_grill_me}}...{{/has_skill_grill_me}}` — 检测到并经用户确认 `grill-me` 时展开
- `{{#has_workflow_openspec}}...{{/has_workflow_openspec}}` — 检测到并经用户确认 OpenSpec/OPSX 时展开
- `{{#has_skill_artifacts}}...{{/has_skill_artifacts}}` — 检测到并经用户确认文档/表格/演示/PDF 类 skill 时展开
- `{{#has_skill_pua}}...{{/has_skill_pua}}` — 检测到并经用户明确确认 `pua` skill 时展开
- `{{#has_workflow_superpowers_and_openspec}}...{{/has_workflow_superpowers_and_openspec}}` - Superpowers 与 OpenSpec 均确认时展开, 生成 constitution 互斥红线
- `{{#has_validation_gaps}}...{{/has_validation_gaps}}` — 最终 `review_context.validation_gaps` 非空时仅在 AGENTS 展开事实置信度与验证边界表

能力 block 只有在 `detected && confirmed` 同时成立时展开 (Superpowers 还需 `complete === true`); 派生组合条件在其依赖能力均确认时成立. 条件 inline (`{{#has_*}}`) 同理. `has_validation_gaps` 不属于能力条件，且不得在 constitution 或工具入口展开。维度内容通过 `{{DIMENSION_SECTIONS}}` 按固定顺序插入, 不使用 `{{#dim-*}}` block 标签.

### 3.3 写入输出文件

完成 Phase 2 的普通确认，或高风险 Preview 后获得当前轮精确 `Apply`，才可写入共享治理文件与所选工具入口:

```
<target-path>/constitution.md
<target-path>/AGENTS.md
<target-path>/{TOOL}.md
```

Kimi 的 `{TOOL}.md` 为 `KIMI.md`, 并额外写入 `<target-path>/.kimi-code/AGENTS.md`. 仅在用户确认 Kimi 后创建 `.kimi-code/`; 两个入口分别使用 Phase 2 确认的文件级策略, 不得绑定处理或相互代替.

已存在文件处理:
1. 使用 Phase 2 已确认的文件级策略: 覆盖 (备份到 `.governance-backup/`) / 合并 / 跳过.
2. 对每个 merge / overwrite，先确认 Phase 2.1 的有界 `semantic_map`，再使用 Phase 2.5 已确认的 Preview；缺少其一必须暂停，不得把当前文件整体当作可安全替换。
3. 覆盖模式: 分别备份旧文件, 写入新文件.
4. 合并模式: 保留对应旧文件中 `<!-- user-custom -->...<!-- /user-custom -->` 标记的内容, 其余更新; 标记外存在用户文本时先警告, 不静默丢弃.
5. 跳过: 不写入.
6. 若 Phase 2 未记录某个已存在文件的处理策略, 必须暂停并再次询问, 不得默认覆盖.

### 3.4 来源标注

每个生成文件的 section 末尾添加 HTML 注释标注填充来源:

```markdown
<!-- source: template/base -->
<!-- source: scan/code-structure, confidence: HIGH -->
<!-- source: infer, confidence: MEDIUM -->
<!-- source: user-input -->
<!-- source: capability-detect, confirmed: true -->
<!-- source: review-context/validation-gaps, confirmed: true -->
```

## Phase 4: 完成摘要

展示每个目标文件的 create/merge/overwrite/skip/failed 状态, 已确认的维度与能力, 以及所有 LOW/UNKNOWN confidence 或缺失证据项. 高风险场景还必须说明 Preview / Apply 是否完成、`history_status`，并列出 `validation_gaps`；只在最终摘要中呈现这些决策状态，不创建持久化决策日志。Kimi 需分别报告 `KIMI.md` 与 `.kimi-code/AGENTS.md`; 不得在任一入口失败时宣称四文件完整. 提醒用户重点审查 infer 和 user-input 来源段落。

高风险完成后，附上最多三条可追溯的人工复核问题，每条指向对应文件、来源注释或 `validation_gaps` 表行。它们是非阻塞复核，不要求用户答题，不得伪装为新的确认或验收门槛。

## 错误处理

| 场景 | 处理 |
|------|------|
| target-path 为空 | 默认 `.` |
| 目标路径无项目特征 | 提示, 询问是否继续最小生成 (仅 base 模板, 无维度叠加) |
| Workflow 部分 agent 失败 | 标注该维度数据盲区, 其余正常 |
| 多个工具入口同时存在 | 提示用户选择本次生成/更新的工具入口 |
| 已有治理文档但用户未确认处理策略 | 停止写入该文件, 询问合并/覆盖/跳过 |
| merge / overwrite 缺少有界语义映射 | 不生成 Preview，不写入该文件；请求补充映射或选择 skip |
| 高风险 Preview 后未收到当前轮精确 `Apply` | 不写入、不备份；保留为待用户决定的交互状态 |
| 超过三组未决问题 | 仅展示优先级最高的三组，但把其余列为阻塞；不得写入 |
| Git 历史未检查或不可用 | 仅报告 `not-checked` / `unavailable`，不推断历史安全，也不新增检查 |
| `.kimi-code` 是普通文件或目录不可创建 | 不写入原生桥接文件并报告明确错误; 不宣称 Kimi 四文件完整 |
| 跳过的 `.kimi-code/AGENTS.md` 未引用 `KIMI.md` | 警告 Kimi 可能不会加载完整工具入口 |
| Kimi 桥接引用的根治理文件缺失或被跳过 | 在完成摘要中列为待确认项 |
| API 检测证据较弱 | 标记 LOW confidence, 在维度确认阶段让用户决定是否启用 api |
| API 模板缺失 | 跳过 api 维度并报告缺失模板, 不生成半截 API 红线 |
| 能力检测失败 | 不生成特定 MCP/skill/workflow capability 强制规则, 仅生成通用降级规则 |
| 用户跳过能力确认 | 不写入特定 MCP/skill/workflow capability 规则 |
| Kimi 主入口或原生桥接模板缺失 | 停止对应入口生成并报告缺失, 不使用其他工具模板冒充 Kimi |
| 模板文件缺失 | 降级到 skill 内置 fallback 模板 |
| 语言编码规范模板缺失 | 使用 `code-standards/generic.md`; 若 generic 也缺失, 生成最小代码质量规则 |
| 用户中断交互 | 保留分析结果, 下次可续接 |

## 自检清单

- [ ] 参数解析正确 (target-path, --tool)
- [ ] Workflow 返回有效项目画像
- [ ] 已扫描现有治理文档和工具入口
- [ ] 已确认已有文件的合并/覆盖/跳过策略
- [ ] merge / overwrite 均有有界语义映射；无映射的目标已 skip 或仍处于阻塞
- [ ] Kimi 双入口已按一个工具识别, 两个文件分别确认策略
- [ ] 仅在确认 Kimi 后创建 `.kimi-code/`, 完成摘要报告四文件状态
- [ ] 维度判定正确
- [ ] API 维度证据已展示并由用户确认
- [ ] 能力检测完成, 未检测到的能力未写入强制规则
- [ ] 用户确认的 MCP/skills/workflow capabilities 条件 block 正确展开
- [ ] Phase 2 建议设置已一次性确认; 追加提问仅覆盖未决字段
- [ ] 高风险问题最多分为三组；剩余未决项未被静默放行
- [ ] 高风险 Preview 已展示，且当前轮收到精确 `Apply` 后才写入
- [ ] `validation_gaps` 只包含最终待验证事实，未包含文件策略、历史或临时交互状态
- [ ] 模板选择正确
- [ ] 语言专属编码规范模板选择正确
- [ ] 占位符全部填充, 无残留 `{{ }}`
- [ ] 维度 block 正确展开/删除
- [ ] 已存在文件正确处理
- [ ] 来源标注清晰
- [ ] 高风险完成摘要含非阻塞、可追溯的人工复核问题
- [ ] 未做 git commit
