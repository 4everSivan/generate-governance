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

## Phase 2: 第一轮交互 — 维度确认

将项目画像呈现给用户确认:

- 语言、框架、构建系统
- 检测到的数据库/部署/监控特征
- 命中的维度 (code 总是命中; database/deploy/maintenance 条件命中)
- 目标工具入口

使用 AskUserQuestion 提问:

```
header: "维度确认"
question: "检测结果是否准确? 需要增减维度吗?"
options:
  - label: "确认"
    description: "按检测结果继续"
  - label: "修改维度"
    description: "我要增减维度或修正检测结果"
```

若用户选择 "修改维度", 通过文本收集修正信息, 更新维度列表.

## Phase 3: 第二轮交互 — 领域红线收集

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
| dim-deploy | 部署 | 禁止绕过 CI 部署生产; 金丝雀发布强制等待 5 分钟 |
| dim-maintenance | 运维 | 禁止无告警变更; 变更窗口 02:00-06:00 |
| dim-code | 代码质量 | 禁止跳过 review 合并主干; 覆盖率不得低于 80% |

通用基线红线 (不伪造事实, 基于证据表达, 最小权限等) 自动填充, 不询问.

## Phase 4: 模板填充与生成

### 4.1 模板选择

根据命中的维度, 读取对应模板文件:

- `templates/governance/constitution/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/agents/base.md` + 每个命中维度的 `dim-{dimension}.md`
- `templates/governance/tool-entry/{tool}.md`

模板路径: 优先查找项目 `templates/governance/`, 其次 skill 内置 `templates/governance/`.

### 4.2 模板填充

将以下变量替换到模板占位符中:

| 占位符 | 来源 | 示例值 |
|--------|------|--------|
| `{{PROJECT_NAME}}` | 项目画像 | `my-go-service` |
| `{{DATE}}` | 当前日期 | `2026-06-18` |
| `{{VERSION}}` | 默认 `1.0` | `1.0` |
| `{{SCOPE}}` | 项目画像 | `Go, Gin, PostgreSQL, Kubernetes` |
| `{{DOMAIN}}` | 项目画像推断 | `后端服务` |
| `{{ROLE}}` | 项目画像推断 | `精通 Go 的架构师` |
| `{{PRIORITIES}}` | 项目画像 + 维度 | `数据安全 > 服务可用性 > 可恢复性 > 证据可信度` |
| `{{#dim-database}}...{{/dim-database}}` | 条件 block: 维度命中时展开内容 |
| `{{#has_db}}...{{/has_db}}` | 条件 inline: 维度命中时展开 |
| `{{USER_REDLINES_DATABASE}}` | 用户输入 | 用户输入的逐条红线 |
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
| `{{CI_PIPELINE}}` | profile (配置检测) | CI/CD 描述 |
| `{{LOG_LOCATIONS}}` | profile (运维检测) | 日志位置 |
| `{{MONITORING_TOOLS}}` | profile (运维检测) | 监控工具 |
| `{{ALERT_CONFIGS}}` | profile (运维检测) | 告警配置 |
| `{{SKILLS_INDEX}}` | profile (skills 扫描) | 技能索引列表 |

**条件 block 语法:**
- `{{#dim-database}}...{{/dim-database}}` — 命中 database 维度时展开 block 内容
- `{{#dim-deploy}}...{{/dim-deploy}}` — 命中 deploy 维度时展开 block 内容
- `{{#dim-maintenance}}...{{/dim-maintenance}}` — 命中 maintenance 维度时展开 block 内容
- `{{#has_db}}...{{/has_db}}` — 命中 database 维度时展开 inline 内容 (用于角色描述中的子句)
- `{{#has_deploy}}...{{/has_deploy}}` — 命中 deploy 维度时展开 inline 内容
- `{{#has_maintenance}}...{{/has_maintenance}}` — 命中 maintenance 维度时展开 inline 内容

维度 block 展开逻辑: 命中维度时保留 block 内容并去掉 `{{#dim-*}}` / `{{/dim-*}}` 标签; 未命中时整块删除. 条件 inline (`{{#has_*}}`) 同理.

### 4.3 写入输出文件

将填充后的内容写入 target-path 下的三个文件:

```
<target-path>/constitution.md
<target-path>/AGENTS.md
<target-path>/{TOOL}.md
```

已存在文件处理:
1. 若存在, 使用 AskUserQuestion 询问: 覆盖 (备份到 `.governance-backup/`) / 合并 / 跳过
2. 覆盖模式: 备份旧文件, 写入新文件
3. 合并模式: 保留旧文件中 `<!-- user-custom -->...<!-- /user-custom -->` 标记的内容, 其余更新
4. 跳过: 不写入

### 4.4 来源标注

每个生成文件的 section 末尾添加 HTML 注释标注填充来源:

```markdown
<!-- source: template/base -->
<!-- source: scan/code-structure, confidence: HIGH -->
<!-- source: infer, confidence: MEDIUM -->
<!-- source: user-input -->
```

## Phase 5: 完成摘要

展示生成结果:

```
治理文档生成完成:

✅ constitution.md — 4 个维度, 12 条红线
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
| 模板文件缺失 | 降级到 skill 内置 fallback 模板 |
| 用户中断交互 | 保留分析结果, 下次可续接 |

## 自检清单

- [ ] 参数解析正确 (target-path, --tool)
- [ ] Workflow 返回有效项目画像
- [ ] 维度判定正确
- [ ] 两轮交互完成
- [ ] 模板选择正确
- [ ] 占位符全部填充, 无残留 `{{ }}`
- [ ] 维度 block 正确展开/删除
- [ ] 已存在文件正确处理
- [ ] 来源标注清晰
- [ ] 未做 git commit
