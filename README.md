# Langfuse Tracing Plugin for WorkBuddy

将 WorkBuddy 会话中的用户轮次、模型调用、工具调用、Token 用量和子代理上传到
[Langfuse](https://langfuse.com)，便于调试、评估和成本分析。

本项目参考并适配了 Langfuse 的
[`codex-observability-plugin`](https://github.com/langfuse/codex-observability-plugin)。核心差异是：
WorkBuddy 使用 `.codebuddy-plugin`、`CODEBUDDY_PLUGIN_ROOT`，并产生自己的
`message/reasoning/function_call/function_call_result` transcript 格式，因此解析器不是 Codex
版本的简单改名。

## 采集内容

- 每个用户轮次对应一个 `WorkBuddy Turn` trace。
- 每次模型响应对应一个 `LLM` generation，包含模型名、推理、回复、工具请求和 Token 用量。
- 每次工具执行对应一个 tool observation，包含参数、输出、错误状态和耗时。
- `Agent` 工具创建的 `subagents/agent-*.jsonl` 会嵌套为 `WorkBuddy Subagent Turn`。
- 同一 WorkBuddy session 的轮次通过 Langfuse session id 聚合。

## 前置条件

- WorkBuddy 5.3.14 / CodeBuddy CLI 2.115.0 或兼容版本
- Node.js 22+
- Langfuse Cloud 或自托管实例的 public/secret API key

## 本地安装

克隆仓库并进入项目目录：

```bash
git clone https://github.com/ai-native-thinking/workbuddy-observability-plugin.git
cd workbuddy-observability-plugin
```

WorkBuddy 自带的 CLI 位于：

```bash
CODEBUDDY="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy"
```

桌面版 WorkBuddy 从 `~/.workbuddy` 读取配置；但其内置的 CodeBuddy CLI 默认使用
`~/.codebuddy`。安装插件前必须同时指定下面两个配置目录变量，否则 CLI 虽然可能提示安装成功，
桌面版 WorkBuddy 实际上不会加载该插件：

```bash
export CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy"
export WORKBUDDY_CONFIG_DIR="$HOME/.workbuddy"
```

添加当前目录为本地 marketplace，并安装、启用插件：

```bash
"$CODEBUDDY" plugin marketplace add "$PWD"
"$CODEBUDDY" plugin install tracing@workbuddy-observability-plugin
"$CODEBUDDY" plugin enable tracing@workbuddy-observability-plugin
```

确认插件已经安装到 WorkBuddy 的配置目录：

```bash
"$CODEBUDDY" plugin list
```

输出中应包含 `tracing@workbuddy-observability-plugin`，且状态为启用。然后完全退出并重新启动
WorkBuddy；若出现 hook 安全审查，请检查 `Stop` hook 后选择信任。

完成一次新的 WorkBuddy 对话后，可以检查是否生成去重 sidecar，以确认 hook 已经执行：

```bash
find "$HOME/.workbuddy/projects" -name '*.langfuse-workbuddy' -print
```

如果找不到 sidecar，请首先确认当前终端仍设置了 `CODEBUDDY_CONFIG_DIR` 和
`WORKBUDDY_CONFIG_DIR`，再运行 `plugin list` 检查插件状态。

## 禁用与卸载

以下命令必须使用与安装时相同的 WorkBuddy 配置目录。如果打开了新的终端，请先重新设置：

```bash
CODEBUDDY="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy"
export CODEBUDDY_CONFIG_DIR="$HOME/.workbuddy"
export WORKBUDDY_CONFIG_DIR="$HOME/.workbuddy"
```

临时停止采集，但保留插件及其配置：

```bash
"$CODEBUDDY" plugin disable tracing@workbuddy-observability-plugin
```

需要恢复时重新启用：

```bash
"$CODEBUDDY" plugin enable tracing@workbuddy-observability-plugin
```

彻底卸载插件：

```bash
"$CODEBUDDY" plugin uninstall tracing@workbuddy-observability-plugin
```

如果不再需要通过当前源码目录安装插件，还可以移除本地 marketplace：

```bash
"$CODEBUDDY" plugin marketplace remove workbuddy-observability-plugin
```

执行禁用、重新启用或卸载后，请完全退出并重新启动 WorkBuddy。卸载插件不会删除
`~/.workbuddy/langfuse.json`，也不会删除已经生成的 `*.langfuse-workbuddy` sidecar 文件。

## 配置

默认不上传任何数据。推荐创建 `~/.workbuddy/langfuse.json`：

```json
{
  "enabled": true,
  "public_key": "pk-lf-...",
  "secret_key": "sk-lf-...",
  "base_url": "https://cloud.langfuse.com",
  "environment": "development",
  "tags": ["workbuddy"]
}
```

也可以在项目下创建 `<project>/.workbuddy/langfuse.json`。优先级为：默认值 → 全局配置 →
项目配置 → 环境变量。

| 环境变量                           | 说明                                             |
| ---------------------------------- | ------------------------------------------------ |
| `TRACE_WORKBUDDY_TO_LANGFUSE`      | 设为 `true` 开启上传；也兼容 `TRACE_TO_LANGFUSE` |
| `LANGFUSE_WORKBUDDY_PUBLIC_KEY`    | Public key；回退到 `LANGFUSE_PUBLIC_KEY`         |
| `LANGFUSE_WORKBUDDY_SECRET_KEY`    | Secret key；回退到 `LANGFUSE_SECRET_KEY`         |
| `LANGFUSE_WORKBUDDY_BASE_URL`      | Langfuse 地址；回退到 `LANGFUSE_BASE_URL`        |
| `LANGFUSE_WORKBUDDY_ENVIRONMENT`   | Environment 标签                                 |
| `LANGFUSE_WORKBUDDY_USER_ID`       | 附加到 trace 的用户 id                           |
| `LANGFUSE_WORKBUDDY_TAGS`          | JSON 数组或逗号分隔标签                          |
| `LANGFUSE_WORKBUDDY_METADATA`      | JSON 对象形式的 trace metadata                   |
| `LANGFUSE_WORKBUDDY_TRACE_SEED`    | 用于生成可预测 trace id 的 seed                  |
| `LANGFUSE_WORKBUDDY_MAX_CHARS`     | 单个输入/输出最大字符数，默认 `20000`            |
| `LANGFUSE_WORKBUDDY_DEBUG`         | 将调试日志写入 stderr                            |
| `LANGFUSE_WORKBUDDY_FAIL_ON_ERROR` | 测试时让上传错误导致 hook 失败；默认 fail-open   |

## 数据与隐私

开启后会上传用户提示、模型回复、推理文本、工具参数与输出、模型元数据和 Token 用量。
不要在不应离开本机的敏感会话中开启。插件会在 transcript 旁写入
`<transcript>.langfuse-workbuddy` 去重 sidecar；不会修改 transcript 本身。

## 开发

```bash
pnpm install
pnpm test
pnpm run lint
```

`plugins/tracing/dist/index.mjs` 是包含全部运行时依赖的单文件 bundle，WorkBuddy 加载插件时
不需要执行安装步骤。

## License

MIT。适配实现基于 Langfuse GmbH 的 MIT 许可参考项目。
