# Kimi Code CLI 双入口支持设计

**状态**: 已获设计批准，待实现计划

**日期**: 2026-07-17

## 1. 目标与范围

`generate-governance` 增加 Kimi Code CLI 作为一等工具目标。用户可通过 `--tool kimi` 显式选择，也可由已有 Kimi 入口自动检测。选择 Kimi 时，在现有治理三件套之外增加 Kimi 原生桥接入口，最终生成：

```text
constitution.md
AGENTS.md
KIMI.md
.kimi-code/AGENTS.md
```

`KIMI.md` 的治理层级、章节结构和完整程度与现有 `CLAUDE.md` 一致，但专属能力必须使用 Kimi Code CLI 的原生概念和行为。`.kimi-code/AGENTS.md` 只负责让 Kimi 原生加载完整治理入口，不复制项目事实或专属规则。

本次变更不接入 Moonshot API，不增加模型或供应商配置，不修改项目画像，不修改 `workflow-analyze.js`，也不引入独立文档生成器、合并引擎或运行时渲染器。

## 2. 设计依据与原则

Kimi Code CLI 原生使用 `AGENTS.md` 作为项目指令文件，并允许项目级指令位于项目树内，例如根目录 `AGENTS.md` 或 `.kimi-code/AGENTS.md`。它提供 `coder`、`explore` 和 `plan` 子 Agent，并支持 MCP、Agent Skills、权限确认和免确认运行模式。

设计遵循以下原则：

- **与现有分层一致**：安全红线属于 `constitution.md`，共享项目事实属于根 `AGENTS.md`，Kimi 专属行为属于 `KIMI.md`。
- **原生可达**：使用 `.kimi-code/AGENTS.md` 连接 Kimi 原生指令加载与完整的 `KIMI.md`。
- **单一事实来源**：桥接文件不复制根治理文档内容，避免两份规则漂移。
- **保守更新**：两个 Kimi 文件都必须沿用 merge / overwrite / skip 保护，且逐文件确认。
- **向后兼容**：Kimi 追加到现有检测顺序末尾，不改变旧项目的默认工具或选择结果。
- **能力真实**：Kimi 专属模板只描述官方支持的能力，不照搬 Claude 的产品术语。

参考资料：

- [Kimi Code CLI：Agents and Sub-Agents](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents)，访问日期 2026-07-17。
- [Kimi Code CLI：Built-in Tools](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/tools.html)，访问日期 2026-07-17。
- [Kimi Code CLI：Interaction and input](https://www.kimi.com/help/kimi-code/cli-interaction)，访问日期 2026-07-17。

## 3. 文件职责与模板

### 3.1 共享治理文件

- `constitution.md` 继续定义最高优先级安全红线。
- 根目录 `AGENTS.md` 继续定义跨工具共享的项目事实、脚本、目录、协作规则和已确认环境能力。Kimi 可以原生读取该文件。

Kimi 支持不得改变这两个文件的既有职责，也不得在 Kimi 模板中复制它们的规则正文。

### 3.2 完整 Kimi 入口

新增 `templates/governance/tool-entry/kimi.md`，生成根目录 `KIMI.md`。模板沿用其他完整工具入口的四段结构：

1. 启动与上下文管理；
2. Kimi 专属能力；
3. 已确认环境能力；
4. Skill 索引。

专属能力规则至少覆盖：

- `explore` 用于只读搜索、阅读、调用链整理和代码库梳理；
- `plan` 用于设计和实施计划，不执行修改；
- `coder` 用于边界明确的实现任务，委派时声明目标、输出、允许读写范围和禁止事项；
- 子 Agent 上下文隔离，不能假设其继承主会话未显式传递的信息；
- MCP 与 Skills 仅以根 `AGENTS.md` 中检测到且经用户确认的能力为准；
- 权限确认或免确认运行模式不能绕过 `constitution.md` 的生产操作和高风险变更红线；
- 长任务使用独立会话，压缩上下文时保留约束、关键证据、未决事项和验证状态。

模板继续使用 `{{CAPABILITIES_SUMMARY}}` 与 `{{SKILLS_INDEX}}`，并带来源注释。

### 3.3 Kimi 原生桥接入口

新增 `templates/governance/tool-entry/kimi-native-agents.md`，生成 `.kimi-code/AGENTS.md`。该文件只承担以下职责：

- 要求 Kimi 在开始项目任务前读取并遵守 `../constitution.md`、`../AGENTS.md` 和 `../KIMI.md`；
- 说明根 `AGENTS.md` 保存共享事实，`KIMI.md` 保存 Kimi 专属行为；
- 遵循既有治理优先级，不重新定义或复制规则；
- 带来源注释，支持与其他生成文件相同的审查方式。

桥接模板不得复制 `KIMI.md` 的能力段或根 `AGENTS.md` 的项目事实，也不使用未经官方说明的 Markdown 导入语法。

## 4. 参数、检测与选择

`$ARGUMENTS` 的工具枚举扩展为：

```text
--tool claude|gemini|codex|kiro|kimi
```

自动检测顺序扩展为：

```text
CLAUDE.md → GEMINI.md → CODEX.md → KIRO.md
→ KIMI.md 或 .kimi-code/AGENTS.md → 默认 claude
```

Kimi 检测规则：

- `KIMI.md` 或 `.kimi-code/AGENTS.md` 任一存在，即把 Kimi 作为推荐工具；
- 两者同时存在时只计为一个 Kimi 工具入口，不触发“同一工具重复”提示；
- Kimi 与其他工具入口同时存在时，继续要求用户选择本次生成或更新的工具；
- Kimi 位于 Kiro 之后，以保持旧项目的检测结果不变。

现有治理文档扫描和覆盖保护列表必须同时加入 `KIMI.md` 与 `.kimi-code/AGENTS.md`。

## 5. 生成与更新流程

选择 `tool = kimi` 后的数据流如下：

```text
--tool kimi 或自动检测
        ↓
扫描共享治理文件和两个 Kimi 入口
        ↓
展示 Kimi 作为一个工具、两个受保护文件
        ↓
逐文件确认 merge / overwrite / skip
        ↓
渲染 constitution.md + AGENTS.md
        ↓
渲染 KIMI.md + .kimi-code/AGENTS.md
        ↓
逐文件应用已确认策略
        ↓
完成摘要报告四个文件及待确认项
```

仅当选择 Kimi 时才加载和渲染桥接模板。选择 Claude、Gemini、Codex 或 Kiro 时，仍只生成现有三件套，不创建 `.kimi-code/`。

两个 Kimi 文件的更新策略彼此独立：

- **merge**：保留既有 `<!-- user-custom -->...<!-- /user-custom -->` 区块；区块外存在用户内容时按现有规则警告，不静默丢弃；
- **overwrite**：先分别备份到 `.governance-backup/`，再写入；
- **skip**：保留对应文件，不写入。

Phase 2 必须为每个已存在的 Kimi 文件记录明确策略。没有策略时暂停写入该文件并再次询问。

## 6. 错误处理与降级

| 场景 | 行为 |
| --- | --- |
| 只存在 `KIMI.md` | 识别为 Kimi，建议补充 `.kimi-code/AGENTS.md` |
| 只存在 `.kimi-code/AGENTS.md` | 识别为 Kimi，建议补充完整 `KIMI.md` |
| 两个入口都存在 | 作为一个 Kimi 工具展示，分别确认文件策略 |
| `.kimi-code/` 不存在 | 仅在确认生成 Kimi 后创建目录 |
| `.kimi-code` 是普通文件或目录不可创建 | 不写桥接文件，报告明确错误；不回滚已安全完成的其他文件 |
| 跳过已有桥接文件且它未引用 `KIMI.md` | 完成摘要警告 Kimi 可能不会加载 `KIMI.md` |
| 桥接文件引用的根治理文件缺失或被跳过 | 完成摘要列为待确认项，不宣称入口完整可用 |
| Kimi 模板缺失 | 报告缺失，不用其他工具模板冒充 Kimi |

目录创建和文件写入都发生在用户确认之后。任何已存在 Kimi 文件未经确认都不得覆盖或重写。

## 7. 文件改动范围

| 文件 | 设计变更 |
| --- | --- |
| `SKILL.md` | 支持列表、参数、检测、扫描、保护、模板选择、双入口写入、摘要、错误处理和自检 |
| `templates/governance/tool-entry/kimi.md` | 完整 Kimi 专属入口模板 |
| `templates/governance/tool-entry/kimi-native-agents.md` | Kimi 原生桥接模板 |
| `scripts/check-consistency.mjs` | 支持工具、Kimi 模板、桥接引用和关键文档契约检查 |
| `examples/kimi-entry/` | 单入口、双入口、检测和逐文件策略的可读 fixture |
| `README.md` | 支持工具、目录树、检测顺序、保护文件和使用示例 |
| `docs/review-checklist.md` | Kimi 双入口的保护和职责审查项 |
| `CHANGELOG.md` | 未发布的 Kimi Code CLI 支持说明 |
| `package.json` | 增加 `kimi` 与 `kimi-code` 关键词 |

不修改 `workflow-analyze.js`、`bin/install.js` 或现有项目画像 schema，不增加 npm 依赖，不执行版本发布。

## 8. 验证策略

### 8.1 静态一致性检查

`scripts/check-consistency.mjs` 扩展后必须验证：

- 支持工具集合包含 `claude`、`gemini`、`codex`、`kiro` 和 `kimi`；
- 每个工具都有完整主入口模板；
- `SKILL.md` 的 `--tool` 枚举、自动检测顺序、现有文件保护列表和完成摘要包含 Kimi；
- `kimi.md` 包含 `{{CAPABILITIES_SUMMARY}}` 与 `{{SKILLS_INDEX}}`，且所有占位符已在 `SKILL.md` 声明；
- `kimi-native-agents.md` 引用 `../constitution.md`、`../AGENTS.md` 和 `../KIMI.md`；
- Kimi fixture 包含可读的 `expected.md`。

这些检查保持静态且离线，不在测试时请求 Kimi 官方文档。

### 8.2 Fixture 场景

`examples/kimi-entry/` 至少描述以下可审查契约：

- 仅 `KIMI.md` 存在时推荐 Kimi，并建议补桥接文件；
- 仅 `.kimi-code/AGENTS.md` 存在时推荐 Kimi，并建议补完整入口；
- 两者同时存在时视为一个工具、两个受保护文件；
- Kimi 与 Kiro 同时存在时按既定优先级推荐 Kiro，但要求用户选择；
- 两个 Kimi 文件分别支持 merge / overwrite / skip；
- 未确认策略时不覆盖任何已有入口。

Fixture 是 Agent 行为的人工可审查契约，不宣称替代端到端渲染测试。

### 8.3 执行验证

实现完成后运行：

```text
npm run check
npm test
npm pack --dry-run
```

打包预览必须确认两个 Kimi 模板和 fixture 被包含在 npm 发布内容中。

## 9. 验收标准

1. `--tool kimi` 明确定义四文件输出，且其他工具仍保持三文件输出。
2. `KIMI.md` 与 `CLAUDE.md` 具有相同治理层级和章节职责，但只使用 Kimi 原生能力术语。
3. `KIMI.md` 或 `.kimi-code/AGENTS.md` 任一存在都能推荐 Kimi，两者同时存在只算一个工具入口。
4. 检测顺序为 Claude、Gemini、Codex、Kiro、Kimi、默认 Claude。
5. 两个 Kimi 文件都受独立的 merge / overwrite / skip 和非静默覆盖保护。
6. 原生桥接文件不复制共享事实或 Kimi 专属规则，不产生双份事实来源。
7. Kimi 支持不改变项目画像、分析流程、默认工具或其他工具输出。
8. 静态一致性检查、安装测试和 npm 打包预览全部通过。

## 10. 非目标

- 不支持 Kimi/Moonshot API、模型 ID、供应商或凭据配置；
- 不生成或修改用户级 `$KIMI_CODE_HOME/AGENTS.md`；
- 不把 `KIMI.md` 当作 Kimi 原生自动读取的文件；
- 不把两个 Kimi 入口合并为同一更新策略；
- 不将现有工具迁移到通用工具注册表；
- 不实现独立 CLI 文档生成器、模板渲染器或合并引擎；
- 不发布 npm 新版本。
