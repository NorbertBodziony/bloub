import {
  BloubBot,
  BotEngine,
  SEQUENCE,
  STATES,
  STATE_BY_ID,
  defaultCycle,
  totalDuration
} from '@norbert_bodziony/bloub'
import {
  DEFAULT_TRANSITION,
  PLUSH_CHARACTERS,
  PLUSH_SHAPES,
  PLUSH_STATES,
  PLUSH_TRANSITIONS,
  PlushBot,
  tintRamp
} from '@norbert_bodziony/bloub/plush'

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

const cycle = defaultCycle().blocks
invariant(typeof BloubBot === 'function', 'BloubBot is not exported')
invariant(cycle.length === 14, `Expected 14 avatar states, got ${cycle.length}`)
invariant(cycle.map((block) => block.state).join() === SEQUENCE.join(), 'Default cycle changed')
invariant(STATES.length >= cycle.length, 'The state catalogue is incomplete')
invariant(cycle.every((block) => STATE_BY_ID.has(block.state)), 'A transition state is missing')
invariant(totalDuration(cycle) > 0, 'The default cycle has no duration')

const engine = new BotEngine()
let seconds = 0
for (const block of cycle) {
  engine.setState(block.state, seconds)
  const frame = engine.sample(seconds + block.duration / 2)
  invariant(frame.bodyPath.length > 100, `State ${block.state} has no rendered body`)
  seconds += block.duration
}

invariant(typeof PlushBot === 'function', 'PlushBot is not exported')
invariant(PLUSH_CHARACTERS.length === 6, `Expected 6 plush characters, got ${PLUSH_CHARACTERS.length}`)
invariant(PLUSH_SHAPES.length === 11, `Expected 11 plush shapes, got ${PLUSH_SHAPES.length}`)
invariant(PLUSH_STATES.join() === 'idle,wink,wide,thinking,notify', 'Plush states changed')
invariant(DEFAULT_TRANSITION === 'flip', `Expected the flip by default, got ${DEFAULT_TRANSITION}`)
invariant(PLUSH_TRANSITIONS.join() === 'flip,pop,warp,dissolve,cut', 'Plush transitions changed')
invariant(tintRamp('#3b93f0').length === 768, 'tintRamp is not a 256-colour ramp')

console.log(`bloub package runtime: ${cycle.length} states, ${seconds.toFixed(1)} seconds`)
