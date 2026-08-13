# Local Release Checklist

This checklist prepares a local release candidate only. It contains no GitHub
repository creation, push, tag, npm publish, or other external-state command.

## Scope

- Confirm the package name and version are intentional; this checklist does not
  change either one.
- Keep receipt rows independent. Do not add a hash chain, evidence ledger,
  artifact capture, claim-evidence linkage, or semantic-correctness claim.
- Preserve the heuristic boundary: a verification signal never proves that a
  test or command ran.
- Re-read [SECURITY.md](SECURITY.md), especially the recomputable-hash,
  low-entropy Session-id, deletion, multi-process, crash, queue, permission,
  and symbolic-link limitations.

## Reproducible local gates

Run with Node `24.19.0` and the package-manager lock from `package.json`:

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
pnpm peers check
pnpm run check
pnpm run release:smoke
pnpm run performance:smoke
```

`release:smoke` runs `publint`, checks the exact tarball file list, installs
the real `.tgz` into an isolated temporary workspace, and imports it by package
name. `performance:smoke` is a regression signal, not a benchmark guarantee.

## Before any future external release

- Confirm a clean worktree and record the local commit SHA.
- Verify the tarball includes `README.md`, `README.zh.md`, `LICENSE`, and
  `SECURITY.md`; confirm both READMEs remain UTF-8.
- Read the CI workflow as a declaration of local gates only. It has
  `contents: read` permission and has not been executed online until a future
  repository actually enables it.
- Obtain separate explicit authorization before creating a repository, pushing,
  tagging, or publishing anything.
