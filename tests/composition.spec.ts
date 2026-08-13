import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import { apply } from '../src/index.ts'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('real DSH composition', () => {
  it('observes SessionStore turn/end, writes JSONL, and changes no model history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verification-receipt-'))
    roots.push(root)
    const outputPath = join(root, 'receipts.jsonl')
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const beforeListeners = [...ctx.events.dispatch('emit', ['session/event'])].length
    const plugin = await ctx.plugin(apply, { outputPath })
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('tool/call', {
      turn: 1,
      step: 1,
      callId: CallId('c1'),
      name: 'read',
      arguments: '{"path":"private.txt"}',
    })
    session.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: CallId('c1'),
        content: [{ type: 'text', text: 'private result' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    const messagesBeforeEnd = session.deriveMessages()
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(session.deriveMessages()).toEqual(messagesBeforeEnd)
    await plugin.dispose()

    const raw = await readFile(outputPath, 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(1)
    const receipt = JSON.parse(lines[0]!) as Record<string, unknown>
    expect(receipt).toMatchObject({
      kind: 'dsh-verification-receipt',
      outcome: 'completed',
      claim: 'execution-trace-only',
      tools: { calls: 1, succeeded: 1, failed: 0 },
    })
    expect(lines[0]).not.toContain('private')
    expect([...ctx.events.dispatch('emit', ['session/event'])]).toHaveLength(beforeListeners)
    await ctx.fiber.dispose()
  })

  it('uses the versioned receipt path below DSH_HOME by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verification-receipt-home-'))
    roots.push(root)
    vi.stubEnv('DSH_HOME', root)
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const plugin = await ctx.plugin(apply)
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await plugin.dispose()

    const outputPath = join(root, 'verification-receipts', 'v1', 'receipts.jsonl')
    const receipt = JSON.parse((await readFile(outputPath, 'utf8')).trim()) as Record<string, unknown>
    expect(receipt).toMatchObject({ kind: 'dsh-verification-receipt', turn: 1 })
    await ctx.fiber.dispose()
  })

  it('stops accepting turn events as soon as disposal begins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verification-receipt-dispose-'))
    roots.push(root)
    const outputPath = join(root, 'receipts.jsonl')
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const plugin = await ctx.plugin(apply, { outputPath })
    const session = ctx.sessions.create()
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const disposing = plugin.dispose()
    session.append('turn/start', { turn: 2 })
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    await disposing

    expect((await readFile(outputPath, 'utf8')).trim().split('\n')).toHaveLength(1)
    await ctx.fiber.dispose()
  })
})
