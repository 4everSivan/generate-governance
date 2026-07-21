# Changelog

## [Unreleased]

### Fixed

- active workflow 不再绕过规模路由: 大型任务仍处于 direct 或 Superpowers 且没有显式新目标时返回 `reject-workflow-mismatch`, 强制停止并重新分类。
- 能力映射重复检测比较完整的规范 ID/kind/token/group 声明; 相同检测名即使复用同一 token 也不再静默覆盖, 同一规范 ID 的 group 冲突也会失败。
- 畸形 CapabilityProfile fail-closed: `detected` 中的非对象条目返回 `invalid_capability_profile`, 不再静默跳过。
- Superpowers 完整性 fail-closed: `using-superpowers` 必须显式提供 `resolved_members`, 未提供视为全部成员不可解析 (`complete = false`); 未知 Superpowers `detection_basis` 返回 `invalid_detection_basis`, 不再落入通用分支。
- 路由 fail-closed 扩展: 未知 `active_workflow`/`previous_workflow` 与未知显式请求一样被拒绝 (`reject-unknown-workflow`), 不再静默降级为 direct。
- CapabilityProfile 契约补齐: 规范化输出包含 `id`/`kind`/`detection_basis`/`template_condition` 字段。
- 能力映射单一事实源: SKILL.md 映射表增加规范 ID 与 kind 列, 运行时映射 (`tokenForCapability`/`kindForCapability`/`groupForCapability`) 由该表生成, 删除 `capability-map.mjs` 硬编码 `capabilityMeta`; 一致性检查新增 kind 合法性与重复 ID 冲突校验。
- 文件策略 fixture 拆分: `existing_file_strategies` (merge/overwrite/skip) 与 `missing_file_strategies` (create) 分开声明, create 不再混入已有受保护文件的策略集。
- 修正 skill-routing fixture 文档矛盾: 显式请求工作流不等同于能力确认, 仍须满足 `capabilities.*.confirmed` (Superpowers 还需 `complete`)。
- 单方能力不再点名未确认的另一方: Superpowers/OpenSpec 单方条件块删除对另一方的引用, 互斥交叉引用仅在 `has_workflow_superpowers_and_openspec` 组合条件下生成一条 AGENTS 引用; 增加双向负向组合断言。
- 收紧 Superpowers 完整性: `suite_metadata` 必须显式声明 `metadata_complete: true`; `using-superpowers` 路径由 `referenced_members`/`resolved_members` 差集计算缺失项, 不信任调用方填写的 `missing_members`; 校验 `CapabilityProfile` 必填字段 (`kind`/`detection_basis`) 与合法 kind, 未知 id/字段/类型 fail-closed。
- 恢复 Semble-first: Phase 1-D 先检测 `semble` MCP, 可用时优先语义检索, 不可用才降级到 Grep/Glob/Read; `allowed-tools` 纳入 `mcp__semble__search`/`mcp__semble__find_related`。
- 路由 fail-closed: 未知 workflow 名与未知 OpenSpec 状态被拒绝而非静默落到 direct/start-openspec; OpenSpec 未确认返回 `report-openspec-unavailable` (修正原错误返回 `report-superpowers-unavailable`); 新增 `reject-unknown-workflow`/`reject-invalid-state`。
- 能力映射收敛: 检查器与 eval 共用 `capability-map.mjs` 解析 SKILL.md 映射表, 删除 eval 硬编码 `capabilityTokenMap`; 解析先收集原始行检测重复声明再构建 Map。
- 文件策略契约: 从 SKILL.md 解析 merge/overwrite/skip/create 而非硬编码常量; 逐文件确认门校验。

### Changed

- 模板组合测试同时渲染 AGENTS 与 constitution 维度模板; 未知或重复维度直接失败。
- `normalizeCapabilityProfile` 输出 `members`/`missing_members` 为计算结果, profile 字段进入规范化输出。

### Added

- 新增 `scripts/capability-map.mjs` 共享解析器 (`parseCapabilityMappings`/`parseFileStrategies`/`tokenForCapability`/`kindForCapability`/`groupForCapability`)。
- 新增 `checkSembleFirstContract` 一致性检查。
- 新增路由 fixture: openspec-not-confirmed、unknown-workflow、unknown-active-workflow、invalid-openspec-state、large-active-direct、large-active-superpowers。
- 新增模板组合 fixture: unknown-dimension、duplicate-dimension。
- 新增能力 profile fixture: metadata-without-explicit-complete、using-without-resolved-members、untrusted-missing-members-ignored、missing-required-field、invalid-kind、invalid-detection-basis、malformed-profile-entry。

### Earlier in this unreleased cycle

- 修正生成模板的指令层级: 平台, 系统, 开发者和工具强制安全指令始终高于项目级 `constitution.md`.
- 补齐 `ProjectProfile` 的构建、入口、架构、部署与运维字段, 并校验模板变量来源.
- 规则分层收敛: 删除 AGENTS Headroom 块重复的 `constitution` 证据红线副本; Superpowers/OpenSpec 互斥正文只在 `constitution.md` 出现一次, 且仅在两者均确认时经 `{{#has_workflow_superpowers_and_openspec}}` 条件生成, 不在单方确认时点名另一方; AGENTS 工作流块只引用 `constitution` 红线, 不复制正文。
- 收紧 OpenSpec 降级规则: 用户拒绝安装或初始化且任务范围不变时只能取消或延期, 缩小范围必须重新分类; 不得保持大型任务范围改走 Superpowers 或 direct。
- 删除死文档与悬空 token: 移除 `{{SKILLS_INDEX}}`、`capability_scan.skills`、`{{TOOL_NAME}}`、`{{DIM_INDEX}}` 与从未使用的 `{{#dim-*}}` 条件块说明。
- 修正 `eval-fixtures.mjs` 针对模块常量的恒真式策略断言, 改为逐文件确认与策略声明校验, 不再虚假保证端到端合并。

### Changed

- 将项目画像, 文件策略, 工具入口, 维度, 环境能力与自定义红线合并为一次建议设置确认; 仅在必选字段未决时追加提问.
- 将共享能力摘要收敛到 `AGENTS.md` 的已确认环境能力章节, `{{CAPABILITIES_SUMMARY}}` 只列名称、确认状态与检测依据; 删除独立 Skill 索引与重复确认文案。
- 将 workflow capabilities 按场景分流: 小型任务默认直接处理, 诊断型 bug 与中型任务使用 Superpowers, 大型任务使用 OpenSpec; Superpowers 与 OpenSpec 互斥 (两者均确认时生成 constitution 红线)。
- 重排 AGENTS 结构: 新增 `## 8. 治理维度事实` (`{{DIMENSION_SECTIONS}}` 按固定顺序 code/database/api/deploy/maintenance 插入已确认维度), `## 9. 已确认环境能力`, `## 10. 已确认工作流策略`; 维度 H3 不再落入能力子节。
- 将路由判断拆成显式状态迁移: `classifyTask`、`validateRequestedWorkflow`、`validateWorkflowAvailability`、`resolveWorkflowTransition` 与 `classifySkillRoute` 编排; OpenSpec 状态用 `not-installed`/`not-initialized`/`ready`/`declined` 枚举; `active_workflow` 替换 grill-me 特判的 `previous_workflow`。

### Added

- 新增能力规范化映射表 (`CapabilityProfile`): 检测名/别名、能力 ID、模板条件 token、`detected`/`confirmed`/`complete` 独立条件; `checkCapabilityMappings` 校验映射完整性与消费。
- 新增 Superpowers 完整性判定与 fixture: suite/plugin 元数据优先, 缺失元数据时 `using-superpowers` 成员全部可解析; 任一缺失则 suite 不完整; 仅 `brainstorming` 不构成完整 suite。
- 新增 7 组 fixture (共 45 个场景) 的 `expected.json` 与离线 evaluator, 覆盖证据分类、维度、文件保护、工具入口、能力规范化、workflow 路由状态迁移与模板组合契约。
- 新增 `scripts/template-contract.mjs` 只读内存模板组合校验帮助器与 `template-composition-cases` fixture。
- 新增 `grill-me` 任务级确认规则及 workflow 路由离线场景契约 (含双向迁移、降级重分类、拒绝安装/初始化)。
- 新增 `agents/dim-api.md` auth 事实边界: 未检测到认证入口表示状态未知, 不表示内部接口或无需认证。

## [0.3.0] - 2026-07-17

### Added

- 新增 Kimi Code CLI 双入口支持: `KIMI.md` 保存完整工具专属规则, `.kimi-code/AGENTS.md` 提供原生桥接入口。
- 新增 Kimi 入口自动检测与逐文件 merge/overwrite/skip 保护; 任一入口可识别 Kimi, 两者同时存在只计为一个工具。
- 新增 Kimi 模板、静态一致性契约和多入口 fixture。
- 新增 Codex 运行时环境检测与文本交互降级路径（Phases 2-4）。

### Changed

- 重构代码标准，深化了 go/java/python/rust/typescript 等语言模板的分类治理规则。
- 根据 Codex/Claude Code 规范，将 `skill.md` 重命名为 `SKILL.md`。
- 在 `package.json` 中补充 repository/homepage/author/bugs 等 npm 发布元数据。

### Fixed

- 修复了关于安装路径、内部 API、安装范围以及版本的 Review 缺陷。

## [0.2.0] - 2026-07-02

### Added

- 新增 `api` 治理维度: 自动检测 API 框架、路由、契约文件、认证入口与 API 测试线索, 经用户确认后启用, 面向生产 API 安全与契约兼容.
- 新增 `templates/governance/constitution/dim-api.md` 与 `agents/dim-api.md` 模板, 覆盖未审计暴露面、响应泄密、破坏性变更、不安全重试与契约漂移等红线.
- `workflow-analyze.js` 扩展为 5 个并行 Agent (新增 `api` 分析), 产出 `api_summary` 与 API 检测置信度.
- 新增治理一致性检查脚本 `scripts/check-consistency.mjs` 与 `examples/` fixture, 用于校验模板占位符、维度模板、API confidence 枚举与示例完整性.

### Changed

- 合并现有文档扫描与维度确认为一轮交互 (Phase 2+3), 交互轮次从 4 轮减到 3 轮, 不改变生成内容; 后续 Phase 顺延重编号.
- 五个维度模板章节号改用动态 `{{DIM_INDEX}}`, 消除多维度同启时的 `3.X/3.Y/3.Z` 编号撞车.
- 明确 `constitution.md` 仅为项目级最高规则, 不得覆盖平台, 系统, 开发者或工具强制安全指令.
- `SUMMARIZE_PROMPT` 补全内部 API (无敏感数据) 第三种优先级分支 `接口契约稳定性`.
- `api_summary` 列入 `SUMMARIZE_SCHEMA` 必填字段; `confidence.api` 枚举补 `UNKNOWN`, 与 `API_SCHEMA`、`api_summary` 三处一致.

### Fixed

- 修复 `agents/base.md` 的项目治理层级表述, 区分平台/系统指令与项目级规则.
- 修复 `skill.md` `{{PRIORITIES}}` 示例对 api+database 项目漏掉 API 安全优先级.
- 修复 `{{HAS_IAC}}` 占位符无来源问题, 替换为映射 `config.deployment.has_terraform` 的 `{{HAS_TERRAFORM}}`.
- 补全 `skill.md` 未文档化的 `{{USER_REDLINES_CODE/DEPLOY/MAINTENANCE}}` 占位符.
- 对齐 `dim-api.md` 契约漂移裁决: 不预设契约源或项目事实任一方胜出, 由用户确认修正方向.
- 修复 `checkApiConfidenceEnums` 枚举锚点过宽问题: 原检查命中 `CODE_STRUCTURE_SCHEMA.confidence` 仅凭巧合通过, 现改为按 schema block 精确切片.
- `package.json` `files` 纳入 `examples/`, 使发布包内 `npm run check` 可用 (原先 tarball 缺 fixture 会失败).

---

## [0.1.0] - 2026-07-01

### Added

- 首次发布 `generate-governance` skill, 可分析目标项目并生成 `constitution.md`, `AGENTS.md` 和工具入口文档.
- 提供治理模板体系, 覆盖代码质量, 数据库, 部署和运维维度.
- 增加环境能力确认机制, 仅在检测到并经用户确认后生成 MCP / skills 相关规则.
- 提供 npm CLI 安装器 `generate-governance-skill`, 支持安装到用户级 skills 目录, Codex skills 目录或指定项目目录.

### Changed

- README 增加项目概览, 使用方式, npm / npx 安装说明和可选环境能力规则说明.
