# Changelog

## [Unreleased]

### Added

- 新增 Kimi Code CLI 双入口支持: `KIMI.md` 保存完整工具专属规则, `.kimi-code/AGENTS.md` 提供原生桥接入口.
- 新增 Kimi 入口自动检测与逐文件 merge/overwrite/skip 保护; 任一入口可识别 Kimi, 两者同时存在只计为一个工具.
- 新增 Kimi 模板、静态一致性契约和多入口 fixture.

## [0.2.0] - 2026-07-02

### Added

- 新增 `api` 治理维度: 自动检测 API 框架、路由、契约文件、认证入口与 API 测试线索, 经用户确认后启用, 面向生产 API 安全与契约兼容.
- 新增 `templates/governance/constitution/dim-api.md` 与 `agents/dim-api.md` 模板, 覆盖未审计暴露面、响应泄密、破坏性变更、不安全重试与契约漂移等红线.
- `workflow-analyze.js` 扩展为 5 个并行 Agent (新增 `api` 分析), 产出 `api_summary` 与 API 检测置信度.
- 新增治理一致性检查脚本 `scripts/check-consistency.mjs` 与 `examples/` fixture, 用于校验模板占位符、维度模板、API confidence 枚举与示例完整性.

### Changed

- 合并现有文档扫描与维度确认为一轮交互 (Phase 2+3), 交互轮次从 4 轮减到 3 轮, 不改变生成内容; 后续 Phase 顺延重编号.
- 五个维度模板章节号改用动态 `{{DIM_INDEX}}`, 消除多维度同启时的 `3.X/3.Y/3.Z` 编号撞车.
- 优先级层级修正为 `constitution.md` 红线高于工具系统指令, 与 `base.md` 声明一致.
- `SUMMARIZE_PROMPT` 补全内部 API (无敏感数据) 第三种优先级分支 `接口契约稳定性`.
- `api_summary` 列入 `SUMMARIZE_SCHEMA` 必填字段; `confidence.api` 枚举补 `UNKNOWN`, 与 `API_SCHEMA`、`api_summary` 三处一致.

### Fixed

- 修复 `agents/base.md` 优先级层级自相矛盾 (工具系统指令曾排在 constitution 之上).
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
