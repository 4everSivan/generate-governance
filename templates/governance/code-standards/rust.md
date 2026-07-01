<!-- source: template/code-standards/rust -->
- **[强制] 错误类型清晰**: 公共边界使用明确错误类型; 不在库代码中 `unwrap` / `expect`, 除非能证明不可达并说明原因.
- **[强制] 所有权优先**: 优先用所有权和借用表达生命周期; 避免不必要的 clone 和全局可变状态.
- **[强制] 并发安全**: 跨线程共享状态必须通过类型系统表达同步语义, 不绕过 `Send` / `Sync` 约束.
- **[默认] 格式与 lint**: 通过 `cargo fmt` 和项目既有 `cargo clippy` 规则.
- **[默认] 特性门控**: 新增 feature flag 时说明默认行为, 组合关系和兼容性影响.
<!-- /source: template/code-standards/rust -->
