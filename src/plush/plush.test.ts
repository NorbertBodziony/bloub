import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BotEngine, type BotFrame, type Look } from '../bot/engine'
import { DEFAULT_EXPRESSION, EXPRESSIONS, EXPRESSION_BY_ID, type BotExpression } from '../bot/expressions'
import { SHAPES, SHAPE_BY_ID } from '../bot/skins'
import { dotPulse, STATE_BY_ID } from '../bot/states'
import { ASSET_URLS } from './assets'
import {
  BALL,
  GENERIC_PAD,
  PLUSH_CHARACTERS,
  PLUSH_SHAPES,
  PLUSH_STATES,
  shapeBody,
  type PlushState
} from './catalogue'
import {
  NO_DOTS,
  REST_LOOK,
  THINK_LOOK,
  dotsToggle,
  dotsVisibility,
  engineState,
  glide,
  morphOf,
  thinkingDots,
  type DotsTrack
} from './motion'
import { GRIS, parseHex, tintRamp } from './tint'

const fichier = (nom: string) => fileURLToPath(new URL(`./assets/${nom}`, import.meta.url))

describe('catalogue', () => {
  it('a un corps gris pour chaque forme du personnaliseur', () => {
    expect([...PLUSH_SHAPES].sort()).toEqual(SHAPES.map((s) => s.id).sort())
    for (const shape of PLUSH_SHAPES) {
      expect(existsSync(fichier(shapeBody(shape))), shapeBody(shape)).toBe(true)
      expect(ASSET_URLS[shapeBody(shape)], shapeBody(shape)).toBeTruthy()
    }
    expect(existsSync(fichier(BALL))).toBe(true)
  })

  it('donne a chaque personnage un corps, deux patins et un visage', () => {
    for (const c of PLUSH_CHARACTERS) {
      expect(SHAPE_BY_ID.has(c.shape), c.id).toBe(true)
      expect(c.ink).toMatch(/^#[0-9a-f]{6}$/)
      for (const nom of [c.body, ...c.pads.map((p) => p.file)]) {
        expect(existsSync(fichier(nom)), nom).toBe(true)
        expect(ASSET_URLS[nom], nom).toBeTruthy()
      }
      for (const p of c.pads) {
        for (const v of [p.kw, p.kh]) expect(v > 0 && Number.isFinite(v), `${c.id} ${p.file}`).toBe(true)
      }
      expect(c.face.eyes).toHaveLength(2)
      // un visage de personnage n'est pas au catalogue des expressions : cf. `catalogue.ts`
      expect(EXPRESSIONS.some((e) => e.id === c.face.id)).toBe(false)
    }
    expect(GENERIC_PAD.dx).toBe(0)
    expect(GENERIC_PAD.dy).toBe(0)
  })

  it('ne garde que les etats qui gardent le corps', () => {
    for (const s of PLUSH_STATES) {
      const def = STATE_BY_ID.get(engineState(s))!
      expect(def.baseBody, s).toBe(true)
    }
  })
})

describe('durees', () => {
  it('sont celles des etats du moteur', () => {
    for (const s of PLUSH_STATES) expect(morphOf(s)).toBe(STATE_BY_ID.get(s)!.morph)
  })

  it('le regard arrive pile a la fin du morph, et pas avant', () => {
    const g = glide(REST_LOOK, THINK_LOOK, morphOf('thinking'))
    expect(g(morphOf('thinking'))).toEqual(THINK_LOOK)
    expect(g(morphOf('thinking') * 0.5).pitch).toBeLessThan(THINK_LOOK.pitch)
    expect(g(0)).toEqual(REST_LOOK)
  })

  it('les points pulsent avec la fonction de `thinking`', () => {
    const track: DotsTrack = { ...NO_DOTS, phase: 2, at: 2, from: 0, on: true }
    // une fois sortis (0,3 s), la pulsation est periodique de 1,5 s, comme dans le moteur
    for (let t = 3; t < 6; t += 0.05) {
      const a = thinkingDots(track, t)
      const b = thinkingDots(track, t + 1.5)
      a.forEach((d, i) => {
        expect(b[i]!.r).toBeCloseTo(d.r, 9)
        expect(d.opacity).toBeCloseTo(0.55 + 0.45 * dotPulse(t - 2, i), 9)
      })
    }
    expect(dotsVisibility(track, 2.3)).toBe(1)
  })
})

/*
 * Ce que fait `PlushBot` au moteur, sans DOM : l'etat et l'expression par les setters dates,
 * le regard par un script applique a chaque image (rattrapage d'1/60 s, comme le composant).
 */
interface Changement {
  t: number
  state?: PlushState
  expression?: BotExpression
}

function joue(radii: number[] | null, face: BotExpression, changements: Changement[], fin: number, pas = 1 / 240) {
  const engine = new BotEngine(100, 'idle', radii, face)
  let rendu: Look = REST_LOOK
  let script = glide(REST_LOOK, REST_LOOK, 1)
  let depuis = 0
  let points: DotsTrack = NO_DOTS
  let i = 0
  const images: { t: number; frame: BotFrame; points: ReturnType<typeof thinkingDots> }[] = []
  for (let t = 0; t <= fin; t += pas) {
    while (i < changements.length && changements[i]!.t <= t + 1e-9) {
      const c = changements[i++]!
      if (c.state) {
        engine.setState(engineState(c.state), c.t)
        script = glide(rendu, c.state === 'thinking' ? THINK_LOOK : REST_LOOK, morphOf(c.state))
        depuis = c.t
        points = dotsToggle(points, c.state === 'thinking', c.t, c.state)
      }
      if (c.expression) engine.setExpression(c.expression, c.t)
    }
    rendu = script(t - depuis)
    engine.setLook(rendu, t, 1 / 60)
    images.push({ t, frame: engine.sample(t), points: thinkingDots(points, t) })
  }
  return images
}

const oeil = (f: BotFrame) =>
  f.eyes.flatMap((e) => {
    const n = e.matrix.slice(7, -1).split(',').map(Number)
    return [n[4]!, n[5]!, e.w, e.h, e.alpha * 100]
  })

/** Le pire pas d'une image a la suivante : yeux (px), opacite et rayon des points. */
function pirePas(images: ReturnType<typeof joue>) {
  let yeux = 0
  let points = 0
  for (let k = 1; k < images.length; k++) {
    const a = oeil(images[k - 1]!.frame)
    const b = oeil(images[k]!.frame)
    if (a.length === b.length) yeux = Math.max(yeux, ...a.map((v, j) => Math.abs(v - b[j]!)))
    const pa = images[k - 1]!.points
    const pb = images[k]!.points
    for (let j = 0; j < 3; j++) {
      const da = pa[j] ?? { opacity: 0, r: 0 }
      const db = pb[j] ?? { opacity: 0, r: 0 }
      points = Math.max(points, Math.abs(da.opacity - db.opacity), Math.abs(da.r - db.r) * 10)
    }
  }
  return { yeux, points }
}

describe('transitions', () => {
  // le visage de depart de `PlushBot` pour une forme : jamais nul, cf. le composant
  const NEUTRE = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!
  const VISAGES: BotExpression[] = [...EXPRESSIONS, ...PLUSH_CHARACTERS.map((c) => c.face)]

  /**
   * Reference : chaque paire d'etats et chaque paire de visages, ESPACEES, sur la forme
   * jouee. C'est le mouvement normal, celui des morphs du moteur (wide -> wink, blase ->
   * neutre sont les plus raides) ; un changement en plein fondu ne doit pas aller plus
   * vite que lui.
   */
  const references = new Map<string, { yeux: number; points: number }>()
  const reference = (shape: string) => {
    const deja = references.get(shape)
    if (deja) return deja
    let pire = { yeux: 0, points: 0 }
    const garde = (p: { yeux: number; points: number }) => {
      pire = { yeux: Math.max(pire.yeux, p.yeux), points: Math.max(pire.points, p.points) }
    }
    const radii = SHAPE_BY_ID.get(shape)!.radii
    for (const a of PLUSH_STATES) {
      for (const b of PLUSH_STATES) garde(pirePas(joue(radii, NEUTRE, [{ t: 1, state: a }, { t: 2.5, state: b }], 4)))
    }
    // le moteur part du visage `a` : on ne simule que le morph vers `b`
    for (const a of VISAGES) {
      for (const b of VISAGES) garde(pirePas(joue(radii, a, [{ t: 0.1, expression: b }], 0.6)))
    }
    references.set(shape, pire)
    return pire
  }

  it('la reference est un mouvement, pas un saut', { timeout: 20_000 }, () => {
    // a 240 images/s, un morph de 0,3 s au plus raide ne fait que quelques px par image
    const r = reference('capsule')
    expect(r.yeux).toBeGreaterThan(0.1)
    expect(r.yeux).toBeLessThan(8)
  })

  /** Generateur reproductible : le meme tirage a chaque execution. */
  function hasard(graine: number) {
    let s = graine
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  }

  it('aucun changement, meme en plein fondu, ne va plus vite que la reference', { timeout: 60_000 }, () => {
    const tirage = hasard(7)
    for (const shape of ['cercle', 'capsule', 'triangle', 'nuage', 'losange'] as const) {
      const radii = SHAPE_BY_ID.get(shape)!.radii
      for (let essai = 0; essai < 6; essai++) {
        const changements: Changement[] = []
        let t = 0.5
        for (let n = 0; n < 14; n++) {
          // la moitie des changements tombe en plein fondu (< 0,3 s, le plus court morph)
          t += tirage() < 0.5 ? 0.02 + tirage() * 0.25 : 0.6 + tirage() * 0.6
          changements.push(
            tirage() < 0.5
              ? { t, state: PLUSH_STATES[Math.floor(tirage() * PLUSH_STATES.length)]! }
              : { t, expression: VISAGES[Math.floor(tirage() * VISAGES.length)]! }
          )
        }
        const p = pirePas(joue(radii, NEUTRE, changements, t + 1))
        const dit = `${shape} essai ${essai}`
        expect(p.yeux, dit).toBeLessThanOrEqual(reference(shape).yeux * 1.05)
        expect(p.points, dit).toBeLessThanOrEqual(reference(shape).points * 1.05 + 1e-9)
      }
    }
  })

  it('un aller-retour rapide dans `thinking` ne fait sauter ni les points ni la pulsation', () => {
    const images = joue(null, NEUTRE, [{ t: 1, state: 'thinking' }, { t: 1.1, state: 'idle' }, { t: 1.15, state: 'thinking' }], 3)
    expect(pirePas(images).points).toBeLessThanOrEqual(reference('cercle').points * 1.05)
  })
})

describe('teinte', () => {
  it('rend la couleur demandee sur la mediane du gris', () => {
    for (const hex of ['#3b93f0', '#e45206', '#22c377', '#0a0a0c', '#f1efe9']) {
      const ramp = tintRamp(hex)
      const g = Math.round(GRIS * 255)
      const [r, v, b] = parseHex(hex)
      // la mediane tombe a un demi-pas de gris pres : on tolere l'arrondi de ce pas
      expect(Math.abs(ramp[g * 3]! - r)).toBeLessThanOrEqual(2)
      expect(Math.abs(ramp[g * 3 + 1]! - v)).toBeLessThanOrEqual(2)
      expect(Math.abs(ramp[g * 3 + 2]! - b)).toBeLessThanOrEqual(2)
    }
  })

  it('assombrit les creux et eclaircit les fibres', () => {
    const ramp = tintRamp('#3b93f0')
    const l = (g: number) => ramp[g * 3]! + ramp[g * 3 + 1]! + ramp[g * 3 + 2]!
    for (let g = 1; g < 256; g++) expect(l(g)).toBeGreaterThanOrEqual(l(g - 1))
    expect(l(0)).toBe(0)
  })
})
