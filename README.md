# generate-governance

`generate-governance` 是一个用于生成项目级 AI 协作治理文档的 skill。它面向 Claude Code, Codex, Gemini CLI, Kiro, Kimi Code 等 AI IDE / CLI 代理, 通过扫描目标代码库的语言、框架、依赖、配置和安全线索, 生成一套可审查、可追溯、可按工具入口复用的治理基线。

这个项目解决的问题不是“生成一份通用说明文档”, 而是把一个项目中容易散落在口头约定、README、工具记忆和个人偏好里的 AI 协作规则, 收敛成三个明确分层的文件:

- `constitution.md`: 项目最高优先级的安全红线、工作模式和行为边界 (含条件成立后的 workflow 互斥红线)。
- `AGENTS.md`: 项目事实与已确认环境能力策略层, 保存目录、脚本、技术栈、拓扑、能力使用边界与工作流路由策略。
- `{TOOL}.md`: 面向具体 AI 工具的入口文件, 例如 `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `KIRO.md`, `KIMI.md`。Kimi 目标额外生成原生桥接入口 `.kimi-code/AGENTS.md`。

生成结果强调两点:

- **证据优先**: 项目事实来自代码库扫描、用户确认和显式输入; 推断内容需要标注边界。
- **环境感知**: MCP 服务、skills 与 workflow capabilities 只有在当前环境检测到且经用户确认后, 才会写入项目规范, 避免把个人机器上的能力误写成团队强制依赖。

## 适用场景

- 为新项目建立 AI 协作基线, 明确 AI 可以做什么、不能做什么、遇到生产风险时如何降级。
- 为已有项目补齐或刷新 `constitution.md`, `AGENTS.md` 和工具入口文件, 在合并前先识别已有 `CLAUDE.md`, `CODEX.md`, `GEMINI.md`, `KIRO.md`, `KIMI.md` 等文件, 降低不同 AI 工具之间的规则漂移。
- 在团队中推广统一的 AI 使用规范, 把安全红线、事实来源、测试命令和工具能力边界写成可版本化文档。
- 为数据库、部署、运维等高风险项目增加可恢复、可审计、低风险优先的操作约束。

## 设计原则

- **分层治理**: 红线归 `constitution.md`, 项目事实归 `AGENTS.md`, 工具差异归 `{TOOL}.md`, 避免同一规则在多个文件里互相冲突。
- **保守生成**: 检测不到的能力不生成强制规则; 用户未确认的 MCP / skill / workflow capability 不写入项目规范; 已存在的治理文档未经确认不覆盖。
- **面向审查**: 模板保留来源注释, 便于区分扫描结果、推断内容、用户输入和能力检测结果。
- **最小安装面**: npm CLI 只负责复制 skill 文件, 不修改目标项目业务代码, 不执行治理生成流程。

## 功能

分析项目代码库, 自动生成以下治理文档:

- **`constitution.md`** - 安全红线、工作模式与合规约束
- **`AGENTS.md`** - 项目事实层：技术栈、架构、目录结构、依赖、脚本
- **`{TOOL}.md`** - 工具入口文件（Claude Code / Gemini / Codex / Kiro / Kimi Code）
- **`.kimi-code/AGENTS.md`** - 仅 Kimi 目标生成的原生桥接入口

核心能力:

- 自动识别语言、框架、构建系统、入口文件、目录布局和架构模式。
- 解析依赖并识别数据库、消息队列、缓存、HTTP、认证、日志和测试相关组件。
- 检测 Docker, Kubernetes, Terraform, CI/CD, lint, format 和测试脚本等工程配置。
- 检查认证、权限、敏感数据处理和输入校验等安全线索。
- 检测 API 框架、路由、契约文件、认证入口和 API 测试线索, 并在用户确认后启用 API 治理维度。
- 按命中的治理维度选择模板, 并收集用户自定义红线。
- 支持条件生成 MCP / skills / workflow capabilities 规则, 包括 Semble, TokenSave, Headroom, Context7, Fetch, 文档与架构类 skills, 以及 Superpowers、grill-me、OpenSpec 等工作流能力。
- 生成前扫描目标项目已有治理文档和工具入口, 支持按文件选择合并、覆盖或跳过。
- Kimi Code 使用完整 `KIMI.md` + 原生 `.kimi-code/AGENTS.md` 双入口, 两个文件分别确认处理策略。
- 根据项目主语言注入语言专属编码规范模板, 未命中时降级到通用编码规范。

## 输出文件分层

| 文件 | 责任 | 不应该包含 |
|------|------|------------|
| `constitution.md` | 最高优先级安全红线、工作模式、证据纪律、生产操作边界 | 具体目录、脚本、领域知识手册 |
| `AGENTS.md` | 项目事实、脚本命令、目录说明、服务拓扑、已确认环境能力 | 重复定义安全红线 |
| `{TOOL}.md` | 某个 AI 工具的入口说明和工具专属行为 | 与其他工具共享的项目事实 |
| `.kimi-code/AGENTS.md` | Kimi 原生加载到根治理文件的桥接 | 重复项目事实或 Kimi 专属能力正文 |

这种分层让多个 AI 工具可以共用同一项目事实层, 同时保留各自入口文件的差异。

## 工作流

```
项目代码 -> 并行分析 (5 Agents) -> 项目画像 -> 建议设置确认 (文件+维度+能力+红线) -> 模板填充 -> 输出三件套 (Kimi 为四文件)
```

### Phase 1: 并行分析

通过 `workflow-analyze.js` 启动 5 个并行 Agent：

| Agent | 分析内容 |
|-------|---------|
| code-structure | 语言、框架、构建系统、入口文件、目录布局、架构模式、编码约定 |
| dependencies | 依赖解析与分类 (db_driver, mq, cache, http, auth…) |
| config | 构建/运行脚本、CI/CD 管线、部署描述符 (Dockerfile, K8s, Terraform) |
| security | 认证机制、敏感数据处理、权限模型、输入校验 |
| api | API 框架、路由、契约文件、认证入口和 API 测试线索 |

### Phase 2: 建议设置确认

- 一次性呈现项目画像、维度证据、已有文件策略、工具入口、检测到的 MCP / skills / workflow capabilities 和基线红线。
- 用户可按建议生成、一次性调整所有设置或取消；只有多工具入口、已有文件策略或调整内容仍未决时才追加提问。
- 接受建议即确认已展示的能力与维度；未检测到或未确认的能力不会成为项目强制规则。

### Phase 3: 模板填充

根据命中的治理维度选择模板，填充占位符后输出文档。

环境能力规则采用条件生成: 只有当前环境检测到且用户确认启用的 MCP / skill / workflow capability 才会写入 `AGENTS.md`; 工具入口只引用该唯一来源。未检测到或用户跳过的能力不会生成强制规则。

## 安全与边界

- 不自动修改目标项目业务代码。
- 不自动提交 git commit, 不 push, 不发布 npm 包。
- 目标路径已有治理文档时, 必须先展示已有文件和工具入口检测结果, 再由用户确认覆盖、合并或跳过。
- 多个工具入口文件同时存在时, 必须由用户选择本次更新的 `{TOOL}.md`, 不静默覆盖多个入口。
- 生产操作相关规则默认只读优先, 写操作需要明确目标环境和用户授权。
- 外部文档、源码和搜索结果只证明机制边界, 不替代项目现场证据。

## 模板结构

```
templates/governance/
├── constitution/          # 安全红线模板
│   ├── base.md            # 通用基线
│   ├── dim-code.md        # 代码质量维度
│   ├── dim-database.md    # 数据库维度
│   ├── dim-api.md         # API 维度
│   ├── dim-deploy.md      # 部署维度
│   └── dim-maintenance.md # 运维维度
├── agents/                # AGENTS.md 模板
│   ├── base.md
│   └── dim-*.md
├── tool-entry/            # 工具入口模板
│   ├── claude.md
│   ├── gemini.md
│   ├── codex.md
│   ├── kiro.md
│   ├── kimi.md
│   └── kimi-native-agents.md
└── code-standards/        # 语言专属编码规范模板
    ├── generic.md
    ├── go.md
    ├── java.md
    ├── python.md
    ├── rust.md
    └── typescript.md
```

## 支持的治理维度

| 维度 | 触发条件 | 典型红线 |
|------|---------|---------|
| **code** (始终命中) | 任意项目 | 禁止跳过 review 合并、覆盖率 ≥80% |
| **database** | 检测到 DB 驱动或迁移脚本 | 禁止无备份 DDL、禁止生产 DROP TABLE |
| **api** | 检测到 API 框架、路由、契约文件或 API 测试线索 | 禁止未审计公开 API、禁止响应泄露敏感字段 |
| **deploy** | 检测到 Docker/K8s/Terraform/CI | 禁止绕过 CI 部署、金丝雀发布强制等待 |
| **maintenance** | 检测到监控/告警配置 | 禁止无告警变更、变更窗口限制 |

## API 治理维度

`api` 维度面向生产 API 安全与契约兼容, 不是普通接口风格指南。已有代码项目会自动检测 API 证据, 但生成前仍需要用户确认是否启用该维度。

检测信号包括:

- API 框架: Express, Fastify, NestJS, Next.js API routes, Gin, Echo, Fiber, FastAPI, Django REST Framework, Flask, Spring Web, Actix Web, Axum.
- 路由结构: `routes/`, `controllers/`, `handlers/`, `api/`, `endpoints/`, `app/api/`, `pages/api/`.
- 契约文件: `openapi.yaml`, `openapi.yml`, `swagger.json`, `schema.graphql`, `*.proto`, `asyncapi.yaml`.
- 测试线索: API, integration, e2e, contract, handler, controller tests.
- 网关或生成工具: Kong, Envoy, grpc-gateway, OpenAPI generator.

治理重点:

- 未确认认证、匿名访问和权限边界前, 不新增或放宽公开 API.
- API 响应不泄露敏感字段、token、内部错误栈、连接信息或实现细节.
- 破坏性 API 变更需要版本策略、迁移说明、兼容层或用户确认的 breaking-change 方案.
- 非幂等写接口需要幂等键、事务保护或重复提交防护.
- 已知 API 契约与实现不一致且影响安全或兼容性时, 不发布.

## 语言编码规范

代码治理维度会根据 `workflow-analyze.js` 推断出的主语言, 向 `constitution.md` 和 `AGENTS.md` 注入对应的编码规范模板。

| 主语言 | 模板 |
|--------|------|
| Go / Golang | `templates/governance/code-standards/go.md` |
| Python | `templates/governance/code-standards/python.md` |
| TypeScript / JavaScript / Node.js | `templates/governance/code-standards/typescript.md` |
| Java / Kotlin / Spring | `templates/governance/code-standards/java.md` |
| Rust | `templates/governance/code-standards/rust.md` |
| 其他或低置信度 | `templates/governance/code-standards/generic.md` |

语言规范只作为项目现有 formatter, linter, test convention 和架构约定的补充; 如果目标项目已有更具体的规范, 生成文档应优先引用项目内已有规范。

## 可选环境能力规则

生成时可检测并由用户确认写入以下能力规则：

| 类型 | 能力 | 规则用途 |
|------|------|----------|
| MCP | `semble` | 代码语义搜索优先, find-related, grep/rg 使用边界 |
| MCP | `tokensave` | 代码图探索, 依赖分析, 长期决策记录 |
| MCP | `headroom` | 上下文压缩, hash 追溯, 压缩摘要保真 |
| MCP | `context7` | 第三方库/API/CLI/云服务文档查询 |
| MCP | `fetch` | 外部 URL 和官方资料获取 |
| Skill | `improve-codebase-architecture` | 架构改进, 解耦, 可测试性分析 |
| Skill suite | Superpowers | 原因未知的 bug 与中型任务; 进入后遵循完整原生链路 |
| Skill | `grill-me` | 小型歧义任务的可选澄清, 每次使用前确认 |
| Workflow | OpenSpec / OPSX | 大型重构, 从 0 构建, 新功能模块与系统契约变化; 与 Superpowers 互斥 |
| Skill | 文档类 skills | Word/PDF/表格/演示文稿生成与视觉验证 |
| Skill | `pua` | 失败多次后的换路恢复, 仅用户明确确认时生成 |

### Workflow 路由

工作流类能力仅在检测到且经用户确认后启用, 路由遵循以下规则:

- **小任务默认直接执行**: 明确且范围小的任务不走任何工作流, 直接完成。
- **`grill-me`**: 适用于小型但有歧义的任务; 每次使用前需取得用户任务级确认, 确认后可重新分类为直接执行或更重的工作流。降级到直接执行不需要二次确认。
- **Superpowers**: 适用于原因未知的 bug 与中型任务; 依据已注册 suite/plugin 元数据判定完整性, 缺少元数据时 `using-superpowers` 引用的全部成员必须可解析, 任一缺失则 suite 不完整、不生成完整工作流规则。仅 `brainstorming` 不构成完整 suite。
- **OpenSpec / OPSX**: 适用于大型重构、从 0 构建、新功能模块与系统契约变化; CLI 安装与项目初始化均需用户显式授权, 不得把 CLI 已安装等同于项目已初始化。用户拒绝安装或初始化且任务范围不变时, 只能取消或延期; 用户缩小范围时必须重新分类并重新确认工作流, 不得保持大型任务范围改走 Superpowers 或 direct。
- **互斥**: 仅当 Superpowers 与 OpenSpec 都确认时, 在 `constitution.md` 生成唯一互斥红线 (同一任务不得交叉使用, 执行中不得调用或切换到另一工作流, 同时请求两者时停止并二选一)。只确认单方时不点名另一方。

> 注: generate-governance 生成治理文档, 其中包含工作流能力的使用边界与路由策略; 它本身不充当通用工作流路由器, 也不执行运行时任务路由。

## 支持的 AI 工具

- **Claude Code** - 生成 `CLAUDE.md`
- **Gemini CLI** - 生成 `GEMINI.md`
- **Codex (OpenAI)** - 生成 `CODEX.md`
- **Kiro** - 生成 `KIRO.md`
- **Kimi Code CLI** - 生成 `KIMI.md` 与 `.kimi-code/AGENTS.md`

工具入口自动检测优先级: `CLAUDE.md` -> `GEMINI.md` -> `CODEX.md` -> `KIRO.md` -> (`KIMI.md` 或 `.kimi-code/AGENTS.md`) -> 默认 Claude。任一 Kimi 入口存在即识别为 Kimi; 两者同时存在只算一个工具入口。

若目标项目已存在多个工具入口文件, 自动检测结果只作为推荐值; 生成前仍需要用户确认本次更新哪个入口文件。

## 已有文件处理

生成前会扫描:

- `constitution.md`
- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `CODEX.md`
- `KIRO.md`
- `KIMI.md`
- `.kimi-code/AGENTS.md`

对已存在文件支持三种策略:

| 策略 | 行为 |
|------|------|
| 合并 | 保留 `<!-- user-custom -->...<!-- /user-custom -->` 区块, 更新其余生成内容 |
| 覆盖 | 先备份到 `.governance-backup/`, 再写入新文件 |
| 跳过 | 保留现有文件, 不写入 |

未确认策略的已有文件不会被写入。

选择 Kimi 时, `KIMI.md` 与 `.kimi-code/AGENTS.md` 分别确认合并、覆盖或跳过; 其他工具仍只生成现有三件套。

## 使用

安装后, 在支持 skills 的 AI 工具中显式调用:

```bash
# 当前目录，自动检测工具入口
/generate-governance

# 指定目标项目路径
/generate-governance /path/to/project

# 指定目标工具
/generate-governance /path/to/project --tool codex
/generate-governance . --tool gemini
/generate-governance . --tool kimi
```

## 安装

要求 Node.js `>=18`。

### 通过 npm / npx 安装

```bash
# 安装到用户级 agents skills 目录: ~/.agents/skills/generate-governance
npx generate-governance-skill install

# 安装到当前项目: ./.agents/skills/generate-governance
npx generate-governance-skill install --project .

# 安装到 Codex 用户级 skills 目录: ~/.codex/skills/generate-governance
npx generate-governance-skill install --codex

# 指定 skills 目录或具体 skill 目录
npx generate-governance-skill install --target ~/.agents/skills
npx generate-governance-skill install --target ~/.agents/skills/generate-governance

# 预览安装计划
npx generate-governance-skill install --dry-run
```

若目标目录已存在, 安装器会停止并提示; 确认要替换时使用:

```bash
npx generate-governance-skill install --force
```

也可以全局安装:

```bash
npm install -g generate-governance-skill
generate-governance-skill install --project .
```

### 手动安装

将本 skill 放入项目的 `.agents/skills/generate-governance/` 目录，或安装为用户级 skill。

## 发布状态

当前 npm 包版本为 `0.3.0`。发布内容见 `CHANGELOG.md`。

## 项目结构

```
generate-governance/
├── CHANGELOG.md                # 发布变更记录
├── package.json                # npm 包定义
├── bin/install.js              # npm CLI 安装器
├── SKILL.md                    # Skill 定义与完整指令
├── workflow-analyze.js         # Workflow 脚本：并行分析 + 项目画像合成
├── scripts/                    # 一致性检查与离线 eval 脚本
│   ├── check-consistency.mjs   # 仓库、模板、schema 与发布一致性
│   └── eval-fixtures.mjs       # 离线 fixture evaluator
├── examples/                   # 离线 eval fixture (7 组, 60 场景)
├── templates/governance/       # 治理文档模板
├── docs/review-checklist.md    # 生成结果审查清单
└── README.md
```

## 技术说明

`workflow-analyze.js` 使用 Claude Code 的 Workflow API，以结构化 JSON Schema 约束每个分析 Agent 的输出，确保结果可机器处理。分析结果合并后生成 `ProjectProfile`，驱动模板填充。

### 验证

```bash
npm run check  # 仓库、模板、schema、能力映射与发布一致性
npm run eval   # 7 组离线 fixture、60 个确定性场景
npm test       # check + eval + 安装器 dry-run
```

离线 eval 验证证据分类、维度、文件保护、工具入口契约、能力规范化、workflow 路由状态迁移与模板组合契约, 不调用模型或网络, 也不代表模型质量评测。

文件策略边界: 三种策略 (merge/overwrite/skip) 是 generate-governance skill 的交互与写入契约。npm CLI 仅负责安装 skill 文件, 不执行治理文档合并。离线 eval 验证策略选择与逐文件保护边界, 不是合并引擎的端到端测试。

## License

MIT
