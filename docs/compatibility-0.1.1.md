# DSH 0.1.2 compatibility evidence

This record documents the narrow runtime boundary claimed by
`dsh-verification-receipt` 0.1.1. It is compatibility evidence, not a security
audit or a claim about untested systems and releases.

## Exact release matrix

| DSH release | Status | Basis |
| --- | --- | --- |
| `0.1.2-alpha.3` | `compatible` | Package gates and disposable Web Profile acceptance passed. |
| `0.1.2-alpha.4` | `compatible` | Package gates and disposable Web Profile acceptance passed. |
| `0.1.2-alpha.5` | `compatible` | Package gates and disposable Web Profile acceptance passed. |

The Node.js range is `^22.19.0 || >=24.0.0`. Acceptance used Node.js 24.19.0
and pnpm 11.19.0 on Windows. macOS and Linux remain untested; the manifest
does not infer system support from the Windows result.

## Disposable Web Profile acceptance

Date: 2026-09-04. Each DSH release used a separate, new `DSH_HOME` and the
locally packed `dsh-verification-receipt-0.1.1.tgz`. No real user Profile was
read or modified.

For each release in the matrix:

1. `dsh plugin --profile web add <local-0.1.1-tarball>` exited 0.
2. `dsh --profile web --dump-config` exited 0 and contained the additive
   plugin-owned `dsh-verification-receipt` entry.
3. `dsh --profile web --no-open --port 0` emitted a bound loopback URL and
   remained live until deliberately interrupted.
4. `dsh plugin --profile web remove dsh-verification-receipt` exited 0, and a
   subsequent config dump contained no plugin entry.

No provider or model request was made. This acceptance does not prove the
semantic correctness of a receipt, exercise external APIs, or widen the
declared release range.
