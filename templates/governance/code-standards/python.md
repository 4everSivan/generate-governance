<!-- source: template/code-standards/python -->
- **[强制] 类型边界**: 新增公共函数, 服务边界和复杂数据结构应提供类型标注; 数据模型优先使用项目既有 schema/model 机制.
- **[强制] 异常语义清晰**: 不使用裸 `except`; 捕获异常时保留原始上下文, 不把错误静默降级为默认值.
- **[强制] 依赖注入优先**: 外部服务, 文件系统, 时间和随机数等副作用应便于测试替换.
- **[默认] 格式与 lint**: 遵循项目既有 `ruff`, `black`, `mypy`, `pytest` 等工具配置.
- **[默认] 模块边界简洁**: 避免在模块 import 阶段执行网络, 文件写入或重型初始化.
<!-- /source: template/code-standards/python -->
