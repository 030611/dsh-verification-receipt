/**
 * Pure projection from one completed DSH turn to a privacy-minimal receipt.
 *
 * @module dsh-verification-receipt/receipt
 */

import { createHash } from 'node:crypto'

/** Minimum session-event representation consumed by the receipt projection. */
export interface ReceiptEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

/** Minimum session representation consumed by the receipt projection. */
export interface ReceiptSession {
  readonly id: string
  readonly events: readonly ReceiptEvent[]
}

/** Final state of a tool call or suspected verification action. */
export type ReceiptStatus = 'succeeded' | 'failed' | 'unresolved'

/** Coarse class of an action that may verify work. */
export type VerificationCategory = 'test' | 'typecheck' | 'lint' | 'build' | 'check'

/** Privacy-minimal indication that a likely verification action ran. */
export interface VerificationSignal {
  readonly source: 'command' | 'tool-name'
  readonly category: VerificationCategory
  readonly status: ReceiptStatus
}

/** Counts of final tool states observed inside one durable turn bracket. */
export interface ToolSummary {
  readonly calls: number
  readonly succeeded: number
  readonly failed: number
  readonly unresolved: number
  readonly topLevel: number
  readonly nested: number
}

/** One JSONL record emitted after a durable `turn/end`. */
export interface VerificationReceipt {
  readonly schemaVersion: 1
  readonly kind: 'dsh-verification-receipt'
  readonly sessionIdHash: string
  readonly turn: number
  readonly turnEndSeq: number
  readonly endedAt: number
  readonly outcome: string
  readonly tools: ToolSummary
  readonly verificationSignals: readonly VerificationSignal[]
  readonly claim: 'execution-trace-only'
  readonly receiptHash: string
}

interface CallObservation {
  readonly id: string
  readonly name: string
  readonly arguments: unknown
  readonly source: 'top-level' | 'nested'
  readonly result?: {
    readonly isError: boolean
    readonly content: unknown
  }
}

const SHELL_TOOL = /^(?:bash|pwsh|shell|shell_command|terminal|terminal_exec)$/iu
const CATEGORY_PATTERNS: ReadonlyArray<readonly [VerificationCategory, RegExp]> = [
  ['typecheck', /(?:^|[^a-z])(?:type[-_ ]?check|tsc)(?:[^a-z]|$)/iu],
  ['test', /(?:^|[^a-z])(?:test|tests|testing|vitest|jest|pytest|unittest|cargo\s+test|go\s+test)(?:[^a-z]|$)/iu],
  ['lint', /(?:^|[^a-z])(?:lint|eslint|oxlint|ruff)(?:[^a-z]|$)/iu],
  ['build', /(?:^|[^a-z])(?:build|compile|tsdown|esbuild)(?:[^a-z]|$)/iu],
  ['check', /(?:^|[^a-z])(?:check|verify|validate)(?:[^a-z]|$)/iu],
]

/**
 * Project the durable events in one completed turn to a summary receipt.
 * @param session - session containing the exact `turn/end` event.
 * @param end - turn boundary that triggers this receipt.
 * @returns a deterministic summary whose hash covers every preceding receipt field.
 */
export function createReceipt(session: ReceiptSession, end: ReceiptEvent): VerificationReceipt {
  const storedEnd = session.events[end.seq]
  if (storedEnd === undefined || storedEnd.seq !== end.seq || storedEnd.type !== 'turn/end') {
    throw new Error('turn/end is not present at its declared seq')
  }
  const endData = record(storedEnd.data)
  const turn = numberField(endData, 'turn')
  const startIndex = findTurnStart(session.events, storedEnd.seq, turn)
  const bracket = session.events.slice(startIndex, storedEnd.seq + 1)
  const calls = observeCalls(bracket)
  const tools = summarizeTools(calls)
  const verificationSignals = calls.flatMap(verificationSignal)
  const reason = record(endData.reason)
  const withoutHash = {
    schemaVersion: 1 as const,
    kind: 'dsh-verification-receipt' as const,
    sessionIdHash: digest(`dsh-verification-receipt/session/v1\n${session.id}`),
    turn,
    turnEndSeq: storedEnd.seq,
    endedAt: storedEnd.time,
    outcome: stringField(reason, 'kind'),
    tools,
    verificationSignals,
    claim: 'execution-trace-only' as const,
  }
  return {
    ...withoutHash,
    receiptHash: digest(JSON.stringify(withoutHash)),
  }
}

/** Find the matching opening boundary and reject an incomplete event bracket. */
function findTurnStart(events: readonly ReceiptEvent[], endSeq: number, turn: number): number {
  for (let index = endSeq - 1; index >= 0; index--) {
    const candidate = events[index]
    if (candidate?.type !== 'turn/start') continue
    if (numberField(record(candidate.data), 'turn') === turn) return index
    throw new Error(`turn ${turn} crosses another turn/start boundary`)
  }
  throw new Error(`turn ${turn} has no turn/start boundary`)
}

/** Fold native and Code Mode calls, then pair each with its latest final event. */
function observeCalls(events: readonly ReceiptEvent[]): CallObservation[] {
  const topLevel: CallObservation[] = []
  const nested: CallObservation[] = []
  const topLevelResults = new Map<string, CallObservation['result']>()
  const nestedResults = new Map<string, CallObservation['result']>()

  for (const event of events) {
    const data = record(event.data)
    if (event.type === 'tool/call') {
      topLevel.push({
        id: stringField(data, 'callId'),
        name: stringField(data, 'name'),
        arguments: data.arguments,
        source: 'top-level',
      })
      continue
    }
    if (event.type === 'tool/result') {
      const block = toolResultBlock(data.message)
      if (block !== undefined) {
        topLevelResults.set(stringField(block, 'toolCallId'), {
          isError: block.isError === true,
          content: block.content,
        })
      }
      continue
    }
    if (event.type === 'tool/code-dispatch-start') {
      nested.push({
        id: stringField(data, 'subCallId'),
        name: stringField(data, 'name'),
        arguments: data.arguments,
        source: 'nested',
      })
      continue
    }
    if (event.type === 'tool/code-dispatch') {
      nestedResults.set(stringField(data, 'subCallId'), {
        isError: data.isError === true,
        content: data.content,
      })
    }
  }

  return [
    ...topLevel.map(call => ({ ...call, result: topLevelResults.get(call.id) })),
    ...nested.map(call => ({ ...call, result: nestedResults.get(call.id) })),
  ]
}

/** Count independent final states without treating unresolved work as success. */
function summarizeTools(calls: readonly CallObservation[]): ToolSummary {
  let succeeded = 0
  let failed = 0
  let unresolved = 0
  let topLevel = 0
  let nested = 0
  for (const call of calls) {
    if (call.source === 'top-level') topLevel++
    else nested++
    const status = callStatus(call)
    if (status === 'succeeded') succeeded++
    else if (status === 'failed') failed++
    else unresolved++
  }
  return { calls: calls.length, succeeded, failed, unresolved, topLevel, nested }
}

/** Return one coarse suspected-verification signal, if the call looks relevant. */
function verificationSignal(call: CallObservation): VerificationSignal[] {
  const byName = categoryFor(call.name)
  if (byName !== undefined) {
    return [{ source: 'tool-name', category: byName, status: callStatus(call) }]
  }
  if (!SHELL_TOOL.test(call.name)) return []
  const args = argumentRecord(call.arguments)
  const command = typeof args?.command === 'string'
    ? args.command
    : typeof args?.cmd === 'string'
      ? args.cmd
      : undefined
  if (command === undefined) return []
  const category = categoryFor(command)
  if (category === undefined) return []
  const background = args?.run_in_background === true
  return [{
    source: 'command',
    category,
    status: background ? 'unresolved' : callStatus(call),
  }]
}

/** Parse a tool's raw JSON arguments only for in-memory classification. */
function argumentRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return recordOrUndefined(value)
  try {
    return recordOrUndefined(JSON.parse(value) as unknown)
  } catch {
    return undefined
  }
}

/** Choose the first, most-specific verification category present in text. */
function categoryFor(text: string): VerificationCategory | undefined {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category
  }
  return undefined
}

/** Resolve a call's final state, including non-zero shell status markers. */
function callStatus(call: CallObservation): ReceiptStatus {
  if (call.result === undefined) return 'unresolved'
  if (call.result.isError) return 'failed'
  if (SHELL_TOOL.test(call.name) && failedCommandContent(call.result.content)) return 'failed'
  return 'succeeded'
}

/** Recognize DSH shell render markers without retaining the result text. */
function failedCommandContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  for (const block of content) {
    const item = recordOrUndefined(block)
    if (item?.type !== 'text' || typeof item.text !== 'string') continue
    const exit = item.text.match(/\[exit code: (-?\d+)\](?:\r?\n)?$/u)
    if (exit?.[1] !== undefined && Number(exit[1]) !== 0) return true
    if (/\[(?:killed by signal|timed out after):?[^\]]*\](?:\r?\n)?$/iu.test(item.text)) return true
  }
  return false
}

/** Extract the single tool-result block from a DSH tool message. */
function toolResultBlock(message: unknown): Record<string, unknown> | undefined {
  const content = recordOrUndefined(message)?.content
  if (!Array.isArray(content)) return undefined
  for (const block of content) {
    const item = recordOrUndefined(block)
    if (item?.type === 'tool-result') return item
  }
  return undefined
}

/** Assert a JSON-like object at a durable event field. */
function record(value: unknown): Record<string, unknown> {
  const found = recordOrUndefined(value)
  if (found === undefined) throw new Error('receipt event field must be an object')
  return found
}

/** Narrow an unknown value to an object without trusting prototypes. */
function recordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Read a required finite numeric event field. */
function numberField(value: Record<string, unknown>, key: string): number {
  const found = value[key]
  if (typeof found !== 'number' || !Number.isFinite(found)) {
    throw new Error(`receipt event field "${key}" must be a finite number`)
  }
  return found
}

/** Read a required string event field. */
function stringField(value: Record<string, unknown>, key: string): string {
  const found = value[key]
  if (typeof found !== 'string') throw new Error(`receipt event field "${key}" must be a string`)
  return found
}

/** Format a SHA-256 digest with its algorithm name. */
function digest(input: string): string {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`
}
