import { describe, expect, it } from 'vitest'
import { createReceipt, type ReceiptEvent, type ReceiptSession } from '../src/receipt.ts'

function session(id: string, events: ReceiptEvent[]): ReceiptSession {
  return { id, events }
}

function event(type: string, seq: number, data: Record<string, unknown>): ReceiptEvent {
  return { type, seq, time: seq + 1, data }
}

function result(seq: number, turn: number, step: number, id: string, text: string, isError = false): ReceiptEvent {
  return event('tool/result', seq, {
    turn,
    step,
    message: {
      content: [{
        type: 'tool-result',
        toolCallId: id,
        content: [{ type: 'text', text }],
        isError,
      }],
    },
  })
}

function signalFor(name: string, args: unknown): unknown {
  const end = event('turn/end', 3, { turn: 9, reason: { kind: 'completed' } })
  const fixture = session('matrix', [
    event('turn/start', 0, { turn: 9 }),
    event('tool/call', 1, { turn: 9, step: 1, callId: 'matrix', name, arguments: args }),
    result(2, 9, 1, 'matrix', 'ok'),
    end,
  ])
  return createReceipt(fixture, end).verificationSignals[0]
}

describe('verification receipt', () => {
  it('records only summary fields and a deterministic hash', () => {
    const end = event('turn/end', 6, { turn: 1, reason: { kind: 'completed' } })
    const fixture = session('sensitive-session-id', [
      event('turn/start', 0, { turn: 1 }),
      event('step/start', 1, { turn: 1, step: 1 }),
      event('tool/call', 2, {
        turn: 1,
        step: 1,
        callId: 'secret-call-id',
        name: 'read',
        arguments: '{"path":"/secret/customer.txt"}',
      }),
      result(3, 1, 1, 'secret-call-id', 'secret tool output'),
      event('assistant/message', 4, {
        turn: 1,
        step: 1,
        message: { content: [{ type: 'text', text: 'secret assistant body' }] },
      }),
      event('step/end', 5, { turn: 1, step: 1 }),
      end,
    ])

    const first = createReceipt(fixture, end)
    const second = createReceipt(fixture, end)
    expect(first).toEqual(second)
    expect(first.tools).toEqual({
      calls: 1,
      succeeded: 1,
      failed: 0,
      unresolved: 0,
      topLevel: 1,
      nested: 0,
    })
    expect(first.sessionIdHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(first.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    const serialized = JSON.stringify(first)
    for (const secret of [
      'sensitive-session-id',
      'secret-call-id',
      '/secret/customer.txt',
      'secret tool output',
      'secret assistant body',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('counts final top-level and nested Code Mode tool states', () => {
    const end = event('turn/end', 9, { turn: 4, reason: { kind: 'completed' } })
    const fixture = session('code-mode', [
      event('turn/start', 0, { turn: 4 }),
      event('step/start', 1, { turn: 4, step: 2 }),
      event('tool/call', 2, {
        turn: 4, step: 2, callId: 'outer', name: 'run_code', arguments: '{}',
      }),
      event('tool/code-dispatch-start', 3, {
        rootCallId: 'outer', parentCallId: 'outer', subCallId: 'nested-ok',
        name: 'read', arguments: { path: 'README.md' },
      }),
      event('tool/code-dispatch', 4, {
        rootCallId: 'outer', parentCallId: 'outer', subCallId: 'nested-ok',
        name: 'read', arguments: { path: 'README.md' }, isError: false,
        content: [{ type: 'text', text: 'private read result' }],
      }),
      event('tool/code-dispatch-start', 5, {
        rootCallId: 'outer', parentCallId: 'outer', subCallId: 'nested-fail',
        name: 'write', arguments: { path: 'x' },
      }),
      event('tool/code-dispatch', 6, {
        rootCallId: 'outer', parentCallId: 'outer', subCallId: 'nested-fail',
        name: 'write', arguments: { path: 'x' }, isError: true,
        content: [{ type: 'text', text: 'private failure' }],
      }),
      result(7, 4, 2, 'outer', 'done'),
      event('step/end', 8, { turn: 4, step: 2 }),
      end,
    ])

    expect(createReceipt(fixture, end).tools).toEqual({
      calls: 3,
      succeeded: 2,
      failed: 1,
      unresolved: 0,
      topLevel: 1,
      nested: 2,
    })
  })

  it('classifies suspected verification commands without retaining command or output', () => {
    const end = event('turn/end', 7, { turn: 2, reason: { kind: 'completed' } })
    const fixture = session('verification', [
      event('turn/start', 0, { turn: 2 }),
      event('step/start', 1, { turn: 2, step: 1 }),
      event('tool/call', 2, {
        turn: 2, step: 1, callId: 'test', name: 'bash',
        arguments: '{"command":"pnpm vitest run --token super-secret"}',
      }),
      result(3, 2, 1, 'test', 'failed tests\n[exit code: 1]'),
      event('tool/call', 4, {
        turn: 2, step: 1, callId: 'typecheck', name: 'typecheck_project',
        arguments: '{"workspace":"private"}',
      }),
      result(5, 2, 1, 'typecheck', 'ok'),
      event('step/end', 6, { turn: 2, step: 1 }),
      end,
    ])

    const receipt = createReceipt(fixture, end)
    expect(receipt.verificationSignals).toEqual([
      { source: 'command', category: 'test', status: 'failed' },
      { source: 'tool-name', category: 'typecheck', status: 'succeeded' },
    ])
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain('vitest')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('failed tests')
    expect(serialized).not.toContain('private')
  })

  it('interprets exit markers only for shell-like tools', () => {
    const end = event('turn/end', 6, { turn: 3, reason: { kind: 'completed' } })
    const fixture = session('marker-scope', [
      event('turn/start', 0, { turn: 3 }),
      event('tool/call', 1, {
        turn: 3, step: 1, callId: 'shell', name: 'pwsh', arguments: '{"command":"npm test"}',
      }),
      result(2, 3, 1, 'shell', 'test failed\n[exit code: 2]'),
      event('tool/call', 3, {
        turn: 3, step: 1, callId: 'reader', name: 'read', arguments: '{}',
      }),
      result(4, 3, 1, 'reader', 'documentation containing [exit code: 2]'),
      event('step/end', 5, { turn: 3, step: 1 }),
      end,
    ])

    expect(createReceipt(fixture, end).tools).toMatchObject({
      calls: 2,
      succeeded: 1,
      failed: 1,
    })
  })

  it('keeps missing results and background verification work unresolved', () => {
    const end = event('turn/end', 4, { turn: 5, reason: { kind: 'completed' } })
    const fixture = session('unresolved', [
      event('turn/start', 0, { turn: 5 }),
      event('tool/call', 1, {
        turn: 5, step: 1, callId: 'missing', name: 'verify_project', arguments: '{}',
      }),
      event('tool/call', 2, {
        turn: 5, step: 1, callId: 'background', name: 'bash',
        arguments: '{"command":"pnpm test","run_in_background":true}',
      }),
      result(3, 5, 1, 'background', 'background job started'),
      end,
    ])

    const receipt = createReceipt(fixture, end)
    expect(receipt.tools).toMatchObject({ calls: 2, succeeded: 1, unresolved: 1 })
    expect(receipt.verificationSignals).toEqual([
      { source: 'tool-name', category: 'check', status: 'unresolved' },
      { source: 'command', category: 'test', status: 'unresolved' },
    ])
  })

  it.each([
    ['command JSON string', 'bash', '{"command":"pnpm test"}', 'test'],
    ['cmd object field', 'pwsh', { cmd: 'pnpm lint' }, 'lint'],
    ['case-insensitive quoted wrapper', 'SHELL_COMMAND', { command: 'bash -lc "PNPM VITEST run"' }, 'test'],
    ['PowerShell wrapper and quotes', 'terminal_exec', { command: 'pwsh -Command "npm run TYPECHECK"' }, 'typecheck'],
  ])('supports %s', (_label, name, args, category) => {
    expect(signalFor(name, args)).toMatchObject({ source: 'command', category })
  })

  it.each([
    ['array command', 'bash', { command: ['pnpm', 'test'] }],
    ['argv-only shape', 'bash', { argv: ['pnpm', 'test'] }],
    ['custom shell name', 'my_shell', { command: 'pnpm test' }],
    ['nested command', 'bash', { command: { text: 'pnpm test' } }],
    ['custom alias without keyword', 'bash', { command: 'pnpm run ci' }],
  ])('leaves unsupported %s unclassified', (_label, name, args) => {
    expect(signalFor(name, args)).toBeUndefined()
  })

  it('documents lexical false positives by classifying quoted non-execution text', () => {
    expect(signalFor('bash', { command: 'echo "do not run tests"' })).toMatchObject({
      source: 'command',
      category: 'test',
    })
  })

  it('does not treat a turn end from another event as the receipt boundary', () => {
    const events = [event('turn/end', 0, { turn: 1, reason: { kind: 'completed' } })]
    expect(() => createReceipt(session('s', events), {
      ...events[0]!,
      seq: 1,
    })).toThrow('turn/end is not present at its declared seq')
  })
})
