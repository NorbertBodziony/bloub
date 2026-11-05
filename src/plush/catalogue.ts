import type { BotExpression, ExpressionId } from '../bot/expressions.js'
import type { ShapeId } from '../bot/skins.js'
import type { EyeCfg } from '../bot/states.js'

/*
 * Ce que la peluche sait dessiner. Deux sources, qui ne se melangent pas :
 *
 * - les PERSONNAGES : six avatars des captures de reference, corps et patins generes
 *   (Higgsfield) puis recales sur le moteur par `tools/peluche/`. Leur couleur est cuite
 *   dans l'image, leur visage est un vrai `BotExpression` ajuste sur la capture.
 * - les FORMES : un corps gris neutre par forme du personnaliseur, teint a l'execution
 *   (`tint.ts`), tire de la bibliotheque de feutre (`tools/peluche/fit/biblioteka.py`). Les
 *   yeux y portent le patin generique, sauf sur les six expressions qu'une gelule ne fait pas,
 *   qui ont leur dessin (`SPRITE_PADS`).
 *
 * Tous les nombres de ce fichier sont des AJUSTEMENTS (`tools/peluche/`), pas des
 * reglages : les arrondir decale les yeux de leur place sur la capture.
 */

export type PlushCharacterId = 'nexo' | 'vita' | 'cloe' | 'malu' | 'yoshi' | 'fred'

/** Les formes qui ont un corps gris : toutes celles du personnaliseur. */
export type PlushShapeId = Extract<
  ShapeId,
  | 'cercle'
  | 'galet'
  | 'squircle'
  | 'capsule'
  | 'triangle'
  | 'hexagone'
  | 'nuage'
  | 'goutte'
  | 'carre'
  | 'losange'
  | 'pentagone'
>

export const PLUSH_SHAPES: readonly PlushShapeId[] = [
  'cercle',
  'galet',
  'squircle',
  'capsule',
  'triangle',
  'hexagone',
  'nuage',
  'goutte',
  'carre',
  'losange',
  'pentagone'
]

/**
 * Les etats d'une peluche : ceux qui GARDENT le corps. Une peluche ne devient pas un point
 * d'exclamation. `thinking` n'est pas l'etat du moteur (il reduit le corps a un point) :
 * la peluche reste au repos, leve les yeux, et trois boules de feutre pulsent a cote.
 *
 * `asleep` et `failed` n'existent que chez la peluche, et rien n'y est releve : ce sont
 * des visages CHOISIS, poses sur l'etat `idle` du moteur (cf. `motion.ts`). `asleep` n'est
 * pas `sleep`, le point qui rebondit dans la video.
 */
export type PlushState = 'idle' | 'wink' | 'wide' | 'thinking' | 'notify' | 'asleep' | 'failed'
export const PLUSH_STATES: readonly PlushState[] = ['idle', 'wink', 'wide', 'thinking', 'notify', 'asleep', 'failed']

/**
 * Un patin d'oeil, en feutre (`tools/peluche/fit/matiere.py`) : cuit en deux gelules, couchee et
 * debout, faites de la gelule de l'oeil sur lequel il a ete ajuste. Sur une gelule, il est
 * recompose de leurs morceaux a l'echelle de son petit cote (`slices.ts`), jamais etire ; le clin d'oeil,
 * lui, l'ecrase a l'ecran. `dx`, `dy` le decalent a l'ecran, en unites de rayon (le recalage de
 * `ajuste-yeux.py`).
 */
export interface PlushPad {
  /** son identite (`padFade`, `failed`) : l'image couchee */
  file: string
  /** la gelule couchee et la gelule debout (`slices.ts`) */
  images: { x: string; y: string }
  /** le petit cote de la gelule ajustee, en unites de rayon */
  court: number
  /** le patin rond (la gelule sans partie droite) mesure `kw` x `kh` fois ce petit cote */
  kw: number
  kh: number
  dx: number
  dy: number
  /**
   * Un oeil-SPRITE : un dessin d'oeil entier (arc, chevron, coin), pas une gelule. `images.x` et
   * `images.y` sont alors la meme image, posee d'un seul morceau (`spritePieces`), et `court`,
   * `kw`, `kh` ne servent pas.
   */
  sprite?: PlushSprite
}

/**
 * Les proportions d'un oeil-sprite, mesurees par `biblioteka.py` : le feutre occupe `w` x `h`
 * de son image, centre, et sa hauteur vaut `aspect` fois sa largeur.
 */
export interface PlushSprite {
  w: number
  h: number
  aspect: number
}

export interface PlushCharacter {
  id: PlushCharacterId
  /** la forme du moteur sous l'image : c'est elle qui place les yeux */
  shape: ShapeId
  /** la couleur relevee sur la capture (mediane du haut du corps, hors yeux) */
  ink: string
  body: string
  pads: [PlushPad, PlushPad]
  face: BotExpression
}

const oeil = (w: number, h: number, tilt = 0): EyeCfg => ({ w, h, tilt, open: 1 })

/** largeur, hauteur (unites de rayon), dx, dy : tels que `compose2.py --exporte` puis `relief.py` les ont ecrits */
type Patin = [number, number, number, number]

const PATINS: Record<PlushCharacterId, [Patin, Patin]> = {
  nexo: [[0.8463031722054379, 1.1432813538461537, 0.035, -0.065], [0.8463031722054379, 1.1432813538461537, -0.015, -0.058]],
  vita: [[1.1065201648485468, 1.3715440577454037, 0.034055756216271146, -0.05281578999623958], [0.9879326262863181, 0.704834060505008, -0.026029860323685244, -0.05510519721699535]],
  cloe: [[0.7330933320692096, 0.5707016106480031, 0.024552162164021694, -0.038398427223289566], [0.7626944185432071, 0.5431152830931956, -0.041541687753233185, -0.03950575553898529]],
  malu: [[1.0586630508735577, 1.201687371851717, 0.009231984564124829, -0.0044476764477897265], [0.8266234890168364, 0.8621901641452211, -0.026116871314858032, 0.0003016649469345866]],
  yoshi: [[0.8527194256418902, 0.7757119056093287, 0.03916727618687797, 0.007869041986432974], [0.8797267768823489, 0.7829079218623657, -0.028381687537700435, 0.012892774756514975]],
  fred: [[1.7586780224155572, 1.667393362265376, 0.039353114938410254, -0.035566855454058126], [1.8556643796915675, 1.6423739844251715, -0.055407781997306026, -0.03778285688705488]]
}

const pad = (id: string, i: number, eye: EyeCfg, [w, h, dx, dy]: Patin): PlushPad => {
  const court = Math.min(eye.w, eye.h)
  // le patin rond est le sprite de l'ajustement moins la partie droite de la gelule : son cadre aussi
  const dw = eye.w > eye.h ? eye.w - court : 0
  const dh = eye.h > eye.w ? eye.h - court : 0
  const nom = `${id}-oeil${i}`
  return {
    file: `${nom}-x.webp`,
    images: { x: `${nom}-x.webp`, y: `${nom}-y.webp` },
    court,
    kw: (w - dw) / court,
    kh: (h - dh) / court,
    dx,
    dy
  }
}

/**
 * Le visage de chaque personnage, ajuste sur la capture (taille, inclinaison et ecart des
 * yeux, pose de la tete). Son `id` n'est PAS au catalogue des expressions, et c'est voulu :
 * `eyefit.ts` ne connait pas ce visage et rend le decalage de l'etat sans expression, celui
 * contre lequel les patins ont ete recales. Lui donner l'id d'une expression du catalogue
 * deplacerait les yeux.
 */
function personnage(
  id: PlushCharacterId,
  shape: ShapeId,
  ink: string,
  split: number,
  eyes: [EyeCfg, EyeCfg],
  yaw: number,
  pitch: number,
  roll = 0
): PlushCharacter {
  const [p0, p1] = PATINS[id]
  return {
    id,
    shape,
    ink,
    body: `${id}-corps.webp`,
    pads: [pad(id, 0, eyes[0], p0), pad(id, 1, eyes[1], p1)],
    face: { id: `plush-${id}` as ExpressionId, gaze: { yaw, pitch, roll }, split, eyes }
  }
}

export const PLUSH_CHARACTERS: readonly PlushCharacter[] = [
  personnage('nexo', 'squircle', '#e45206', 16, [oeil(0.205, 0.43, -28), oeil(0.205, 0.43, 35)], 1, -7, -1),
  personnage('vita', 'hexagone', '#22c377', 17, [oeil(0.27, 0.51, 3), oeil(0.49, 0.13, -4)], -4, 5, 8),
  personnage('cloe', 'triangle', '#df2986', 20, [oeil(0.33, 0.12, 28), oeil(0.34, 0.11, -26)], 3, 16),
  personnage('malu', 'cercle', '#9a55ef', 15, [oeil(0.23, 0.42, -3), oeil(0.19, 0.18)], 9, 4, -8),
  personnage('yoshi', 'capsule', '#e94741', 18, [oeil(0.3, 0.16, 17), oeil(0.31, 0.15, -18)], 11, 20, 2),
  personnage('fred', 'hexagone', '#efb428', 21, [oeil(0.46, 0.5), oeil(0.48, 0.5)], 7, -3)
]

export const PLUSH_CHARACTER_BY_ID = new Map(PLUSH_CHARACTERS.map((c) => [c.id, c]))

/**
 * Le patin des formes grises, en feutre blanc de la bibliotheque (`biblioteka.py`) : le patin rond
 * est un oeil rond de `surpris`, la partie droite le feutre d'une gelule d'`attentif`. Sans
 * decalage : il n'a ete recale sur aucune capture. `court` ne sert qu'aux tests (`slices.ts`
 * recompose a l'echelle de la gelule de l'oeil) : celui de Fred, le patin qu'il remplace.
 */
const FRED = PLUSH_CHARACTER_BY_ID.get('fred')!
export const GENERIC_PAD: PlushPad = {
  file: 'patin-x.webp',
  images: { x: 'patin-x.webp', y: 'patin-y.webp' },
  court: FRED.pads[0].court,
  kw: 1.3,
  kh: 1.3,
  dx: 0,
  dy: 0
}

/**
 * Les expressions qu'une gelule ne sait pas faire, et que la bibliotheque dessine : arcs
 * (`heureux`, `fier`), chevrons (`hilare`), coins (`colere`), demi-ovales (`blase`), traits en U
 * (`somnolent`). Les dix autres gardent le patin generique et le morph continu du moteur.
 */
export type PlushSpriteExpressionId = Extract<ExpressionId, 'heureux' | 'hilare' | 'colere' | 'fier' | 'blase' | 'somnolent'>

/** largeur, hauteur du feutre dans l'image, et hauteur / largeur : tels que `biblioteka.py` les a ecrits */
type Sprite = [number, number, number]

const SPRITES: Record<PlushSpriteExpressionId, [Sprite, Sprite]> = {
  heureux: [[0.8060453400503779, 0.698356807511737, 0.5586854460093896], [0.8060453400503779, 0.6989079563182528, 0.5569422776911076]],
  hilare: [[0.7681521093285799, 0.8060453400503779, 1.2623762376237624], [0.7687687687687688, 0.8060453400503779, 1.25]],
  colere: [[0.8060453400503779, 0.732831291446555, 0.657258064516129], [0.8080808080808081, 0.732904679213404, 0.6550335570469799]],
  fier: [[0.8060453400503779, 0.636748036811996, 0.4218455743879473], [0.8080808080808081, 0.6364507834687643, 0.41965973534971646]],
  blase: [[0.8060453400503779, 0.6869668380317496, 0.532399299474606], [0.8060453400503779, 0.6889323248633183, 0.5296167247386759]],
  somnolent: [[0.8060453400503779, 0.6238850738021943, 0.4016260162601626], [0.8080808080808081, 0.6294815660892188, 0.40522875816993464]]
}

const sprite = (expr: PlushSpriteExpressionId, i: 0 | 1): PlushPad => {
  const [w, h, aspect] = SPRITES[expr][i]
  const file = `oeil-${expr}-${i}.webp`
  return { file, images: { x: file, y: file }, court: 0, kw: 1, kh: 1, dx: 0, dy: 0, sprite: { w, h, aspect } }
}

/** Les yeux-sprites d'une forme grise, par expression : l'oeil gauche (0), puis le droit. */
export const SPRITE_PADS = Object.fromEntries(
  (Object.keys(SPRITES) as PlushSpriteExpressionId[]).map((e) => [e, [sprite(e, 0), sprite(e, 1)] as const])
) as Record<PlushSpriteExpressionId, readonly [PlushPad, PlushPad]>

export const spritePadsOf = (id: string): readonly [PlushPad, PlushPad] | null =>
  Object.hasOwn(SPRITE_PADS, id) ? SPRITE_PADS[id as PlushSpriteExpressionId] : null

/**
 * La couleur par defaut de chaque forme : celle de son corps dans la bibliotheque (mediane de
 * l'interieur, `biblioteka.py`). `color` la remplace.
 */
export const SHAPE_INKS: Record<PlushShapeId, string> = {
  carre: '#bb8bd3',
  cercle: '#efb215',
  hexagone: '#94cc9f',
  capsule: '#f87275',
  nuage: '#5ac2eb',
  galet: '#f19e74',
  squircle: '#ccaddc',
  triangle: '#0ebab2',
  goutte: '#ee8294',
  losange: '#f49053',
  pentagone: '#6b96e3'
}

/** Corps gris d'une forme, et la boule de feutre (points de reflexion, pastille). */
export const shapeBody = (shape: PlushShapeId) => `forme-${shape}.webp`
export const BALL = 'boule.webp'
