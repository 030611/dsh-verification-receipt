/**
 * DSH Verification Receipt: a passive per-turn JSONL summary observer.
 *
 * @module dsh-verification-receipt
 */

import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { createReceipt } from './receipt.ts'

export type {
  ReceiptStatus,
  ToolSummary,
  VerificationCategory,
  VerificationReceipt,
  VerificationSignal,
} from './receipt.ts'
export { createReceipt } from './receipt.ts'

/** Stable Cordis plugin name. */
export const name = 'verification-receipt'

/** The observer requires the durable session event stream. */
export const inject = ['sessions']

/** User-configurable JSONL destination. */
export interface Config {
  /** Absolute receipt JSONL path; defaults below the DSH home directory. */
  outputPath?: string
}

/** Loader validation for the optional destination override. */
export const Config: z<Config> = z.object({
  outputPath: z.string(),
})

/** Fully resolved writer configuration. */
interface ResolvedConfig {
  readonly outputPath: string
}

/** Resolve and validate the JSONL destination at plugin load. */
function resolveConfig(config: Config = {}): ResolvedConfig {
  const dshHome = resolve(process.env.DSH_HOME ?? join(homedir(), '.dsh'))
  const outputPath = config.outputPath ?? join(dshHome, 'verification-receipts', 'v1', 'receipts.jsonl')
  if (!isAbsolute(outputPath)) {
    throw new Error('verification-receipt: outputPath must be absolute')
  }
  return { outputPath }
}

/** Ordered, non-blocking appends owned by one plugin fiber. */
class JsonlWriter {
  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly ctx: Context,
    private readonly outputPath: string,
  ) {}

  /** Enqueue one complete JSON line without returning work to the session listener. */
  enqueue(value: unknown): void {
    const line = `${JSON.stringify(value)}\n`
    this.pending = this.pending
      .then(async () => {
        await mkdir(dirname(this.outputPath), { recursive: true, mode: 0o700 })
        await appendFile(this.outputPath, line, { encoding: 'utf8', flag: 'a', mode: 0o600 })
      })
      .catch((error: unknown) => {
        this.ctx.logger.warn(`verification-receipt: could not append receipt: ${String(error)}`)
      })
  }

  /** Wait until every append accepted before disposal has settled. */
  async drain(): Promise<void> {
    await this.pending
  }
}

/**
 * Mount the passive turn observer and its disposal drain.
 * @param ctx - Cordis context carrying the DSH session event stream.
 * @param config - optional absolute JSONL destination.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  const writer = new JsonlWriter(ctx, resolved.outputPath)
  ctx.effect(function* () {
    let accepting = true
    yield async () => writer.drain()
    yield ctx.on('session/event', (session: Session, event: SessionEvent) => {
      // Cordis clears the public fiber uid synchronously when explicit disposal
      // starts, before its async unload checkpoint can unregister this listener.
      if (!accepting || ctx.fiber.uid === null || event.type !== 'turn/end') return
      try {
        writer.enqueue(createReceipt(session, event))
      } catch (error: unknown) {
        ctx.logger.warn(`verification-receipt: could not summarize turn: ${String(error)}`)
      }
    })
    // Yield in drain/listener/gate order: Cordis disposes nested effects in
    // reverse, so any unload closes the gate, unregisters, then awaits writes.
    yield () => {
      accepting = false
    }
  }, 'verification-receipt listener and JSONL drain')
}
