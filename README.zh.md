# DSH Verification Receipt

[English](README.md)

[![CI](https://github.com/030611/dsh-verification-receipt/actions/workflows/ci.yml/badge.svg)](https://github.com/030611/dsh-verification-receipt/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-verification-receipt)](https://www.npmjs.com/package/dsh-verification-receipt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![featured on dsh-suite](https://img.shields.io/badge/featured%20on-dsh--suite-4d6bfe)](https://whyihaveyou.github.io/dsh-suite/)

![DSH Verification Receipt 社交预览图](docs/social-preview.jpg)

> 回答一个范围更小、可以检查的问题：这一轮中，DSH 记录了哪些形似验证操作的执行信号？

```sh
dsh plugin --profile web add dsh-verification-receipt
```

Receipt 汇总已记录的工具计数与词法层面的形似验证信号；它**不能**证明测试确实运行，也不能证明代码正确。

> 由社区维护，并非 DeepSeek 官方项目。相关 trust-layer 插件：[Telemetry Redactor](https://github.com/030611/dsh-telemetry-redactor)、[Evidence Audit](https://github.com/030611/qiushi-dsh-evidence-audit) 与 [Context Provenance](https://github.com/030611/dsh-context-provenance)。

DSH Verification Receipt 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的小型、被动式 Profile Bundle。每次耐久的 `turn/end` 到达后，它会向本地 JSONL 文件追加一条隐私最小化、启发式执行摘要。

![Verification Receipt 数据流](https://raw.githubusercontent.com/030611/dsh-verification-receipt/main/docs/verification-flow.svg)

它记录执行痕迹，不证明语义正确。凭证只能说明 DSH 记录了工具调用，并且词法启发式发现了可能的验证信号；它永远不能证明“测试已运行”，也不能说明正确命令得到执行、断言充分、输出真实或助手结论正确。

它有意不做 evidence-audit 账本：各行保持独立，不引入哈希链、产物捕获、claim-evidence 关联或协议证明。

## 兼容性证据

本包以 DeepSeek Harness 提交 `47f943859bef60e4160492346772ded9b24f765a` 为审计基线；该提交的 manifest 声明 `@deepseek-ai/dsh-session` `0.1.0-rc.5`、Cordis `4.0.1` 和 Schemastery `3.18.1`。peer 范围从这些版本开始，在 `dsh-session` 稳定版 `0.1.0` 或 Cordis/Schemastery 下一个 semver 主版本之前结束。发布检查也覆盖当前可安装的 `dsh-session` `0.1.0-rc.6`。范围内但未在此点名的版本只是兼容预期，不是实测证据。Cordis 和 Session 由 DSH 宿主提供，因此标为 optional peer；Schemastery 既以精确版本作为运行时依赖，也声明为兼容性 peer。

## 安装

把已发布的包加入需要生成凭证的每个 profile：

```sh
dsh plugin --profile web add dsh-verification-receipt
dsh --profile web --dump-config
```

如果其他 profile（例如 `headless`）也需要凭证，请换用对应 profile 名重复第一条命令。本地开发时，克隆本仓库并运行 `pnpm install --frozen-lockfile && pnpm run check`，再把 checkout 路径而不是包名传给 `dsh plugin ... add`。

`package.json` 声明 `dsh.bundle.patch`；`cordis.patch.yml` 插入一个普通观察插件。任何提供核心 Session 服务的 DSH 输出面都可以使用它。

## 输出

下图来自发布版插件处理合成、非用户 DSH 事件后生成的真实 receipt；右侧只展示部分落盘字段。它不是用户会话，也不证明测试运行或通过。

![合成夹具产生的真实 Verification Receipt 输出](docs/receipt-output.png)

默认文件为：

```text
$DSH_HOME/verification-receipts/v1/receipts.jsonl
```

`DSH_HOME` 未设置时，路径解析到 `~/.dsh` 下。可以在 profile 的 `cordis.patch.yml` 中用绝对路径覆盖：

```yaml
- id: verification-receipt
  config:
    outputPath: /absolute/private/path/receipts.jsonl
```

每行格式如下：

```json
{
  "schemaVersion": 1,
  "kind": "dsh-verification-receipt",
  "sessionIdHash": "sha256:…",
  "turn": 3,
  "turnEndSeq": 42,
  "endedAt": 1786630000000,
  "outcome": "completed",
  "tools": {
    "calls": 4,
    "succeeded": 3,
    "failed": 1,
    "unresolved": 0,
    "topLevel": 2,
    "nested": 2
  },
  "verificationSignals": [
    {
      "source": "command",
      "category": "test",
      "status": "failed"
    }
  ],
  "claim": "execution-trace-only",
  "receiptHash": "sha256:…"
}
```

### 完整性警告

两个 hash 都没有密钥，均可重算。`receiptHash` 是对其前面全部凭证字段按输出顺序计算的 SHA-256；能编辑一行的人也能重新计算它。独立行无法暴露删除、插入、重排、截断、回滚或替换。它不是签名、可信时间戳、哈希链、承诺或防篡改日志。

## 隐私与 Agent 行为

![Receipt 保留与排除字段边界](docs/privacy-boundary.png)

落盘凭证不包含：

- 工具参数或 call id；
- 工具结果正文或错误消息；
- 助手或用户消息正文；
- 原始 session id、工作目录、provider 名称或模型名称。

插件会暂时读取已有耐久事件里的工具名称、原始参数和结果状态来计算汇总，但不会持久化这些输入。它不追加 Session 事件、不注册工具、不添加 prompt 段、不注入上下文、不发起模型调用，也不改变模型历史。

`sessionIdHash` 是确定性、无密钥且带域分隔的 SHA-256，用于在不保存原始 id 的前提下将同一 Session 的凭证分组。它可跨文件关联。如果 Session id 可预测或熵低，观察者可以离线猜测候选值并重算 hash；这是化名化，不是匿名化。

## 验证信号启发式

以下情况会产生启发式信号：

- 工具名称类似 test、typecheck、lint、build、check、verify 或 validate 工作；或者
- 类 shell 工具在内存中的 `command` 或 `cmd` 参数类似上述工作。

落盘信号只保留 `source`、粗粒度 `category` 和观察到的 `status`。DSH 原生工具错误以及可识别的非零 shell 退出标记计为失败。后台命令保持 `unresolved`，因为后续 job 结果可能发生在本轮之外。即使是 `status: succeeded`，也只表示观察到的调用没有已识别失败标记；它不表示测试通过，甚至不表示测试确实运行。

分类只做词法匹配，不解析 shell 语义、不展开别名，也不执行命令：

| 输入形态 | 支持情况 | 边界 |
|---|---|---|
| JSON 字符串或对象参数中的字符串 `command`/`cmd` | 支持 | 只检查已识别的类 shell 工具名。 |
| 大小写、引号，或可见的 `bash -lc`/`pwsh -Command` wrapper | 词法支持 | 分类关键词必须仍在字符串中可见。 |
| 数组命令、`argv`、嵌套命令对象、自定义 shell 工具名 | 不支持 | 不产生信号。 |
| 不含可见分类关键词的别名或 wrapper | 不支持 | 预期存在漏判。 |
| `echo "do not run tests"` 一类引用文本 | 会被词法匹配 | 因为不解析意图与执行，预期存在误判。 |

每个匹配都只能称为“启发式信号”，绝不能称为“测试已运行”，也不能作为证明或质量门禁。

## 模型体验

| 方面 | 影响 |
|---|---|
| Token 成本 | 无。 |
| 工具调用 | 无；模型不会获得新工具。 |
| Session 日志 | 不变；插件只读已有事件，不添加事件。 |
| Prompt 与上下文 | 不变。 |
| Turn 延迟 | 监听器同步扫描已结束的 turn，并排队本地文件 I/O；turn 路径不等待磁盘。 |

## 已知限制

- 凭证只覆盖插件运行期间观察到的事件；不会回填构造 seed 历史或插件卸载期间结束的 turn。
- 进程崩溃可能丢失尚在队列中的凭证，因为 `turn/end` 不会同步等待这个可选本地 sink；正常卸载插件或应用时会排空已接收写入。
- 卸载时先关闭 enqueue 闸门，再移除 listener，最后排空已接收写入；进程被突然终止时无法运行该生命周期。
- 各行彼此独立，无法检测删除、重排、截断或回滚。
- 凭证状态复述 DSH 记录的工具结果和可识别的 shell 标记，不会独立执行或验证任何内容。
- 投影成本随单轮事件的数量和大小增长；异常大的工具参数在内存分类时可能增加 turn 结束阶段的 CPU 时间。
- 进程内写入队列有序但无界；缓慢或卡死的文件系统会持续增加内存占用，直至写入恢复或进程结束。
- 没有跨进程锁。两个 DSH 进程同写一个文件时，行顺序和行边界完整性均无保证；应每进程使用独立文件。崩溃可能留下不完整尾行，读取方必须拒绝或隔离它。
- 创建模式只在支持的 POSIX 文件系统上请求 `0700`/`0600`；不会收紧已有权限，Windows 可能忽略 POSIX mode，并且会跟随预先存在的符号链接。请配置可信、私有且非符号链接的路径。
- 文件没有内建轮转、保留策略、加密、签名或恢复机制。

信任与漏洞披露模型见 [SECURITY.md](SECURITY.md)。

## 开发

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check
pnpm run release:smoke
pnpm run performance:smoke
```

测试覆盖隐私排除、确定性 hash、顶层与 Code Mode 最终状态、分类支持/不支持矩阵、监听器释放、磁盘排空，以及真实 DSH `Context + SessionStore` 组合。`release:smoke` 会锁定 tarball 精确文件清单，把真实 `.tgz` 安装进临时项目，并按包名导入。

## 许可证

MIT
