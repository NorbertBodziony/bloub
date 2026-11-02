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

// la peluche, par son sous-chemin : props typees, catalogues exportes
import { PLUSH_CHARACTERS, PLUSH_SHAPES, PlushBot, type PlushState } from '@norbert_bodziony/bloub/plush'

const plushState: PlushState = 'thinking'
export const plushConsumer = (
  <>
    <PlushBot character={PLUSH_CHARACTERS[0]!.id} state={plushState} expression="heureux" size={96} />
    <PlushBot shape={PLUSH_SHAPES[0]!} color="#3b93f0" state="wink" />
  </>
)
