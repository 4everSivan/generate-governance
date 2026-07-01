<!-- source: template/code-standards/go -->
- **[强制] 格式化**: Go 代码必须通过 `gofmt` 或项目既有格式化命令.
- **[强制] 错误处理显式**: 不吞掉 `error`; 包装错误时保留上下文, 需要上层判断时使用 `errors.Is` / `errors.As` 兼容的方式.
- **[强制] Context 传递**: I/O, RPC, 数据库和长耗时操作应接收并传递 `context.Context`, 不在库层自行创建不可取消的后台上下文.
- **[默认] 接口克制**: 只在调用方需要抽象时定义接口; 避免为了单一实现提前抽象.
- **[默认] 并发可退出**: goroutine 必须有明确退出路径; channel 关闭责任应清晰, 避免泄漏.
<!-- /source: template/code-standards/go -->
