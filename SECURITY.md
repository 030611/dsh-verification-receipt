# Security Policy

## Supported versions

This is a pre-release `0.x` plugin. Security fixes apply to the latest commit only.

## Trust model

DSH Verification Receipt is a local observer, not an enforcement or attestation system. It trusts the DSH Session event stream for tool identity and outcome. It does not independently rerun tools, inspect the workspace, validate assistant claims, sign records, or provide trusted timestamps.

The JSONL destination should be readable and writable only by the local user who runs DSH. Do not place it in an agent-visible workspace, shared directory, synced public folder, or untrusted mount. The plugin requests owner-only modes when creating its directory and file, but operating systems and pre-existing paths may apply different permissions.

Anyone able to modify the JSONL file can delete, reorder, replace, or recompute receipt rows. `receiptHash` is an integrity checksum, not authentication. Use an external signed, append-only, access-controlled sink if adversarial tamper resistance is required.

Receipt rows omit arguments, outputs, messages, and raw Session ids. They still expose timing, turn numbers, outcome counts, coarse verification categories, and a deterministic Session-id hash. Those facts may be sensitive, and the hash allows rows for one Session to be linked.

## Report a vulnerability

Do not publish secrets, private receipt files, or exploitable details in a public issue. Contact the repository maintainer privately with:

- the affected commit;
- impact and threat assumptions;
- minimal reproduction steps;
- whether the issue can disclose content that the default receipt promises to omit.

If no private contact channel exists, open a public issue containing only a request for a private security contact.

## In-scope examples

- persisted tool arguments, results, assistant text, or raw Session ids;
- a path escape caused by plugin path handling;
- receipt creation that changes model context or Agent execution;
- a write-order or disposal flaw that falsely presents a partial row as complete.

Heuristic false positives or false negatives are correctness limitations unless they cause a documented privacy or security guarantee to fail.
