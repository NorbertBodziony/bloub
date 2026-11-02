/*
 * Exporte la geometrie 2D des six personnages pour le recalage (`fit/compose2.py`,
 * `fit/relief.py`). Rien n'est redessine ici : contour et yeux sont ceux que rend le
 * moteur, a l'instant ou les yeux sont le plus ouverts.
 *
 *   bun tools/peluche/export-bots.ts > /tmp/peluche/bots.json
 */
import { BotEngine } from '../../src/bot/engine.js'
import { SHAPE_BY_ID } from '../../src/bot/skins.js'
import { PLUSH_CHARACTERS } from '../../src/plush/catalogue.js'
import { contour, instantOuvert, matrice } from './geometrie.js'

const R = 100

const sortie = PLUSH_CHARACTERS.map((bot) => {
  const radii = SHAPE_BY_ID.get(bot.shape)?.radii ?? null
  const engine = new BotEngine(R, 'idle', radii, bot.face)
  const { yaw, pitch } = bot.face.gaze
  engine.setLook({ yaw, pitch, mix: 1, spin: 0, wander: 0 }, -10, 0.01)
  const frame = instantOuvert(engine)
  return {
    // les scripts de `fit/` lisent `nom` en minuscules
    nom: bot.id[0]!.toUpperCase() + bot.id.slice(1),
    encre: bot.ink,
    contour: contour(frame.bodyPath, R),
    yeux: frame.eyes.map((e, i) => {
      const cfg = bot.face.eyes[i]!
      const [a, b, c, d, x, y] = matrice(e.matrix) as [number, number, number, number, number, number]
      // en unites de rayon : la gelule fait w x h, la matrice la pose a l'ecran
      return { w: cfg.w, h: cfg.h, m: [a, b, c, d, x / R, y / R] }
    })
  }
})

console.log(JSON.stringify(sortie, null, 2))
