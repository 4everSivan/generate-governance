# generate-governance

为 AI IDE / CLI 代理自动生成项目治理文档三件套的 Claude Code Skill。

## 功能

分析项目代码库，自动生成以下治理文档：

- **`constitution.md`** — 安全红线、工作模式与合规约束
- **`AGENTS.md`** — 项目事实层：技术栈、架构、目录结构、依赖、脚本
- **`{TOOL}.md`** — 工具入口文件（Claude Code / Gemini / Codex / Kiro）

## 工作流

```
项目代码 → 并行分析 (4 Agents) → 项目画像 → 维度确认 → 环境能力确认 → 维度红线收集 → 模板填充 → 输出三件套
```

### Phase 1: 并行分析

通过 `workflow-analyze.js` 启动 4 个并行 Agent：

| Agent | 分析内容 |
|-------|---------|
| code-structure | 语言、框架、构建系统、入口文件、目录布局、架构模式、编码约定 |
| dependencies | 依赖解析与分类 (db_driver, mq, cache, http, auth…) |
| config | 构建/运行脚本、CI/CD 管线、部署描述符 (Dockerfile, K8s, Terraform) |
| security | 认证机制、敏感数据处理、权限模型、输入校验 |

### Phase 2-4: 交互确认

- 确认检测到的项目画像（语言、框架、维度）
- 检测当前环境可用的 MCP / skills, 由用户确认是否写入生成规范
- 收集用户自定义安全红线（按维度）

### Phase 5: 模板填充

根据命中的治理维度选择模板，填充占位符后输出文档。

环境能力规则采用条件生成: 只有当前环境检测到且用户确认启用的 MCP / skill 才会写入 `AGENTS.md` 和工具入口。未检测到或用户跳过的能力不会生成强制规则。

## 模板结构

```
templates/governance/
├── constitution/          # 安全红线模板
│   ├── base.md            # 通用基线
│   ├── dim-code.md        # 代码质量维度
│   ├── dim-database.md    # 数据库维度
│   ├── dim-deploy.md      # 部署维度
│   └── dim-maintenance.md # 运维维度
├── agents/                # AGENTS.md 模板
│   ├── base.md
│   └── dim-*.md
└── tool-entry/            # 工具入口模板
    ├── claude.md
    ├── gemini.md
    ├── codex.md
    └── kiro.md
```

## 支持的治理维度

| 维度 | 触发条件 | 典型红线 |
|------|---------|---------|
| **code** (始终命中) | 任意项目 | 禁止跳过 review 合并、覆盖率 ≥80% |
| **database** | 检测到 DB 驱动或迁移脚本 | 禁止无备份 DDL、禁止生产 DROP TABLE |
| **deploy** | 检测到 Docker/K8s/Terraform/CI | 禁止绕过 CI 部署、金丝雀发布强制等待 |
| **maintenance** | 检测到监控/告警配置 | 禁止无告警变更、变更窗口限制 |

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
| Skill | `brainstorming` | 复杂/创造性变更前收敛设计 |
| Skill | 文档类 skills | Word/PDF/表格/演示文稿生成与视觉验证 |
| Skill | `pua` | 失败多次后的换路恢复, 仅用户明确确认时生成 |

## 支持的 AI 工具

- **Claude Code** — 生成 `CLAUDE.md`
- **Gemini CLI** — 生成 `GEMINI.md`
- **Codex (OpenAI)** — 生成 `CODEX.md`
- **Kiro** — 生成 `KIRO.md`

工具入口自动检测优先级: `CLAUDE.md` → `GEMINI.md` → `CODEX.md` → `KIRO.md` → 默认 Claude。

## 使用

```bash
# 当前目录，自动检测工具入口
/generate-governance

# 指定目标项目路径
/generate-governance /path/to/project

# 指定目标工具
/generate-governance /path/to/project --tool codex
/generate-governance . --tool gemini
```

## 安装

将本 skill 放入项目的 `.agents/skills/generate-governance/` 目录，或安装为 Claude Code 全局 skill。

## 项目结构

```
generate-governance/
├── skill.md                    # Skill 定义与完整指令
├── workflow-analyze.js         # Workflow 脚本：并行分析 + 项目画像合成
├── templates/governance/       # 治理文档模板
└── README.md
```

## 技术说明

`workflow-analyze.js` 使用 Claude Code 的 Workflow API，以结构化 JSON Schema 约束每个分析 Agent 的输出，确保结果可机器处理。分析结果合并后生成 `ProjectProfile`，驱动模板填充。

## License

MIT
