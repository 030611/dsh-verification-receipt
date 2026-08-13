import { performance } from 'node:perf_hooks'
import { createReceipt } from '../lib/index.js'

const CALLS = 10_000
const events = [{ type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } }]
for (let index = 0; index < CALLS; index++) {
  const callSeq = events.length
  events.push({
    type: 'tool/call',
    seq: callSeq,
    time: callSeq,
    data: {
      turn: 1,
      step: 1,
      callId: `call-${index}`,
      name: 'bash',
      arguments: '{"command":"pnpm test"}',
    },
  })
  const resultSeq = events.length
  events.push({
    type: 'tool/result',
    seq: resultSeq,
    time: resultSeq,
    data: {
      turn: 1,
      step: 1,
      message: {
        content: [{
          type: 'tool-result',
          toolCallId: `call-${index}`,
          content: [{ type: 'text', text: 'ok\n[exit code: 0]' }],
          isError: false,
        }],
      },
    },
  })
}
const end = {
  type: 'turn/end',
  seq: events.length,
  time: events.length,
  data: { turn: 1, reason: { kind: 'completed' } },
}
events.push(end)

const started = performance.now()
const receipt = createReceipt({ id: 'performance-smoke', events }, end)
const elapsed = performance.now() - started
if (receipt.tools.calls !== CALLS || receipt.verificationSignals.length !== CALLS) {
  throw new Error('performance projection produced the wrong summary')
}
console.log(`performance-smoke: ${events.length} events, ${CALLS} calls, ${elapsed.toFixed(1)} ms`)
