/*
 * `@norbert_bodziony/bloub/plush` : le bot en peluche de feutre. Entree a part, pour que
 * son code et ses images restent hors du bundle de ceux qui n'en veulent pas.
 */
export { default as PlushBot } from './PlushBot.js'
export type { PlushBotProps } from './PlushBot.js'
export {
  PLUSH_CHARACTERS,
  PLUSH_CHARACTER_BY_ID,
  PLUSH_SHAPES,
  PLUSH_STATES,
  type PlushCharacter,
  type PlushCharacterId,
  type PlushShapeId,
  type PlushState
} from './catalogue.js'
export { tintRamp } from './tint.js'
export { DEFAULT_TRANSITION, PLUSH_TRANSITIONS, type PlushTransition } from './transition.js'
