---
name: generate-governance
description: >-
  Analyze a project codebase and generate AI governance documents (constitution.md,
  AGENTS.md, {TOOL}.md). Automatically detects language, framework, architecture, and
  domain to produce role-appropriate governance constraints. Supports Claude, Gemini,
  Codex, and Kiro tool entries. Use when the user wants to set up or refresh project
  governance documentation. Manual-only: trigger only when user explicitly requests
  governance generation.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
  - Workflow
  - AskUserQuestion
---

# Generate Governance

为项目自动生成 AI 治理三件套: `constitution.md` (安全红线与工作模式), `AGENTS.md` (项目事实层), `{TOOL}.md` (工具入口).

## 输入参数

- `$ARGUMENTS` — `[target-path] [--tool claude|gemini|codex|kiro]`
- target-path 默认为当前路径 (`.`); 无法识别为项目时提示用户指定.
- `--tool` 指定目标工具入口; 未指定时根据项目现有入口文件自动检测 (检测顺序: CLAUDE.md → GEMINI.md → CODEX.md → KIRO.md → 默认 claude).

## Phase 1: 项目分析

调用 Workflow 并行分析目标项目:

1. 确认 target-path 存在且包含可识别项目特征 (go.mod / package.json / Cargo.toml / requirements.txt / Makefile / src/ 等).
2. 若不满足, 提示用户并询问是否继续最小生成.
3. 使用 Workflow 工具执行 `workflow-analyze.js`:

```
Workflow({scriptPath: ".agents/skills/generate-governance/workflow-analyze.js", args: {targetPath: "<target-path>"}})
```

4. 获取项目画像 (project profile JSON).

## Phase 2: 第一轮交互 — 检测结果确认 (现有文档与维度)

将现有治理文档与项目画像的检测结果**一次性**呈现给用户, 避免分多轮确认. 呈现内容:

- **现有治理文档扫描**: 检测 `constitution.md` / `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` / `CODEX.md` / `KIRO.md` 是否存在, 每个文件是否含 `<!-- user-custom -->...<!-- /user-custom -->` 可保留区, 以及提议的处理策略 (默认: 合并).
- **工具入口**: 自动检测顺序 `CLAUDE.md` → `GEMINI.md` → `CODEX.md` → `KIRO.md` → 默认 `claude`. 若多个工具入口同时存在, 必须提示用户选择本次生成/更新的 `{TOOL}.md`.
- **项目画像摘要**: 语言, 框架, 构建系统; 数据库/API/部署/监控特征; 命中维度 (code 总是命中; database/api/deploy/maintenance 条件命中).
- **关联提示**: 若检测到已有 `constitution.md`, 标注"建议维度与现有 constitution 对齐", 避免用户因信息分批呈现而忽略文档与维度的关联.

使用 AskUserQuestion 提问:

```
header: "检测结果确认"
question: "检测结果与处理策略是否准确? 需要调整吗?"
options:
  - label: "全部确认"
    description: "按提议策略继续 (现有文档合并, 维度按检测结果)"
  - label: "我要调整"
    description: "调整文档处理策略或增减维度"
```

若用户选择 "我要调整", 通过一次文本收集所有修正, 同时覆盖文档策略与维度:

```text
# 文档策略 (merge/overwrite/skip, 未列出的文件按提议默认)
constitution.md: merge
AGENTS.md: merge
CLAUDE.md: skip
CODEX.md: overwrite

# 维度修正 (增/删维度, 或修正检测结果)
+ api
- maintenance
```

更新 `confirmed_dimensions` 与文件级策略映射. 文档策略语义:

- **合并**: 保留旧文件 `<!-- user-custom -->...<!-- /user-custom -->` 区块, 更新其余生成内容.
- **覆盖**: 备份到 `.governance-backup/` 后重写.
- **跳过**: 保留现有文件, 不写入对应文件.

**红线:** 未经用户确认, 不得覆盖或重写目标项目中已存在的 `constitution.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CODEX.md`, `KIRO.md`; 多工具入口不得静默覆盖.

## Phase 3: 第二轮交互 — 环境能力检测与确认

检测当前 agent 环境中可用的 MCP 服务与 skills, 仅将**检测到且用户确认启用**的能力写入生成文档.

### 3.1 能力检测

检测候选 MCP 服务:

| 能力 | 规则用途 |
|------|----------|
| `semble` | 代码搜索优先级, 语义检索, find-related |
| `tokensave` | 代码图探索, 依赖分析, 长期决策记录 |
| `headroom` | 上下文压缩, 原文 hash 追溯, 压缩统计 |
| `context7` | 第三方库/API/CLI/云服务文档查询 |
| `fetch` | 外部 URL 与官方资料获取 |

检测候选 skills:

| 能力 | 规则用途 |
|------|----------|
| `improve-codebase-architecture` | 架构改进, 解耦, 可测试性分析 |
| `brainstorming` | 复杂或创造性变更前收敛设计 |
| `documents` / `pdf` / `spreadsheets` / `presentations` | 文档, PDF, 表格, 演示文稿生成与视觉验证 |
| `pua` | 失败多次后的强制换路与穷尽方案, 仅用户明确确认时写入 |

检测结果必须区分:

- `available`: 当前环境检测到.
- `confirmed`: 用户确认写入生成规范.
- `skipped`: 未检测到或用户选择不写入.

### 3.2 用户确认

将能力检测结果呈现给用户:

- 检测到的 MCP 服务.
- 检测到的 skills.
- 每项能力将生成的规则摘要.
- 未检测到的候选能力不生成对应强制规则.

使用 AskUserQuestion 提问:

```
header: "能力确认"
question: "是否将检测到的 MCP / skills 能力写入项目治理规范?"
options:
  - label: "确认全部"
    description: "将检测到的候选能力全部写入"
  - label: "选择部分"
    description: "我指定哪些能力写入"
  - label: "全部跳过"
    description: "不生成环境能力规则"
```

若用户选择 "选择部分", 通过文本收集确认列表, 更新 `confirmed_capabilities`.

**红线:** 不得把当前环境未检测到的 MCP/skill 写成项目强制规则; 不得在用户未确认时写入特定 MCP/skill 依赖.

## Phase 4: 第三轮交互 — 领域红线收集

对每个命中维度, 使用 AskUserQuestion 收集用户特定红线:

```
header: "{dim}红线"
question: "请补充 {dim_name} 维度的安全红线 (每条一行, 无则回复 '无')"
multiSelect: false
```

维度与示例:

| 维度 | 维度名 | 示例红线 |
|------|--------|---------|
| dim-database | 数据库 | 禁止无备份 DDL; 禁止生产环境 DROP TABLE |
| dim-api | API | 禁止未审计公开 API; 禁止响应泄露敏感字段 |
| dim-deploy | 部署 | 禁止绕过 CI 部署生产; 金丝雀发布强制等待 5 分钟 |
| dim-maintenance | 运维 | 禁止无告警变更; 变更窗口 02:00-06:00 |
| dim-code | 代码质量 | 禁止跳过 review 合并主干; 覆盖率不得低于 80% |

通用基线红线 (不伪造事实, 基于证据表达, 最小权限等) 自动填充, 不询问.

## Phase 5: 模板填充与生成

### 5.1 模板选择

根据命中的维度, 读取对应模板文件:

- `templates/governance/constitution/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/agents/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/tool-entry/{tool}.md`
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

API 维度在已有代码项目中自动检测, 但必须由用户确认后启用:

| 证据类型 | 示例 |
|----------|------|
| API 框架 | Express, Fastify, NestJS, Next.js API routes, Gin, Echo, Fiber, FastAPI, Django REST Framework, Flask, Spring Web, Actix Web, Axum |
| 路由结构 | `routes/`, `controllers/`, `handlers/`, `api/`, `endpoints/`, `app/api/`, `pages/api/` |
| 契约文件 | `openapi.yaml`, `openapi.yml`, `swagger.json`, `schema.graphql`, `*.proto`, `asyncapi.yaml` |
| 测试线索 | API, integration, e2e, contract, handler, controller tests |
| 网关/生成工具 | Kong, Envoy, grpc-gateway, OpenAPI generator |

若仅检测到 SDK client 或含义不明的 `api/` 目录, `api` 维度必须标记为 LOW confidence 并等待用户确认.

API 维度影响优先级:

- 同时命中 database 和 api: `数据安全 > API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度`
- 命中 api 但未命中 database: `API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度`
- 内部 API 且无敏感数据: `接口契约稳定性 > 服务可用性 > 可恢复性 > 证据可信度`

### 5.2 模板填充

将以下变量替换到模板占位符中:

| 占位符 | 来源 | 示例值 |
|--------|------|--------|
| `{{PROJECT_NAME}}` | 项目画像 | `my-go-service` |
| `{{DATE}}` | 当前日期 | `2026-06-18` |
| `{{VERSION}}` | 默认 `1.0` | `1.0` |
| `{{SCOPE}}` | 项目画像 | `Go, Gin, PostgreSQL, Kubernetes` |
| `{{DOMAIN}}` | 项目画像推断 | `后端服务` |
| `{{ROLE}}` | 项目画像推断 | `精通 Go 的架构师` |
| `{{PRIORITIES}}` | 项目画像 + 维度 | `数据安全 > API 安全与契约兼容 > 服务可用性 > 可恢复性 > 证据可信度` (命中 api+database 时) |
| `{{#dim-database}}...{{/dim-database}}` | 条件 block: 维度命中时展开内容 |
| `{{#has_db}}...{{/has_db}}` | 条件 inline: 维度命中时展开 |
| `{{USER_REDLINES_DATABASE}}` | 用户输入 | 用户输入的逐条红线 |
| `{{USER_REDLINES_API}}` | 用户输入 | 用户输入的 API 维度逐条红线 |
| `{{USER_REDLINES_CODE}}` | 用户输入 | 用户输入的代码维度逐条红线 |
| `{{USER_REDLINES_DEPLOY}}` | 用户输入 | 用户输入的部署维度逐条红线 |
| `{{USER_REDLINES_MAINTENANCE}}` | 用户输入 | 用户输入的运维维度逐条红线 |
| `{{DIM_INDEX}}` | 维度顺序 | 维度段章节号; base.md 固定 3.1-3.4, 维度段从 3.5 起: code 总是 3.5, 其后 database/api/deploy/maintenance 按命中顺序递增 3.6/3.7/..., 未命中不插入, 编号连续无空洞 |
| `{{TOOL_NAME}}` | 工具名 | `Claude Code` |

模板中还有以下子对象占位符, 从项目画像的子字段填充:

| 占位符 | 来源路径 | 说明 |
|--------|---------|------|
| `{{PROJECT_DESCRIPTION}}` | profile.deps_summary + profile.domain | 项目一句话描述 |
| `{{DIRS_TABLE}}` | profile.dirs_summary | 目录→用途的 Markdown 表格 |
| `{{REFERENCES_SECTION}}` | profile.dirs_summary | 参考文档路径列表 |
| `{{SCRIPTS_TABLE}}` | profile.scripts_summary | 命令→用途的 Markdown 表格 |
| `{{TOPOLOGY_SECTION}}` | profile.security_summary + profile.deps_summary | 服务拓扑描述 |
| `{{LANGUAGE}}` | profile.language | 编程语言 |
| `{{FRAMEWORK}}` | profile.framework | 框架名 |
| `{{BUILD_SYSTEM}}` | profile (推断) | 构建系统 |
| `{{ENTRY_POINTS}}` | profile (推断) | 入口文件列表 |
| `{{ARCH_PATTERN}}` | profile (推断) | 架构模式 |
| `{{ARCH_CONFIDENCE}}` | profile.confidence.arch_pattern | 架构推断置信度 |
| `{{DB_DRIVERS}}` | profile.deps_summary.categorized.db_driver | 数据库驱动 |
| `{{MIGRATION_TOOL}}` | profile.scripts_summary | 迁移工具 |
| `{{DB_TYPE}}` | profile.deps_summary.categorized.db_driver | 数据库类型 |
| `{{HAS_DOCKERFILE}}` | profile (部署检测) | 是否有 Dockerfile |
| `{{HAS_K8S}}` | profile (部署检测) | 是否有 K8s 配置 |
| `{{HAS_TERRAFORM}}` | profile (部署检测) | 是否有 Terraform 配置 |
| `{{CI_PIPELINE}}` | profile (配置检测) | CI/CD 描述 |
| `{{LOG_LOCATIONS}}` | profile (运维检测) | 日志位置 |
| `{{MONITORING_TOOLS}}` | profile (运维检测) | 监控工具 |
| `{{ALERT_CONFIGS}}` | profile (运维检测) | 告警配置 |
| `{{API_FRAMEWORKS}}` | profile.api_summary.frameworks | API 框架 |
| `{{API_ROUTE_PATHS}}` | profile.api_summary.route_paths | 路由/控制器/Handler 路径 |
| `{{API_SCHEMA_FILES}}` | profile.api_summary.schema_files | OpenAPI/Swagger/GraphQL/proto 契约文件 |
| `{{API_AUTH_ENTRYPOINTS}}` | profile.api_summary.auth_entrypoints | 认证/授权入口 |
| `{{API_TEST_PATHS}}` | profile.api_summary.test_paths | API/integration/e2e/contract 测试路径 |
| `{{API_CONFIDENCE}}` | profile.api_summary.confidence | API 维度检测置信度 |
| `{{SKILLS_INDEX}}` | profile (skills 扫描) | 技能索引列表 |
| `{{CAPABILITIES_SUMMARY}}` | confirmed_capabilities | 已确认写入的 MCP/skills 能力摘要 |
| `{{LANGUAGE_CODE_STANDARDS}}` | profile.language + code-standards 模板 | 语言专属编码规范, 未命中时使用 generic |

**条件 block 语法:**
- `{{#dim-database}}...{{/dim-database}}` — 命中 database 维度时展开 block 内容
- `{{#dim-api}}...{{/dim-api}}` — 命中 api 维度时展开 block 内容
- `{{#dim-deploy}}...{{/dim-deploy}}` — 命中 deploy 维度时展开 block 内容
- `{{#dim-maintenance}}...{{/dim-maintenance}}` — 命中 maintenance 维度时展开 block 内容
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
- `{{#has_skill_brainstorming}}...{{/has_skill_brainstorming}}` — 检测到并经用户确认 brainstorming skill 时展开
- `{{#has_skill_artifacts}}...{{/has_skill_artifacts}}` — 检测到并经用户确认文档/表格/演示/PDF 类 skill 时展开
- `{{#has_skill_pua}}...{{/has_skill_pua}}` — 检测到并经用户明确确认 `pua` skill 时展开

维度 block 展开逻辑: 命中维度时保留 block 内容并去掉 `{{#dim-*}}` / `{{/dim-*}}` 标签; 未命中时整块删除. 能力 block 只有在 `available && confirmed` 同时成立时展开. 条件 inline (`{{#has_*}}`) 同理.

### 5.3 写入输出文件

将填充后的内容写入 target-path 下的三个文件:

```
<target-path>/constitution.md
<target-path>/AGENTS.md
<target-path>/{TOOL}.md
```

已存在文件处理:
1. 使用 Phase 2 已确认的文件级策略: 覆盖 (备份到 `.governance-backup/`) / 合并 / 跳过.
2. 覆盖模式: 备份旧文件, 写入新文件.
3. 合并模式: 保留旧文件中 `<!-- user-custom -->...<!-- /user-custom -->` 标记的内容, 其余更新.
4. 跳过: 不写入.
5. 若 Phase 2 未记录某个已存在文件的处理策略, 必须暂停并再次询问, 不得默认覆盖.

### 5.4 来源标注

每个生成文件的 section 末尾添加 HTML 注释标注填充来源:

```markdown
<!-- source: template/base -->
<!-- source: scan/code-structure, confidence: HIGH -->
<!-- source: infer, confidence: MEDIUM -->
<!-- source: user-input -->
<!-- source: capability-detect, confirmed: true -->
```

## Phase 6: 完成摘要

展示生成结果:

```
治理文档生成完成:

✅ constitution.md — 已确认维度与红线
✅ AGENTS.md — 项目事实层, 8 个章节
✅ CLAUDE.md — Claude Code 工具入口

⚠ 需确认项 (2 项):
  - 架构模式推断为 "分层架构" (confidence: MEDIUM)
  - 外部服务: Redis (confidence: LOW, 未检测到连接配置)

请 review 生成文件, 特别关注标注为 infer 和 user-input 的 section.
```

## 错误处理

| 场景 | 处理 |
|------|------|
| target-path 为空 | 默认 `.` |
| 目标路径无项目特征 | 提示, 询问是否继续最小生成 (仅 base 模板, 无维度叠加) |
| Workflow 部分 agent 失败 | 标注该维度数据盲区, 其余正常 |
| 多个工具入口同时存在 | 提示用户选择本次生成/更新的工具入口 |
| 已有治理文档但用户未确认处理策略 | 停止写入该文件, 询问合并/覆盖/跳过 |
| API 检测证据较弱 | 标记 LOW confidence, 在维度确认阶段让用户决定是否启用 api |
| API 模板缺失 | 跳过 api 维度并报告缺失模板, 不生成半截 API 红线 |
| 能力检测失败 | 不生成特定 MCP/skill 强制规则, 仅生成通用降级规则 |
| 用户跳过能力确认 | 不写入特定 MCP/skill 规则 |
| 模板文件缺失 | 降级到 skill 内置 fallback 模板 |
| 语言编码规范模板缺失 | 使用 `code-standards/generic.md`; 若 generic 也缺失, 生成最小代码质量规则 |
| 用户中断交互 | 保留分析结果, 下次可续接 |

## 自检清单

- [ ] 参数解析正确 (target-path, --tool)
- [ ] Workflow 返回有效项目画像
- [ ] 已扫描现有治理文档和工具入口
- [ ] 已确认已有文件的合并/覆盖/跳过策略
- [ ] 维度判定正确
- [ ] API 维度证据已展示并由用户确认
- [ ] 能力检测完成, 未检测到的能力未写入强制规则
- [ ] 用户确认的 MCP/skills 条件 block 正确展开
- [ ] 四轮交互完成
- [ ] 模板选择正确
- [ ] 语言专属编码规范模板选择正确
- [ ] 占位符全部填充, 无残留 `{{ }}`
- [ ] 维度 block 正确展开/删除
- [ ] 已存在文件正确处理
- [ ] 来源标注清晰
- [ ] 未做 git commit
