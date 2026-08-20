import { createSignal } from 'solid-js'
import {
  BloubBot,
  BotEngine,
  defaultCycle,
  type BloubBotRef,
  type StateId
} from '@norbert_bodziony/bloub'

const [playing, setPlaying] = createSignal(false)
let bot: BloubBotRef | undefined
const state: StateId = 'orbit'

export const packageConsumer = (
  <BloubBot
    ref={(value) => { bot = value }}
    state={state}
    cycle={defaultCycle().blocks}
    playing={playing()}
    onPlayingChange={setPlaying}
  />
)

export const frame = new BotEngine().sample(0)
export const controller = () => bot
