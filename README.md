# DSH Verification Receipt

[中文](README.zh.md)

[![CI](https://github.com/030611/dsh-verification-receipt/actions/workflows/ci.yml/badge.svg)](https://github.com/030611/dsh-verification-receipt/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-verification-receipt)](https://www.npmjs.com/package/dsh-verification-receipt)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![featured on dsh-suite](https://img.shields.io/badge/featured%20on-dsh--suite-4d6bfe)](https://whyihaveyou.github.io/dsh-suite/)

![DSH Verification Receipt social preview](docs/social-preview.jpg)

> Ask a smaller, checkable question: what verification-shaped execution signals did DSH record this turn?

```sh
dsh plugin --profile web add dsh-verification-receipt
```

The receipt summarizes recorded tool counts and lexical verification-shaped signals. It does **not** prove that tests ran or that code is correct.

> Community-maintained and not an official DeepSeek project. Related trust-layer plugins: [Telemetry Redactor](https://github.com/030611/dsh-telemetry-redactor), [Evidence Audit](https://github.com/030611/qiushi-dsh-evidence-audit), and [Context Provenance](https://github.com/030611/dsh-context-provenance).

DSH Verification Receipt is a small, passive Profile Bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). After each durable `turn/end`, it appends one privacy-minimal, heuristic execution summary to a local JSONL file.

![Verification Receipt data flow](https://raw.githubusercontent.com/030611/dsh-verification-receipt/main/docs/verification-flow.svg)

It records execution traces, not semantic correctness. A receipt shows only that DSH logged tool calls and that a lexical heuristic found a possible verification signal. It never proves that a test ran. It cannot show that the right command executed, that assertions were sufficient, that output was truthful, or that the assistant's conclusion was correct.

This is intentionally not an evidence-audit ledger: rows stay independent and there is no hash chain, artifact capture, claim-evidence linkage, or protocol attestation.

## Compatibility evidence

The package is audited against DeepSeek Harness commit `47f943859bef60e4160492346772ded9b24f765a`, whose manifests declare `@deepseek-ai/dsh-session` `0.1.0-rc.5`, Cordis `4.0.1`, and Schemastery `3.18.1`. Peer ranges start at those versions and stop before `dsh-session` stable `0.1.0` or the next Cordis/Schemastery semver major. The release checks also exercise the available `dsh-session` `0.1.0-rc.6` package. Versions admitted by the range but not named here are compatibility expectations, not tested evidence. Cordis and Session are optional host peers because DSH supplies their runtime services; Schemastery is included as an exact runtime dependency and also declared as a compatibility peer.

## Install

Add the published package to every profile that should emit receipts:

```sh
dsh plugin --profile web add dsh-verification-receipt
dsh --profile web --dump-config
```

Repeat the first command with another profile name (for example, `headless`) when that profile also needs receipts. For local development, clone this repository, run `pnpm install --frozen-lockfile && pnpm run check`, and pass the checkout path to `dsh plugin ... add` instead of the package name.

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

### Integrity warning

Both hashes are unkeyed and recomputable. `receiptHash` is SHA-256 over the exact preceding receipt fields in their emitted order. Anyone who can edit a row can recompute it. Independent rows do not reveal deletion, insertion, reordering, truncation, rollback, or replacement. The hash is neither a signature nor a trusted timestamp, hash chain, commitment, or tamper-evident log.

## Privacy and agent behavior

The persisted receipt does not contain:

- tool arguments or call ids;
- tool result content or error messages;
- assistant or user message text;
- raw session ids, working directories, provider names, or model names.

The plugin temporarily reads tool names, raw arguments, and result status from existing durable events to compute the summary. It does not persist those inputs, append a Session event, register a tool, add a prompt section, inject context, make a model call, or change model history.

`sessionIdHash` is deterministic, unkeyed, and domain-separated so receipts from one Session can be grouped without storing its raw id. It is linkable across files. If a Session id is predictable or low entropy, an observer can guess candidates offline and recompute the hash; this is pseudonymization, not anonymization.

## Verification-signal heuristic

A heuristic signal is emitted when either:

- a tool name resembles test, typecheck, lint, build, check, verify, or validate work; or
- a shell-like tool's in-memory `command` or `cmd` argument resembles such work.

The stored signal keeps only `source`, coarse `category`, and observed `status`. Native DSH tool errors and recognized non-zero shell exit markers count as failure. Background commands remain `unresolved` because their later job result may occur outside this turn. Even `status: succeeded` means only that the observed call completed without a recognized failure marker; it does not mean tests passed or even ran.

Classification is lexical; it does not parse shell syntax, expand aliases, or execute commands:

| Input shape | Support | Boundary |
|---|---|---|
| JSON-string or object arguments with string `command`/`cmd` | Supported | Only recognized shell-like tool names are inspected. |
| Upper/lower case, quotes, or visible wrappers such as `bash -lc`/`pwsh -Command` | Supported lexically | A category keyword must remain visible in the string. |
| Array commands, `argv`, nested command objects, custom shell tool names | Unsupported | No signal is emitted. |
| Aliases or wrappers with no visible category keyword | Unsupported | False negatives are expected. |
| Quoted prose such as `echo "do not run tests"` | Lexically matched | False positives are expected because intent and execution are not parsed. |

Treat every match as a discovery hint named “heuristic signal,” never as “tests ran,” an attestation, or a quality gate.

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
- Disposal first closes the enqueue gate, then unregisters listeners, then drains accepted writes. Abrupt process termination cannot run that lifecycle.
- Receipt rows are independent; deletion, reordering, truncation, and rollback are not detectable.
- Receipt status repeats DSH's recorded tool outcome and recognized shell markers. It does not independently execute or validate anything.
- Projection cost grows with the number and size of events in a turn; unusually large tool arguments can add end-of-turn CPU time while they are classified in memory.
- The in-process write queue is ordered but unbounded. A slow or stuck filesystem can grow memory usage until writes recover or the process ends.
- There is no cross-process lock. Two DSH processes targeting one file have no guaranteed row order or row-boundary integrity; use one file per process. A crash can leave an incomplete final line, which readers must reject or quarantine.
- Creation modes request `0700`/`0600` on supporting POSIX filesystems only. Existing permissions are not tightened, Windows may ignore POSIX modes, and pre-existing symbolic links are followed. Configure a trusted, private, non-symlink path.
- The file has no built-in rotation, retention, encryption, signing, or recovery.

See [SECURITY.md](SECURITY.md) for the trust and disclosure model.

## Development

```sh
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check
pnpm run release:smoke
pnpm run performance:smoke
```

Tests cover privacy exclusions, deterministic hashing, top-level and Code Mode final states, the supported/unsupported classification matrix, listener disposal, disk draining, and a real DSH `Context + SessionStore` composition. `release:smoke` enforces the exact tarball file list, installs the real `.tgz` into a temporary project, and imports it by package name.

## License

MIT
