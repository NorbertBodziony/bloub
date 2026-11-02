import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BotEngine, type BotFrame, type Look } from '../bot/engine'
import { DEFAULT_EXPRESSION, EXPRESSIONS, EXPRESSION_BY_ID, type BotExpression } from '../bot/expressions'
import { blinkScale } from '../bot/face'
import { SHAPES, SHAPE_BY_ID } from '../bot/skins'
import { dotPulse, STATE_BY_ID } from '../bot/states'
import { ASSET_URLS } from './assets'
import {
  BALL,
  GENERIC_PAD,
  PLUSH_CHARACTERS,
  PLUSH_CHARACTER_BY_ID,
  PLUSH_SHAPES,
  PLUSH_STATES,
  shapeBody,
  type PlushPad,
  type PlushState
} from './catalogue'
import {
  ASLEEP_FACE,
  ASLEEP_LOOK,
  NO_DOTS,
  REST_LOOK,
  SHAKE,
  SHAKE_YAW,
  THINK_LOOK,
  Z_LIFE,
  dotsToggle,
  dotsVisibility,
  engineState,
  enter,
  faceGrowth,
  faceOf,
  failedPads,
  NO_PAD_FADE,
  padFadeLevel,
  padFadeToggle,
  type PadFade,
  FAILED_ASPECT,
  openEye,
  glide,
  LID_BANDS,
  LID_FRANGE,
  LID_SOFT,
  lidMask,
  restCapsule,
  unsquash,
  matrixOf,
  morphOf,
  shake,
  sleepZs,
  thinkingDots,
  type DotsTrack
} from './motion'
import { BARRE, BARRES, padPieces, type PadPiece } from './slices'
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
    const source = { asleep: 'sleep', failed: 'idle' } as const
    for (const s of PLUSH_STATES) {
      const id = s === 'asleep' || s === 'failed' ? source[s] : s
      expect(morphOf(s), s).toBe(STATE_BY_ID.get(id)!.morph)
    }
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
  // le visage demande, et celui que l'etat impose par-dessus (`asleep`, `failed`)
  let visage = face
  let impose: BotExpression | null = null
  let i = 0
  const images: { t: number; frame: BotFrame; points: ReturnType<typeof thinkingDots> }[] = []
  for (let t = 0; t <= fin; t += pas) {
    while (i < changements.length && changements[i]!.t <= t + 1e-9) {
      const c = changements[i++]!
      if (c.state) {
        engine.setState(engineState(c.state), c.t)
        script = enter(rendu, c.state)
        depuis = c.t
        points = dotsToggle(points, c.state === 'thinking', c.t, c.state)
        const avant = impose ?? visage
        impose = faceOf(c.state, face)
        if ((impose ?? visage) !== avant) engine.setExpression(impose ?? visage, c.t)
      }
      if (c.expression) {
        visage = c.expression
        if (!impose) engine.setExpression(visage, c.t)
      }
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

  it('le « non » de `failed` et l\'endormissement restent dans la reference', () => {
    for (const shape of ['cercle', 'capsule', 'triangle'] as const) {
      const radii = SHAPE_BY_ID.get(shape)!.radii
      for (const a of PLUSH_STATES) {
        for (const b of ['failed', 'asleep'] as const) {
          const p = pirePas(joue(radii, NEUTRE, [{ t: 1, state: a }, { t: 2.5, state: b }], 4))
          expect(p.yeux, `${shape} ${a} -> ${b}`).toBeLessThanOrEqual(reference(shape).yeux * 1.05)
        }
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

describe('asleep et failed', () => {
  it('gardent le corps au repos du moteur', () => {
    expect(engineState('asleep')).toBe('idle')
    expect(engineState('failed')).toBe('idle')
  })

  it('endormi : les yeux sont des tirets, et ne clignent plus', () => {
    expect(ASLEEP_FACE.eyes.every((e) => e.w > e.h * 3)).toBe(true)
    const engine = new BotEngine(100, 'idle', null, ASLEEP_FACE)
    engine.setLook(ASLEEP_LOOK, 0, 1 / 60)
    const hauteurs = new Set<string>()
    // le calendrier cligne toutes les 1,9 a 4,6 s : 20 s en voient plusieurs
    for (let t = 0.1; t < 20; t += 1 / 120) {
      for (const e of engine.sample(t).eyes) {
        const n = e.matrix.slice(7, -1).split(',').map(Number)
        hauteurs.add(Math.hypot(n[2]!, n[3]!).toFixed(2))
      }
    }
    // la derive fait varier le raccourci de la tete, pas le clignement : a peine
    const valeurs = [...hauteurs].map(Number)
    expect(Math.min(...valeurs) / Math.max(...valeurs)).toBeGreaterThan(0.85)
  })

  it('sans `blink`, le regard rend la meme image qu\'avant, a l\'octet pres', () => {
    const a = new BotEngine(100, 'idle', null, null)
    const b = new BotEngine(100, 'idle', null, null)
    a.setLook(REST_LOOK, 0)
    b.setLook({ ...REST_LOOK, blink: 1 }, 0)
    for (let t = 0; t < 12; t += 0.01) expect(JSON.stringify(b.sample(t))).toBe(JSON.stringify(a.sample(t)))
  })

  it('failed : un « non » qui part et finit a zero', () => {
    expect(shake(0)).toBe(0)
    expect(shake(SHAKE)).toBe(0)
    let pire = 0
    for (let t = 0; t < SHAKE; t += 0.005) pire = Math.max(pire, Math.abs(shake(t)))
    expect(pire).toBeGreaterThan(SHAKE_YAW * 0.6)
    expect(pire).toBeLessThanOrEqual(SHAKE_YAW)
    // sans « non », le script est le simple glissement
    const g = enter(REST_LOOK, 'failed')
    expect(g(SHAKE + 1)).toEqual(glide(REST_LOOK, REST_LOOK, morphOf('failed'))(SHAKE + 1))
  })

  it("le visage de failed garde la gelule de la peluche : les patins ne s'etirent pas", () => {
    const triste = EXPRESSION_BY_ID.get('triste')!
    const bases = [...PLUSH_CHARACTERS.map((c) => c.face), EXPRESSION_BY_ID.get('neutre')!]
    for (const base of bases) {
      const face = faceOf('failed', base)!
      const source = base.eyes[openEye(base)]
      expect(face).toBe(faceOf('failed', base))
      expect(face.split).toBe(base.split)
      expect(face.gaze).toEqual(triste.gaze)
      face.eyes.forEach((eye, i) => {
        // la largeur de l'oeil d'origine ; la hauteur aussi, sauf un oeil rond, aplati
        expect(eye.w).toBe(source.w)
        const rond = source.w / source.h > 0.6 && source.w / source.h < 1.7
        expect(eye.h).toBeCloseTo(rond ? source.w / FAILED_ASPECT : source.h, 12)
        // et l'inclinaison se voit (la regle d'expressions.test.ts pour 20° et plus)
        expect(eye.w / eye.h < 0.6 || eye.w / eye.h > 1.7).toBe(true)
        expect(eye.tilt).toBe(triste.eyes[i]!.tilt)
        expect(source.w * source.h).toBeGreaterThanOrEqual(base.eyes[i]!.w * base.eyes[i]!.h)
      })
    }
    // les patins suivent : celui de l'oeil choisi, a la place de chaque oeil
    for (const c of PLUSH_CHARACTERS) {
      const [a, b] = failedPads(c.pads, c.face)
      const p = c.pads[openEye(c.face)]
      expect([a.file, b.file]).toEqual([p.file, p.file])
      expect([a.dx, b.dx]).toEqual([c.pads[0].dx, c.pads[1].dx])
    }
  })

  it("le patin change en fondu, sans saut, meme interrompu", () => {
    const vita = PLUSH_CHARACTER_BY_ID.get('vita')!
    const propres = vita.pads
    const tristes = failedPads(propres, vita.face)
    expect(tristes[1].file).not.toBe(propres[1].file)
    // entree a 1 s, sortie a 1,15 s (en plein fondu), entree a 1,2 s
    const bascules: [number, readonly [PlushPad, PlushPad]][] = [
      [1, propres],
      [1.15, tristes],
      [1.2, propres]
    ]
    let fade: PadFade = NO_PAD_FADE
    let courants: readonly [PlushPad, PlushPad] = propres
    // opacite visible du patin `propres` de l'oeil 1
    const propre = (t: number) => {
      const v = padFadeLevel(fade, t)
      return courants === propres ? v : fade.from === propres ? 1 - v : 0
    }
    let avant = propre(0)
    let j = 0
    let pire = 0
    for (let t = 0; t < 2.5; t += 1 / 240) {
      while (j < bascules.length && bascules[j]![0] <= t) {
        const [at, depuis] = bascules[j++]!
        fade = padFadeToggle(fade, depuis, at)
        courants = depuis === propres ? tristes : propres
      }
      const v = propre(t)
      pire = Math.max(pire, Math.abs(v - avant))
      avant = v
    }
    // la pente la plus raide d'un easeOutQuint sur SHAPE_MORPH, a 240 images/s
    expect(pire).toBeLessThanOrEqual(5 / (BotEngine.SHAPE_MORPH * 240) + 1e-9)
    expect(propre(2.5)).toBe(0)
  })

  it('les « z » montent, restent dans le cadre et reviennent sans saut', () => {
    const track: DotsTrack = { ...NO_DOTS, phase: 0, at: 0, from: 1, on: true }
    let precedents = sleepZs(track, 0)
    for (let t = 1 / 240; t < Z_LIFE * 2; t += 1 / 240) {
      const zs = sleepZs(track, t)
      for (const z of zs) {
        // le viewBox va de -1,58 a 1,58 rayon : le « z » y tient tout entier
        expect(Math.abs(z.x) + z.size / 2 + 0.05).toBeLessThan(1.58)
        expect(Math.abs(z.y) + z.size / 2 + 0.05).toBeLessThan(1.58)
      }
      // l'opacite totale ne saute pas d'une image a l'autre
      const somme = (l: typeof zs) => l.reduce((a, z) => a + z.opacity, 0)
      expect(Math.abs(somme(zs) - somme(precedents))).toBeLessThan(0.05)
      precedents = zs
    }
    // periodiques, de la vie d'un « z »
    const a = sleepZs(track, 7.3)
    const b = sleepZs(track, 7.3 + Z_LIFE)
    expect(b).toHaveLength(a.length)
    a.forEach((z, i) => {
      for (const k of ['x', 'y', 'size', 'opacity'] as const) expect(b[i]![k]).toBeCloseTo(z[k], 9)
    })
  })

  it('eyeScale fait grandir le visage depuis son bord exterieur, ecart compris', () => {
    const e = new BotEngine(100, 'idle', SHAPE_BY_ID.get('squircle')!.radii, EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!)
    const oeil = (m: number[], w: number, h: number) => ({ m, w, h })
    const nombres = (s: string) => (s.match(/-?[\d.]+/g) ?? []).map(Number)
    for (let t = 0.5; t < 12; t += 0.37) {
      const yeux = e.sample(t).eyes.map((y) => oeil(nombres(y.matrix), y.w, y.h))
      if (yeux.length < 2) continue
      // a 1, rien ne bouge
      expect(faceGrowth(yeux, 1)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }])

      const k = 1.35
      const d = faceGrowth(yeux, k)
      const [a, b] = yeux as [ReturnType<typeof oeil>, ReturnType<typeof oeil>]
      const centre = (o: ReturnType<typeof oeil>, i: number) => ({ x: o.m[4]! + d[i]!.x, y: o.m[5]! + d[i]!.y })
      // l'ecart entre les yeux grandit comme les yeux : ils ne se soudent pas
      const ecart0 = Math.hypot(a.m[4]! - b.m[4]!, a.m[5]! - b.m[5]!)
      const ca = centre(a, 0)
      const cb = centre(b, 1)
      expect(Math.hypot(ca.x - cb.x, ca.y - cb.y)).toBeCloseTo(k * ecart0, 6)

      // le point le plus exterieur du visage, dans la direction du visage, ne bouge pas
      const fx = (a.m[4]! + b.m[4]!) / 2
      const fy = (a.m[5]! + b.m[5]!) / 2
      const n = Math.hypot(fx, fy)
      const ux = fx / n
      const uy = fy / n
      const bord = (o: ReturnType<typeof oeil>, c: { x: number; y: number }, s: number) => {
        const [m0, m1, m2, m3] = o.m as [number, number, number, number]
        return c.x * ux + c.y * uy + s * Math.hypot((o.w / 2) * (m0 * ux + m1 * uy), (o.h / 2) * (m2 * ux + m3 * uy))
      }
      const avant = Math.max(bord(a, { x: a.m[4]!, y: a.m[5]! }, 1), bord(b, { x: b.m[4]!, y: b.m[5]! }, 1))
      const apres = Math.max(bord(a, ca, k), bord(b, cb, k))
      expect(apres).toBeCloseTo(avant, 6)
    }
  })
})

describe('morceaux du patin', () => {
  const R = 100
  const patins = [GENERIC_PAD, ...PLUSH_CHARACTERS.flatMap((c) => c.pads)]
  // les gelules de toutes les expressions et de tous les visages, en px, et un clignement
  const cibles = [...EXPRESSIONS, ...PLUSH_CHARACTERS.map((c) => c.face)]
    .flatMap((e) => e.eyes.map((o) => [o.w * R, o.h * R] as const))
    .flatMap(([w, h]) => [[w, h], [w, h * 0.05]] as const)

  const dans = (m: PadPiece, x: number, y: number) => x > m.x && x < m.x + m.w && y > m.y && y < m.y + m.h
  /** ce que montre (x, y) : le morceau et le point de son image (0 a 1) */
  const source = (ms: PadPiece[], x: number, y: number) => {
    const sur = ms.filter((m) => dans(m, x, y))
    if (sur.length !== 1) return { n: sur.length }
    const m = sur[0]!
    const [vx, vy, vw, vh] = m.viewBox.split(' ').map(Number) as [number, number, number, number]
    return { n: 1, m, sx: vx + ((x - m.x) / m.w) * vw, sy: vy + ((y - m.y) / m.h) * vh }
  }
  const etendue = (ms: PadPiece[]): number[] => [
    Math.min(...ms.map((m) => m.x)),
    Math.max(...ms.map((m) => m.x + m.w)),
    Math.min(...ms.map((m) => m.y)),
    Math.max(...ms.map((m) => m.y + m.h))
  ]

  it('sur une gelule ronde, deux moities : la gelule couchee sans sa partie droite', () => {
    for (const p of patins) {
      for (const c of [p.court * R, 37]) {
        const ms = padPieces(p, c, c)
        const Sx = p.kw * c
        const T = Sx + 2 * BARRE * c
        const attendu = [
          ['x', -Sx / 2, (-p.kh * c) / 2, Sx / 2, p.kh * c, 0, 0, Sx / 2 / T, 1],
          ['x', 0, (-p.kh * c) / 2, Sx / 2, p.kh * c, (T - Sx / 2) / T, 0, Sx / 2 / T, 1]
        ] as const
        expect(ms).toHaveLength(2)
        ms.forEach((m, i) => {
          const [src, ...v] = attendu[i]!
          expect(m.src).toBe(src)
          const vu = [m.x, m.y, m.w, m.h, ...m.viewBox.split(' ').map(Number)]
          v.forEach((x, j) => expect(vu[j]).toBeCloseTo(x, 9))
        })
      }
    }
  })

  it('sur toute gelule : une echelle, ni trou ni recouvrement, et rien ne saute aux coupes', () => {
    for (const p of patins) {
      for (const [w, h] of cibles) {
        const ms = padPieces(p, w, h)
        const court = Math.min(w, h)
        const surX = w >= h
        const e = (Math.max(w, h) - court) / 2
        const Sa = (surX ? p.kw : p.kh) * court
        const L = BARRE * court
        const T = Sa + 2 * L
        const [x0, x1, y0, y1] = etendue(ms) as [number, number, number, number]
        // le patin rond a l'echelle du petit cote, ecarte de 2 e le long de l'axe long
        expect(x1 - x0).toBeCloseTo(p.kw * court + (surX ? 2 * e : 0), 6)
        expect(y1 - y0).toBeCloseTo(p.kh * court + (surX ? 0 : 2 * e), 6)
        expect(ms.length).toBeLessThanOrEqual(2 + 2 * BARRES)
        for (const m of ms) {
          expect(m.src).toBe(surX ? 'x' : 'y')
          // a l'echelle u, sauf au-dela de `BARRES` troncons : la, seule la partie droite s'etire
          const [, , vw, vh] = m.viewBox.split(' ').map(Number) as [number, number, number, number]
          const k = (surX ? m.w / vw : m.h / vh) / T
          if (e <= BARRES * L) expect(k).toBeCloseTo(1, 9)
          else expect([1, e / BARRES / L].some((v) => Math.abs(k - v) < 1e-9)).toBe(true)
        }
        // une grille : chaque point couvert une fois, et en travers, l'image a l'echelle du rond
        for (let i = 1; i < 24; i++) {
          for (let j = 1; j < 24; j++) {
            const x = x0 + ((x1 - x0) * (i + 0.37)) / 24.5
            const y = y0 + ((y1 - y0) * (j + 0.61)) / 24.5
            const s = source(ms, x, y)
            expect(s.n).toBe(1)
            if (surX) expect(s.sy).toBeCloseTo((y - y0) / (y1 - y0), 9)
            else expect(s.sx).toBeCloseTo((x - x0) / (x1 - x0), 9)
          }
        }
        // ce qu'une colonne de l'image montre : la partie droite a la meme matiere a `r` de ses
        // deux bouts (elle est symetrique), et partout la meme lumiere
        const le = (v: number): [string, number] => {
          const c = v * T - Sa / 2
          return c < -1e-6 * court || c > 2 * L + 1e-6 * court ? ['bout', v] : ['droite', Math.min(c, 2 * L - c) / court]
        }
        // de part et d'autre de chaque coupe, la meme colonne de feutre ; jamais au bord d'une image
        const d = 1e-7 * court
        for (const m of ms) {
          const [vx, vy, vw, vh] = m.viewBox.split(' ').map(Number) as [number, number, number, number]
          const [v0, v1] = surX ? [vx, vx + vw] : [vy, vy + vh]
          const a = surX ? m.x + m.w : m.y + m.h
          if (a >= (surX ? x1 : y1) - 1e-9) {
            expect(v1).toBeCloseTo(1, 9)
            continue
          }
          expect(v0 > 1e-6 || (surX ? m.x : m.y) <= (surX ? x0 : y0) + 1e-9).toBe(true)
          expect(v1).toBeLessThan(1 - 1e-6)
          const [gx, gy, dx, dy] = surX ? [a - d, 0, a + d, 0] : [0, a - d, 0, a + d]
          const g = source(ms, gx, gy)
          const dr = source(ms, dx, dy)
          const [kg, vg] = le(surX ? g.sx! : g.sy!)
          const [kd, vd] = le(surX ? dr.sx! : dr.sy!)
          expect(kg, `${p.file} ${w}x${h} a ${a}`).toBe(kd)
          expect(Math.abs(vg - vd), `${p.file} ${w}x${h} a ${a}`).toBeLessThan(1e-5)
        }
      }
    }
  })

  it("un morph d'expression ne fait rien sauter", () => {
    for (const p of patins) {
      const c = p.court * R
      for (const [w1, h1] of cibles) {
        const N = 100
        let avant = etendue(padPieces(p, c, c))
        for (let k = 1; k <= N; k++) {
          const w = c + ((w1 - c) * k) / N
          const h = c + ((h1 - c) * k) / N
          const apres = etendue(padPieces(p, w, h))
          const pas = Math.max(Math.abs(w1 - c), Math.abs(h1 - c)) / N
          for (let i = 0; i < 4; i++) expect(Math.abs(apres[i]! - avant[i]!)).toBeLessThan(2 * pas * Math.max(p.kw, p.kh) + 1e-9)
          avant = apres
        }
      }
    }
  })

  /** largeur et hauteur d'un webp, lues dans son en-tete */
  const dimensions = (nom: string): [number, number] => {
    const b = readFileSync(fichier(nom))
    const type = b.toString('ascii', 12, 16)
    if (type === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    if (type === 'VP8L') {
      const v = b.readUInt32LE(21)
      return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]
    }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  }

  it('chaque image a le cadre que lui donne le catalogue, au pixel pres', () => {
    for (const p of patins) {
      // le patin rond allonge de deux troncons, le long de l'un ou l'autre axe
      expect(p.file).toBe(p.images.x)
      for (const [nom, fw, fh] of [
        [p.images.x, p.kw + 2 * BARRE, p.kh],
        [p.images.y, p.kw, p.kh + 2 * BARRE]
      ] as const) {
        expect(existsSync(fichier(nom)), nom).toBe(true)
        expect(ASSET_URLS[nom], nom).toBeTruthy()
        const [W, H] = dimensions(nom)
        expect(Math.abs(fw / fh - W / H) * H, nom).toBeLessThan(1)
      }
    }
  })
})

describe('paupieres du patin', () => {
  const mul = (a: readonly number[], b: readonly number[]) => [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!
  ]
  // des matrices d'oeil : inclinaison, raccourci de la tete, ecrasement vertical a l'ecran
  const oeil = (tilt: number, ax: number, ay: number, k: number) => {
    const t = (tilt * Math.PI) / 180
    const L0 = mul([ax, 0, 0, ay], [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t)])
    return mul([1, 0, 0, k], L0)
  }

  // la gelule de l'oeil et l'etendue de son image (frange et ombre comprises), en demi-tailles
  const G = { x: 12, y: 2 }
  const I = { x: 20, y: 8 }

  it("ouvert, rien : ni masque ni correction, l'image d'avant", () => {
    expect(lidMask(oeil(28, 0.9, 1.05, 1), 1, 1, G, I)).toBeNull()
    expect(unsquash(oeil(28, 0.9, 1.05, 1), 1)).toBeUndefined()
  })

  it("le patin garde sa forme : sous la correction, la matrice est celle de l'oeil ouvert", () => {
    for (const tilt of [-35, -26, 0, 3, 17, 28, 35]) {
      for (const [ax, ay] of [[1, 1], [0.86, 1.04], [1.1, 0.93]] as const) {
        const L0 = oeil(tilt, ax, ay, 1)
        for (const k of [0.06, 0.2, 0.455, 0.8, 0.999]) {
          const L = oeil(tilt, ax, ay, k)
          const C = matrixOf(unsquash([...L, 3, -4], k)!)
          expect(C.slice(4)).toEqual([0, 0])
          mul(L, C).forEach((v, i) => expect(v).toBeCloseTo(L0[i]!, 9))
        }
      }
    }
  })

  // la gelule de demi-taille (w, h) et de rayon r contient-elle le point (x, y) ?
  const dedans = (b: { w: number; h: number; r: number }, x: number, y: number) =>
    Math.hypot(Math.max(0, Math.abs(x) - (b.w - b.r)), Math.max(0, Math.abs(y) - (b.h - b.r))) <= b.r + 1e-6

  it("l'ouverture suit le clignement : toute l'image a l'ouvert, rien a l'oeil ferme, sans saut", () => {
    const pose = (k: number) => lidMask([...oeil(17, 0.9, 1.05, k), 3, -4], k, 1, G, I)!
    // centree sur l'oeil
    expect([pose(0.5).x, pose(0.5).y]).toEqual([3, -4])
    // presque ouvert : pas d'ecrasement, et l'ouverture pleine couvre toute l'image, coins compris
    const ouvert = pose(1 - 1e-9)
    expect(ouvert.s).toBeCloseTo(1, 6)
    const coeur = ouvert.bands.at(-1)!
    expect(coeur.alpha).toBe(1)
    expect(dedans(coeur, I.x, I.y)).toBe(true)
    // ferme : ecrasee a rien
    expect(pose(blinkScale(0)).s).toBe(0)
    // en chemin, c'est la gelule de l'oeil et sa frange : la marge de l'image est partie la premiere
    const frange = LID_FRANGE * 2 * Math.min(G.x, G.y)
    const mi = pose(blinkScale(0.5)).bands.at(-1)!
    expect(mi.w - G.x - frange).toBeLessThan(0.1 * (I.x - G.x))
    expect(mi.r - Math.min(G.x, G.y)).toBeCloseTo(mi.w - G.x, 9)
    // jamais moins que la frange, meme ferme
    expect(pose(blinkScale(0)).bands.at(-1)!.w - G.x).toBeCloseTo(frange, 9)
    // continu, et monotone
    let avant = pose(blinkScale(0))
    for (let k = blinkScale(0) + 0.002; k < 1; k += 0.002) {
      const p = pose(k)
      expect(p.s).toBeGreaterThan(avant.s)
      expect(p.s - avant.s).toBeLessThan(0.01)
      p.bands.forEach((b, i) => {
        expect(b.w).toBeGreaterThanOrEqual(avant.bands[i]!.w)
        expect(b.w - avant.bands[i]!.w).toBeLessThan(0.01 * (I.x + I.y))
      })
      avant = p
    }
  })

  it('le bord doux : des gelules imbriquees, des paliers egaux de 0 a 1', () => {
    const { bands } = lidMask(oeil(0, 1, 1, 0.5), 0.5, 1, G, I)!
    expect(bands).toHaveLength(LID_BANDS)
    // de la plus large a l'ouverture, toutes de la meme forme : un ecart commun aux trois cotes
    for (let i = 1; i < bands.length; i++) {
      const o = bands[i - 1]!.w - bands[i]!.w
      expect(o).toBeCloseTo((LID_SOFT * 2 * Math.min(G.x, G.y)) / LID_BANDS, 9)
      expect(bands[i - 1]!.h - bands[i]!.h).toBeCloseTo(o, 9)
      expect(bands[i - 1]!.r - bands[i]!.r).toBeCloseTo(o, 9)
    }
    // peintes l'une sur l'autre, l'opacite monte de 1 / LID_BANDS par palier
    let reste = 1
    bands.forEach((b, i) => {
      reste *= 1 - b.alpha
      expect(1 - reste).toBeCloseTo((i + 1) / LID_BANDS, 9)
    })
  })

  it("mi-close au repos (`somnolent`) : une gelule plus courte, pas de paupieres", () => {
    const repos = blinkScale(0.42)
    for (const tilt of [0, 17, -26]) {
      const L = oeil(tilt, 0.95, 1.02, repos)
      // au repos, ni masque ; la gelule est raccourcie de ce que l'ecrasement raccourcit a l'ecran
      expect(lidMask(L, repos, repos, G, I)).toBeNull()
      const t = restCapsule(L, repos, repos, 2 * G.x, 2 * G.y)
      const L0 = oeil(tilt, 0.95, 1.02, 1)
      expect(t.w / (2 * G.x)).toBeCloseTo(Math.hypot(L[0]!, L[1]!) / Math.hypot(L0[0]!, L0[1]!), 9)
      expect(t.h / (2 * G.y)).toBeCloseTo(Math.hypot(L[2]!, L[3]!) / Math.hypot(L0[2]!, L0[3]!), 9)
      // un clignement part de l'oeil de l'expression, sans saut, et se ferme au meme point
      const juste = lidMask(oeil(tilt, 0.95, 1.02, repos - 1e-9), repos - 1e-9, repos, G, I)!
      expect(juste.s).toBeCloseTo(1, 6)
      expect(dedans(juste.bands.at(-1)!, I.x, I.y)).toBe(true)
      expect(lidMask(oeil(tilt, 0.95, 1.02, blinkScale(0)), blinkScale(0), repos, G, I)!.s).toBe(0)
    }
    // ouvert, la gelule de l'oeil telle quelle
    expect(restCapsule(oeil(17, 1, 1, 1), 1, 1, 24, 4)).toEqual({ w: 24, h: 4 })
  })
})
