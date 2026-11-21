import { PROFILE_SAMPLES } from './profiles.js'
import {
  hullOfCircles,
  profileFromPolygon,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile
} from './shape.js'

/**
 * Formes et couleurs proposees par le personnalisateur du bot.
 *
 * A la difference des silhouettes d'animation (`profiles.ts`), celles-ci ne sont
 * PAS relevees sur la video : elles sont construites analytiquement d'apres la
 * grille du personnalisateur d'origine. Deux sources distinctes, donc, et c'est
 * volontaire — les etats animes doivent rester fideles a la video, les formes de
 * base sont un choix d'utilisateur.
 */

/**
 * Les identifiants sont enumeres plutot que deduits du tableau : c'est ce qui
 * permet a la couche i18n de verifier A LA COMPILATION que chaque forme a bien
 * sa traduction dans les trois langues (`t(\`shapes.${id}\`)` ne compile que si
 * la cle existe). Un `as const` sur le tableau aurait le meme effet mais
 * rendrait `radii` en lecture seule, alors que le moteur le passe tel quel.
 */
export type ShapeId =
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
  | 'fantome'
  | 'meduse'
  | 'poulpe'

export interface BotShape {
  id: ShapeId
  radii: number[]
}

/** Ramene le rayon maximal a `max` pour que toutes les formes pesent pareil a l'oeil. */
function normalize(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii)
  if (peak <= 0) return radii
  const k = max / peak
  return radii.map((r) => r * k)
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2)

/** Galet : cercle deforme par deux harmoniques basses, donc irregulier mais lisse. */
const pebble = normalize(
  ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
  1.02
)

/** Nuage : union de bosses, large en bas, deux lobes en haut. */
const cloud = normalize(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.2, r: 0.54 },
    { x: 0.46, y: 0.2, r: 0.5 },
    { x: 0.02, y: 0.3, r: 0.6 },
    { x: -0.24, y: -0.3, r: 0.48 },
    { x: 0.3, y: -0.24, r: 0.44 }
  ]),
  1.02
)

/** Goutte : gros disque en bas, pointe effilee en haut. */
const droplet = normalize(
  profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
  1.04
)

/**
 * Les rayons les plus grands, angle par angle : l'union de plusieurs profils. Exacte
 * tant que chaque morceau est vu depuis l'origine sans se cacher lui-meme, ce qui est le
 * cas des rectangles qui la contiennent et des bosses posees sur leur bord.
 */
function union(...profiles: number[][]): number[] {
  return profiles[0]!.map((_, i) => Math.max(...profiles.map((p) => p[i]!)))
}

function rectangle(x0: number, y0: number, x1: number, y1: number): number[] {
  return profileFromPolygon(
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 }
    ],
    0,
    0
  )
}

/**
 * Ourlet : `n` bosses de rayon `r` reparties sur [-demi, demi] a la hauteur `y`, relevees
 * de `releve * t^2` vers les bords (t de -1 a 1). C'est le releve qui ecarte les pattes du
 * poulpe et arrondit la frange de la meduse.
 */
function hem(n: number, demi: number, y: number, r: number, releve = 0) {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * 2 - 1
    return { x: t * demi, y: y - releve * t * t, r }
  })
}

/*
 * Les trois personnages : une tete ronde, un corps droit, un ourlet de bosses. Ils pesent
 * comme le nuage (aire ~0.78 du cercle) une fois normalises a 1.1 : a 1.04 comme les
 * autres, le fantome, etroit, paraissait plus petit que tout le reste de la grille.
 */

/** Fantome : dome, flancs droits, trois bosses en bas. */
const ghost = normalize(
  union(unionOfCirclesProfile([{ x: 0, y: -0.12, r: 0.8 }]), rectangle(-0.8, -0.12, 0.8, 0.62), unionOfCirclesProfile(hem(3, 0.54, 0.66, 0.27))),
  1.1
)

/** Meduse : demi-ellipse large et basse, frange de six petites bosses. */
const jellyfish = normalize(
  union(
    profileFromPolygon(
      Array.from({ length: 41 }, (_, i) => {
        const a = Math.PI + (i / 40) * Math.PI
        return { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.86 + 0.18 }
      }),
      0,
      0
    ),
    rectangle(-0.9, 0, 0.9, 0.3),
    unionOfCirclesProfile(hem(6, 0.72, 0.38, 0.17, 0.08))
  ),
  1.1
)

/** Poulpe : tete ronde, quatre pattes qui s'ecartent vers les bords. */
const octopus = normalize(
  union(unionOfCirclesProfile([{ x: 0, y: -0.18, r: 0.78 }]), rectangle(-0.66, -0.1, 0.66, 0.5), unionOfCirclesProfile(hem(4, 0.78, 0.6, 0.22, 0.16))),
  1.1
)

/** Capsule couchee : enveloppe de deux disques cote a cote. */
const capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0)

export const SHAPES: BotShape[] = [
  { id: 'cercle', radii: new Array(PROFILE_SAMPLES).fill(1) },
  { id: 'galet', radii: pebble },
  // 1.15 et pas 1.02 : sur une superellipse le rayon maximal est la diagonale,
  // donc normaliser dessus donne une forme qui parait plus petite que le cercle.
  { id: 'squircle', radii: normalize(superellipseProfile(4.2), 1.15) },
  { id: 'capsule', radii: capsule },
  // -90deg : un sommet vers le haut de l'ecran (y est oriente vers le bas)
  { id: 'triangle', radii: regularPolygonProfile(3, 1.12, 0.34, -90) },
  // 0deg : sommets a gauche et a droite, donc aretes du haut et du bas plates
  { id: 'hexagone', radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
  { id: 'nuage', radii: cloud },
  { id: 'goutte', radii: droplet },
  // 45deg : les sommets dans les coins, donc des aretes droites en haut et en bas.
  // Arrondi plus serre que le squircle, c'est ce qui l'en distingue.
  { id: 'carre', radii: regularPolygonProfile(4, 1.2, 0.24, 45) },
  // -90deg : une pointe vers le haut
  { id: 'losange', radii: regularPolygonProfile(4, 1.14, 0.3, -90) },
  { id: 'pentagone', radii: regularPolygonProfile(5, 1.08, 0.28, -90) },
  { id: 'fantome', radii: ghost },
  { id: 'meduse', radii: jellyfish },
  { id: 'poulpe', radii: octopus }
]

// Map indexee par `string` et non par `ShapeId` : les appelants interrogent avec
// une valeur relue du localStorage ou d'une prop, donc non validee.
export const SHAPE_BY_ID = new Map<string, BotShape>(SHAPES.map((s) => [s.id, s]))
export const DEFAULT_SHAPE = 'cercle'

export type ColorId =
  | 'encre'
  | 'creme'
  | 'brun'
  | 'rouge'
  | 'orange'
  | 'ambre'
  | 'vert'
  | 'turquoise'
  | 'bleu'
  | 'violet'
  | 'rose'
  | 'gris'

export interface BotColor {
  id: ColorId
  hex: string
}

/** Palette du personnalisateur d'origine. */
export const COLORS: BotColor[] = [
  { id: 'encre', hex: '#0a0a0c' },
  { id: 'brun', hex: '#8b5e3c' },
  { id: 'rouge', hex: '#e8483f' },
  { id: 'orange', hex: '#f08a24' },
  { id: 'ambre', hex: '#f0b429' },
  { id: 'vert', hex: '#3ecf8e' },
  { id: 'turquoise', hex: '#2fbfa0' },
  { id: 'bleu', hex: '#3b93f0' },
  { id: 'violet', hex: '#8b5cf6' },
  { id: 'rose', hex: '#e152b0' },
  { id: 'gris', hex: '#a3a3a3' },
  { id: 'creme', hex: '#f1efe9' }
]

export const COLOR_BY_ID = new Map<string, BotColor>(COLORS.map((c) => [c.id, c]))
export const DEFAULT_COLOR = 'encre'

/** Melange deux couleurs hex. Sert a la brume de profondeur des particules. */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const v = parseInt(h.slice(1), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const a = parse(from)
  const b = parse(to)
  const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
