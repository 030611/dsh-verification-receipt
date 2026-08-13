# DSH Verification Receipt

[中文](README.zh.md)

DSH Verification Receipt is a small, passive Profile Bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). After each durable `turn/end`, it appends one privacy-minimal summary to a local JSONL file.

It records execution traces, not semantic correctness. A receipt can show that DSH logged tool calls, final success/failure states, and likely test or verification activity. It cannot show that the right test ran, that assertions were sufficient, that output was truthful, or that the assistant's conclusion was correct.

## Install

Build this checkout and add it to every profile that should emit receipts:

```sh
pnpm install --frozen-lockfile
pnpm run check
dsh plugin --profile web add /path/to/dsh-verification-receipt
dsh plugin --profile headless add /path/to/dsh-verification-receipt
dsh --profile web --dump-config
```

`package.json` declares `dsh.bundle.patch`; `cordis.patch.yml` inserts one ordinary observer plugin. It works on any DSH surface that provides the core Session service.

## Output

The default file is:

```text
$DSH_HOME/verification-receipts/v1/receipts.jsonl
```

When `DSH_HOME` is unset, it resolves below `~/.dsh`. Override it with an absolute path in the profile's `cordis.patch.yml`:

```yaml
- id: verification-receipt
  config:
    outputPath: /absolute/private/path/receipts.jsonl
```

Each line has this form:

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

`receiptHash` is SHA-256 over the exact preceding receipt fields in their emitted order. It detects accidental changes only when a trusted party already knows the expected hash. It is not a signature, a trusted timestamp, a hash chain, or tamper-proof storage; anyone who can edit the file can edit a row and recompute its hash.

## Privacy and agent behavior

The persisted receipt does not contain:

- tool arguments or call ids;
- tool result content or error messages;
- assistant or user message text;
- raw session ids, working directories, provider names, or model names.

The plugin temporarily reads tool names, raw arguments, and result status from existing durable events to compute the summary. It does not persist those inputs, append a Session event, register a tool, add a prompt section, inject context, make a model call, or change model history.

`sessionIdHash` is a deterministic domain-separated SHA-256 hash so receipts from one Session can be grouped without storing its raw id. It is linkable across copies of the receipt file and does not conceal a predictable Session id from offline guessing.

## Verification-signal heuristic

A signal is emitted when either:

- a tool name resembles test, typecheck, lint, build, check, verify, or validate work; or
- a shell-like tool's in-memory `command` or `cmd` argument resembles such work.

The stored signal keeps only `source`, coarse `category`, and final `status`. Native DSH tool errors and recognized non-zero shell exit markers count as failure. Background commands remain `unresolved` because their later job result may occur outside this turn.

This heuristic can miss custom runners and can misclassify unrelated commands. Treat it as a discovery hint, never as a quality gate.

## Model experience

| Aspect | Effect |
|---|---|
| Token cost | None. |
| Tool calls | None; the model gets no new tool. |
| Session log | Unchanged; the plugin reads existing events and adds no events. |
| Prompt and context | Unchanged. |
| Turn latency | The listener scans the completed turn synchronously and queues local file I/O; it does not await disk on the turn path. |

## Known limitations

- Receipts cover events observed by the running plugin. Constructor seed history and turns completed while it was unloaded are not backfilled.
- A process crash can lose a queued receipt because `turn/end` does not synchronously wait for this optional local sink. Normal plugin/application disposal drains accepted writes.
- Receipt rows are independent; deletion, reordering, truncation, and rollback are not detectable.
- Receipt status repeats DSH's recorded tool outcome and recognized shell markers. It does not independently execute or validate anything.
- Projection cost grows with the number and size of events in a turn; unusually large tool arguments can add end-of-turn CPU time while they are classified in memory.
- The file has no built-in rotation, retention, encryption, signing, or cross-process locking.

See [SECURITY.md](SECURITY.md) for the trust and disclosure model.

## Development

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check
```

Tests cover privacy exclusions, deterministic hashing, top-level and Code Mode final states, verification-signal classification, listener disposal, disk draining, and a real DSH `Context + SessionStore` composition.

## License

MIT
