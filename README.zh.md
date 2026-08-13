# DSH Verification Receipt

[English](README.md)

DSH Verification Receipt 是一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的小型、被动式 Profile Bundle。每次耐久的 `turn/end` 到达后，它会向本地 JSONL 文件追加一条隐私最小化汇总。

它记录执行痕迹，不证明语义正确。凭证可以说明 DSH 记录了工具调用、最终成功或失败状态，以及疑似测试或验证活动；它不能说明执行了正确的测试、断言足够充分、输出真实，或助手的结论正确。

## 安装

构建当前 checkout，并把它加入需要生成凭证的每个 profile：

```sh
pnpm install --frozen-lockfile
pnpm run check
dsh plugin --profile web add /path/to/dsh-verification-receipt
dsh plugin --profile headless add /path/to/dsh-verification-receipt
dsh --profile web --dump-config
```

`package.json` 声明 `dsh.bundle.patch`；`cordis.patch.yml` 插入一个普通观察插件。任何提供核心 Session 服务的 DSH 输出面都可以使用它。

## 输出

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

`receiptHash` 是对其前面全部凭证字段按输出顺序计算的 SHA-256。只有可信方已经掌握预期 hash 时，它才能发现意外改动。它不是签名、可信时间戳、hash 链或防篡改存储；能编辑文件的人也能修改一行并重新计算 hash。

## 隐私与 Agent 行为

落盘凭证不包含：

- 工具参数或 call id；
- 工具结果正文或错误消息；
- 助手或用户消息正文；
- 原始 session id、工作目录、provider 名称或模型名称。

插件会暂时读取已有耐久事件里的工具名称、原始参数和结果状态来计算汇总，但不会持久化这些输入。它不追加 Session 事件、不注册工具、不添加 prompt 段、不注入上下文、不发起模型调用，也不改变模型历史。

`sessionIdHash` 是带域分隔的确定性 SHA-256，用于在不保存原始 id 的前提下将同一 Session 的凭证分组。它在凭证文件副本之间可关联，而且无法阻止攻击者离线猜测可预测的 Session id。

## 验证信号启发式

以下情况会产生信号：

- 工具名称类似 test、typecheck、lint、build、check、verify 或 validate 工作；或者
- 类 shell 工具在内存中的 `command` 或 `cmd` 参数类似上述工作。

落盘信号只保留 `source`、粗粒度 `category` 和最终 `status`。DSH 原生工具错误以及可识别的非零 shell 退出标记计为失败。后台命令保持 `unresolved`，因为后续 job 结果可能发生在本轮之外。

该启发式可能漏掉自定义 runner，也可能误判无关命令。请仅把它作为发现线索，绝不要当成质量门禁。

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
- 各行彼此独立，无法检测删除、重排、截断或回滚。
- 凭证状态复述 DSH 记录的工具结果和可识别的 shell 标记，不会独立执行或验证任何内容。
- 投影成本随单轮事件的数量和大小增长；异常大的工具参数在内存分类时可能增加 turn 结束阶段的 CPU 时间。
- 文件没有内建轮转、保留策略、加密、签名或跨进程锁。

信任与漏洞披露模型见 [SECURITY.md](SECURITY.md)。

## 开发

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check
```

测试覆盖隐私排除、确定性 hash、顶层与 Code Mode 最终状态、验证信号分类、监听器释放、磁盘排空，以及真实 DSH `Context + SessionStore` 组合。

## 许可证

MIT
