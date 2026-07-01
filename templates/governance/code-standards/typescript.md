<!-- source: template/code-standards/typescript -->
- **[强制] 类型安全**: 不新增无约束的 `any`; 必须使用时说明边界并尽量收敛到局部.
- **[强制] 异步错误处理**: Promise, async 操作和外部调用必须有错误处理路径; 不留下未处理的 floating promise.
- **[强制] 运行时校验**: 来自网络, 用户输入, 环境变量和持久化存储的数据必须在信任边界做运行时校验.
- **[默认] 模块导出克制**: 公共导出保持稳定; 非公共实现避免从 barrel 文件暴露.
- **[默认] 工具链一致**: 遵循项目既有 TypeScript, ESLint, Prettier, Vitest/Jest/Playwright 配置.
<!-- /source: template/code-standards/typescript -->
