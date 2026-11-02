import { DOT_PEAK, DOT_R, DOT_X } from '../bot/decor.js'
import { BotEngine, type Look } from '../bot/engine.js'
import { EXPRESSION_BY_ID, type BotExpression, type ExpressionId } from '../bot/expressions.js'
import { blinkScale } from '../bot/face.js'
import { clamp, easings, lerp, TAU } from '../bot/math.js'
import { dotPulse, STATE_BY_ID, type StateId } from '../bot/states.js'
import type { GazeScript } from '../ui/gaze.js'
import type { PlushPad, PlushState } from './catalogue.js'

/*
 * Le mouvement d'une peluche, sans DOM : ce que `PlushBot` envoie au moteur, et ce que
 * `layer.tsx` dessine en plus. Aucune duree n'est inventee ici — chaque transition prend
 * celle de l'etat du moteur qu'elle remplace (`morph`), et les points de reflexion pulsent
 * avec la fonction meme de l'etat `thinking`. Le corps, lui, ne bouge jamais.
 */

/**
 * L'etat du moteur sous un etat de peluche. `thinking`, `asleep` et `failed` gardent le
 * corps au repos : le moteur reste sur `idle`, la peluche ne change que le visage et le decor.
 */
export const engineState = (state: PlushState): StateId =>
  state === 'thinking' || state === 'asleep' || state === 'failed' ? 'idle' : state

/**
 * Duree d'arrivee dans un etat : le `morph` de l'etat du moteur du meme nom. `asleep` prend
 * celui de `sleep` (l'endormissement de la video), `failed` celui du repos, qu'il garde.
 */
export const morphOf = (state: PlushState): number =>
  STATE_BY_ID.get(state === 'asleep' ? 'sleep' : state === 'failed' ? 'idle' : state)!.morph

/**
 * La derive du regard au repos, reduite : c'est celle que les six personnages ont eue
 * pendant tout l'essai, celle que l'utilisateur a validee. `mix` nul : le regard reste
 * celui de la pose (le visage au repos, le regard releve d'un clin d'oeil).
 */
export const REST_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 0.4 }

/**
 * Le regard pendant `thinking` : en haut, du cote des points. CHOISI, pas releve — la video
 * n'a pas de peluche qui reflechit. Sous le tangage du visage `neutre` (28,6°), donc aucun
 * oeil ne passe le limbe.
 */
export const THINK_LOOK: Look = { yaw: 18, pitch: 22, mix: 1, spin: 0, wander: 0.4 }

/**
 * Le regard endormi : la derive presque eteinte (les yeux fermes ne cherchent rien) et plus
 * aucun clignement : des yeux fermes ne clignent pas. CHOISI.
 */
export const ASLEEP_LOOK: Look = { yaw: 0, pitch: 0, mix: 0, spin: 0, wander: 0.15, blink: 0 }

/** Le regard d'un etat : `thinking` vise les points, `asleep` dort, les autres sont au repos. */
export const lookOf = (state: PlushState): Look =>
  state === 'thinking' ? THINK_LOOK : state === 'asleep' ? ASLEEP_LOOK : REST_LOOK

const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t),
  // absent des deux cotes = absent : le moteur rend alors l'image d'avant, a l'octet pres
  ...(a.blink === undefined && b.blink === undefined ? {} : { blink: lerp(a.blink ?? 1, b.blink ?? 1, t) })
})

/**
 * Un regard qui glisse de `from` a `to` en `duration`, avec la courbe des morphs du moteur.
 * Le composant applique un script image par image (rattrapage d'1/60 s) : c'est donc au
 * script d'etre continu, et il l'est parce que `from` est le dernier regard rendu.
 */
export const glide =
  (from: Look, to: Look, duration: number): GazeScript =>
  (t) =>
    lerpLook(from, to, easings.easeOutQuint(clamp(t / duration)))

/*
 * `failed` : un « non » de la tete a l'arrivee, fait par les seuls yeux — le corps ne bouge
 * pas. Deux allers-retours en lacet, enveloppe en demi-sinus pour partir et finir a zero.
 * CHOISI : la video n'a pas de bot qui echoue.
 */
/** amplitude du « non », en degres de lacet */
export const SHAKE_YAW = 12
/** duree du « non » : deux allers-retours */
export const SHAKE = 0.8
export const shake = (t: number): number =>
  t <= 0 || t >= SHAKE ? 0 : SHAKE_YAW * Math.sin((2 * TAU * t) / SHAKE) * Math.sin((Math.PI * t) / SHAKE)

/**
 * Le script de regard a l'entree dans un etat, depuis le dernier regard rendu : un glissement
 * vers le regard de l'etat, et le « non » de `failed` par-dessus. Le « non » passe par `spin`,
 * qui s'ajoute au lacet quel que soit `mix` : il secoue le regard de la pose, pas une cible.
 */
export function enter(from: Look, state: PlushState): GazeScript {
  const g = glide(from, lookOf(state), morphOf(state))
  if (state !== 'failed') return g
  return (t) => {
    const l = g(t)
    return { ...l, spin: l.spin + shake(t) }
  }
}

/*
 * Les visages des deux etats CHOISIS. Ils remplacent l'expression demandee, comme `wink` et
 * `wide` gardent la leur : c'est l'etat qui parle.
 */
const somnolent = EXPRESSION_BY_ID.get('somnolent')!
/**
 * L'oeil ferme : un tiret, vers lequel le patin s'ecrase en s'effacant, et que la couche
 * remplace par une couture en arc (`layer.tsx`). L'epaisseur est celle de l'oeil ferme du
 * clin d'oeil, lue sur l'etat `wink` ; la largeur est CHOISIE — celle du clin d'oeil (0,447)
 * colle les deux yeux l'un a l'autre sur la peluche.
 */
const TIRET = { w: 0.3, h: STATE_BY_ID.get('wink')!.pose(0).eyes[1]!.h, open: 1, tilt: 0 }

/**
 * Endormi : les deux yeux fermes, avec le regard tombant et l'ecart de `somnolent`, le
 * visage d'avant le sommeil. Pas au catalogue des expressions, comme les visages des
 * personnages.
 */
export const ASLEEP_FACE: BotExpression = {
  id: 'plush-asleep' as ExpressionId,
  gaze: somnolent.gaze,
  split: somnolent.split,
  eyes: [{ ...TIRET }, { ...TIRET }]
}

/*
 * Echoue : la tristesse, mais sur les yeux de la peluche. Le visage `triste` tel quel etire
 * les patins — chacun est la photo d'un oeil, ajustee a la gelule de son personnage (celui
 * de Yoshi, plisse, montait a pres de cinq fois sa hauteur). On garde donc la gelule de la
 * peluche, et on prend a `triste` ce qui ne deforme rien : la pose de la tete (le regard
 * tombe) et l'inclinaison en miroir. Sur une gelule debout, les hauts s'ecartent ; sur une
 * gelule couchee, les bouts interieurs remontent : les deux lisent triste.
 *
 * Deux choses CHOISIES, vues sur les dix-sept peluches :
 * - le visage est symetrique, fait de l'oeil le plus ouvert. Vita et Malu ont deux yeux
 *   differents ; inclines chacun en miroir, ils penchaient du meme cote et lisaient un
 *   regard en coin, pas de la tristesse. Le patin de cet oeil passe aux deux yeux.
 * - un oeil presque rond (Fred) est aplati en gelule couchee, sinon l'inclinaison ne se
 *   voit pas (la regle d'`expressions.test.ts` : largeur/hauteur hors de [0,6 ; 1,7] pour
 *   20° et plus). Aplati par `h`, AVANT l'inclinaison : `open` ecrase a l'ecran, apres la
 *   rotation, et effacerait la pente. Un oeil deja allonge n'est pas touche — l'aplatir le
 *   rapprochait du rond et effacait la pente des formes.
 */
const triste = EXPRESSION_BY_ID.get('triste')!
/** largeur/hauteur d'un oeil rond aplati par `failed` : juste au-dela de la bande ou une pente se perd */
export const FAILED_ASPECT = 1.8
/** un oeil plus rond que ca ne montre pas son inclinaison */
const ROND = [0.6, 1.7] as const

/** l'oeil le plus ouvert d'un visage (aire de la gelule), que `failed` donne aux deux yeux */
export const openEye = (face: BotExpression): 0 | 1 =>
  face.eyes[1].w * face.eyes[1].h > face.eyes[0].w * face.eyes[0].h ? 1 : 0

const echecs = new WeakMap<BotExpression, BotExpression>()
export function failedFace(base: BotExpression): BotExpression {
  let face = echecs.get(base)
  if (!face) {
    const { w, h: h0 } = base.eyes[openEye(base)]
    const h = w / h0 > ROND[0] && w / h0 < ROND[1] ? w / FAILED_ASPECT : h0
    const oeil = (i: 0 | 1) => ({ w, h, tilt: triste.eyes[i].tilt, open: 1 })
    face = { id: `${base.id}-failed` as ExpressionId, gaze: { ...triste.gaze }, split: base.split, eyes: [oeil(0), oeil(1)] }
    echecs.set(base, face)
  }
  return face
}

const patins = new WeakMap<readonly [PlushPad, PlushPad], readonly [PlushPad, PlushPad]>()
/** Les patins de `failed` : celui de l'oeil le plus ouvert, chacun a sa place (`dx`, `dy`). */
export function failedPads(pads: readonly [PlushPad, PlushPad], base: BotExpression): readonly [PlushPad, PlushPad] {
  let out = patins.get(pads)
  if (!out) {
    const p = pads[openEye(base)]
    out = [
      { ...p, dx: pads[0].dx, dy: pads[0].dy },
      { ...p, dx: pads[1].dx, dy: pads[1].dy }
    ]
    patins.set(pads, out)
  }
  return out
}

/**
 * Le passage d'un patin a l'autre en entrant dans `failed` ou en en sortant : un fondu, sur
 * la duree et la courbe du changement de visage du moteur (`SHAPE_MORPH`, easeOutQuint),
 * pendant que la gelule glisse. Une photo ne se deforme pas en une autre ; sans fondu,
 * l'oeil plisse de Vita doublait de largeur d'une image a l'autre. `start` est le niveau
 * d'ou part le nouveau patin : un aller-retour en plein fondu repart de ce qu'on voit.
 */
export interface PadFade {
  from: readonly [PlushPad, PlushPad] | null
  at: number
  start: number
}
export const NO_PAD_FADE: PadFade = { from: null, at: -Infinity, start: 1 }

/** opacite des patins courants ; ceux de `from` ont le complement */
export const padFadeLevel = (fade: PadFade, t: number): number =>
  fade.from ? fade.start + (1 - fade.start) * easings.easeOutQuint(clamp((t - fade.at) / BotEngine.SHAPE_MORPH)) : 1

export const padFadeToggle = (fade: PadFade, from: readonly [PlushPad, PlushPad], t: number): PadFade => ({
  from,
  at: t,
  start: 1 - padFadeLevel(fade, t)
})

/**
 * Agrandir les yeux (`eyeScale`) sans les pousser hors du corps ni les souder. Grandir chacun
 * autour de son centre ne va pas : le regard au repos du moteur porte les yeux contre le bord,
 * en haut a droite, et l'oeil agrandi le traverse ; et des yeux deja proches (`wide`,
 * `notify`, Fred) se touchent. C'est donc le VISAGE entier qui grandit — tailles et ecart
 * ensemble, aucun oeil ne gagne sur l'autre — autour de son point le plus exterieur : le
 * point du visage le plus loin du centre du corps, dans la direction centre -> visage. Ce
 * point reste la ou le moteur l'a pose, avec la marge que le moteur lui a laissee, et le
 * visage gagne sa taille vers l'interieur.
 *
 * `eyes` : la matrice de chaque oeil (a, b, c, d, e, f, e et f deja decales du patin) et la
 * taille de sa gelule. Rend, par oeil, le deplacement de son centre a l'ecran ; sa taille,
 * elle, est multipliee par `scale` dans son repere. Une fonction continue de l'image
 * courante (un `max` de fonctions continues), sans choix ni recherche : rien a faire
 * trembler (cf. `eyefit.ts`).
 */
export function faceGrowth(
  eyes: readonly { m: readonly number[]; w: number; h: number }[],
  scale: number
): { x: number; y: number }[] {
  const nul = eyes.map(() => ({ x: 0, y: 0 }))
  if (scale === 1 || !eyes.length) return nul
  let fx = 0
  let fy = 0
  for (const { m } of eyes) {
    fx += (m[4] ?? 0) / eyes.length
    fy += (m[5] ?? 0) / eyes.length
  }
  const d = Math.hypot(fx, fy)
  if (d < 1e-6) return nul
  const ux = fx / d
  const uy = fy / d
  // la projection sur u du point le plus exterieur du visage
  let bord = -Infinity
  for (const { m, w, h } of eyes) {
    const [a = 1, b = 0, c = 0, dd = 1, e = 0, f = 0] = m
    // la demi-etendue de la gelule le long de u, a l'ecran
    const etendue = Math.hypot((w / 2) * (a * ux + b * uy), (h / 2) * (c * ux + dd * uy))
    bord = Math.max(bord, e * ux + f * uy + etendue)
  }
  // le point fixe : sur l'axe du visage, a hauteur de ce bord
  const ax = fx + (bord - d) * ux
  const ay = fy + (bord - d) * uy
  return eyes.map(({ m }) => ({
    x: (scale - 1) * ((m[4] ?? 0) - ax),
    y: (scale - 1) * ((m[5] ?? 0) - ay)
  }))
}

/** les six nombres d'une chaine `matrix(a,b,c,d,e,f)` */
export const matrixOf = (transform: string): number[] => (transform.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number)

/**
 * La frange du feutre, hors de la gelule, en petits cotes : `dehors` (30 px) sur la gelule de
 * reference (205 px de petit cote) de `tools/peluche/fit/feutre.py`. Les paupieres se posent
 * au-dela : le patin garde son bord de fibres, qui fait la douceur de la paupiere.
 */
export const LID_FRANGE = 30 / 205

/**
 * Douceur du bord des paupieres, au-dela de la frange, en petits cotes (CHOISI, juge a 4x sur
 * Yoshi `curieux`, `fier` et `somnolent`) : ce qui reste de l'ombre portee s'y eteint. A 0,25,
 * c'etait un halo translucide autour du patin.
 */
export const LID_SOFT = 0.1

/** le bord doux en paliers : autant de gelules imbriquees (CHOISI) */
export const LID_BANDS = 4

/**
 * L'ouverture s'elargit de la gelule a toute l'image (ombre portee) en `l^LID_MARGE` (CHOISI) :
 * a l'ouvert tout est visible, sans saut au debut d'un clignement, mais des que l'oeil se ferme
 * un peu, les paupieres suivent la gelule, comme le trou du moteur. A 4, la marge tenait encore
 * a mi-clignement : une gelule bien plus large que le patin, dont les arcs le coupaient presque
 * a plat, un patin rond (Fred) se fermait en carre.
 */
export const LID_MARGE = 8

/** les paupieres d'un oeil qui cligne */
export interface LidMask {
  /** le centre de l'oeil (avant le decalage du patin) et l'ecrasement vertical, a l'ecran, autour de lui */
  x: number
  y: number
  s: number
  /**
   * des gelules imbriquees, dans le repere du patin (sous sa correction), de la plus large a
   * l'ouverture elle-meme : demi-largeur, demi-hauteur, rayon et opacite. Peintes l'une sur
   * l'autre, elles montent par paliers egaux de 0 au bord a 1 dans l'ouverture.
   */
  bands: { w: number; h: number; r: number; alpha: number }[]
}

const FERME = blinkScale(0)

/**
 * Le moteur ferme un oeil en l'ecrasant verticalement A L'ECRAN (`open`, compose en dernier
 * dans la matrice `L = ecrasement . L0`) : c'est la mesure pour le trou du masque plat, mais
 * ecraser une photo de feutre en fait un baton. Le patin est donc pose avec `L0` : cette
 * matrice, `L^-1 . L0`, se met SOUS celle de l'oeil et lui retire l'ecrasement. Oeil
 * ouvert, `undefined` : rien a retirer.
 */
export function unsquash(m: readonly number[], open: number): string | undefined {
  if (open >= 1) return undefined
  const [a = 1, b = 0, c = 0, d = 1] = m
  const b0 = b / open
  const d0 = d / open
  const det = a * d - b * c
  // seule la ligne y de L0 differe de celle de L
  return `matrix(${(d * a - c * b0) / det},${(a * b0 - b * a) / det},${(d * c - c * d0) / det},${(a * d0 - b * c) / det},0,0)`
}

/**
 * La gelule d'un oeil mi-clos AU REPOS (`rest` < 1 : `somnolent`, « paupieres a moitie
 * tombees »), posee sous `L0` : chacun de ses axes est raccourci de ce que l'ecrasement de
 * repos raccourcit son image a l'ecran. C'est une gelule plus courte, recomposee en morceaux
 * comme celle de toute expression, jamais une image ecrasee. Des paupieres qui la coupaient au
 * repos en laissaient un carre, les cotes droits et le haut et le bas fondus.
 */
export function restCapsule(m: readonly number[], open: number, rest: number, w: number, h: number) {
  if (rest >= 1) return { w, h }
  const [a = 1, b = 0, c = 0, d = 1] = m
  const b0 = b / open
  const d0 = d / open
  return {
    w: (w * Math.hypot(a, b0 * rest)) / Math.hypot(a, b0),
    h: (h * Math.hypot(c, d0 * rest)) / Math.hypot(c, d0)
  }
}

/**
 * Un patin qui cligne garde sa forme : la fourrure du corps se ferme dessus, comme des paupieres.
 * Amincir le patin en gelule faisait une autre gelule, pas un oeil qui se ferme ; c'est bon pour
 * une expression au repos (`restCapsule`), pas pour le geste.
 *
 * L'ouverture est la gelule de l'oeil, ecrasee verticalement A L'ECRAN autour de son centre,
 * comme le moteur ecrase le trou du masque plat : ses paupieres sont courbes et suivent
 * l'inclinaison de l'oeil. Une bande horizontale coupait un oeil incline (`curieux`) en
 * parallelogramme flou. L'ecrasement `s` va de 1 (`open` = `rest`, l'oeil de l'expression) a 0
 * (`open` = `blinkScale(0)`) : le moteur garde un trait a l'oeil ferme, une fente de feutre s'y
 * lisait comme un oeil ouvert. La gelule est elargie de la frange du feutre (`LID_FRANGE`) ; a
 * l'ouvert, jusqu'a couvrir toute l'image, ombre comprise, une marge qui part en `l^LID_MARGE`.
 * Bord doux sur `LID_SOFT` petit cote, au-dela. `m` : la matrice de l'oeil ; `gelule` : la demi-taille de la gelule dessinee
 * (`restCapsule`) ; `image` : la demi-etendue de ses morceaux (`padExtent`). Hors clignement,
 * `null` : pas de masque.
 */
export function lidMask(
  m: readonly number[],
  open: number,
  rest: number,
  gelule: { x: number; y: number },
  image: { x: number; y: number }
): LidMask | null {
  if (open >= rest) return null
  const [, , , , e = 0, f = 0] = m
  const l = clamp((open - FERME) / (rest - FERME))
  const r = Math.min(gelule.x, gelule.y)
  // la marge qui fait entrer les coins de l'image dans les coins arrondis de la gelule ; jamais
  // moins que la frange
  const frange = LID_FRANGE * 2 * r
  const tout = Math.max(frange, Math.hypot(image.x - gelule.x + r, image.y - gelule.y + r) - r)
  const marge = frange + l ** LID_MARGE * (tout - frange)
  const doux = LID_SOFT * 2 * r
  const bands = []
  for (let j = LID_BANDS - 1; j >= 0; j--) {
    const o = marge + (doux * j) / LID_BANDS
    // 1 - prod(1 - alpha) des paliers deja peints : (LID_BANDS - j) / LID_BANDS
    bands.push({ w: gelule.x + o, h: gelule.y + o, r: r + o, alpha: 1 / (j + 1) })
  }
  return { x: e, y: f, s: l, bands }
}

/**
 * Le visage qu'impose un etat, ou `null` quand il laisse celui de la peluche. `base` est le
 * visage propre de la peluche (celui du personnage, `neutre` pour une forme).
 */
export const faceOf = (state: PlushState, base: BotExpression): BotExpression | null =>
  state === 'asleep' ? ASLEEP_FACE : state === 'failed' ? failedFace(base) : null

/*
 * Les points de `thinking`, places au-dessus du corps a droite. Rangee, rayons, pulsation
 * et sortie sont ceux de l'etat du moteur (`DOT_X`, `DOT_R`, `DOT_PEAK`, `dotPulse`, 0,3 s),
 * reduits de THINK_SCALE ; la place est CHOISIE, la ou la peluche regarde.
 */
export const THINK_X = 0.62
export const THINK_Y = -1.3
export const THINK_SCALE = 0.6
/** emergence des points, celle de l'etat `thinking` */
export const EMERGE = 0.3

/**
 * Histoire des points, datee sur l'horloge du bot. Les fondus repartent du niveau atteint,
 * et la pulsation n'est pas remise a zero tant que les points sont encore visibles : un
 * aller-retour rapide ne fait sauter ni l'opacite ni les rayons.
 */
export interface DotsTrack {
  /** origine de la pulsation */
  phase: number
  /** entree (ou sortie) la plus recente, et la visibilite d'ou elle part */
  at: number
  from: number
  on: boolean
  /** duree de la sortie : le morph de l'etat d'arrivee */
  exit: number
}

export const NO_DOTS: DotsTrack = { phase: 0, at: -Infinity, from: 0, on: false, exit: 1 }

export function dotsVisibility(track: DotsTrack, t: number): number {
  const k = t - track.at
  if (track.on) return track.from + (1 - track.from) * easings.easeOutCubic(clamp(k / EMERGE))
  return track.from * (1 - easings.easeOutQuint(clamp(k / track.exit)))
}

/** Entree dans `thinking` (`on`) ou sortie vers `next`, a l'instant `t`. */
export function dotsToggle(track: DotsTrack, on: boolean, t: number, next: PlushState): DotsTrack {
  if (on === track.on) return track
  const from = dotsVisibility(track, t)
  return {
    phase: on && from < 1e-3 ? t : track.phase,
    at: t,
    from,
    on,
    exit: morphOf(next)
  }
}

export interface PlushDot {
  x: number
  y: number
  r: number
  opacity: number
}

/** Les trois points a l'instant `t`, en unites de rayon. Vide quand ils sont invisibles. */
export function thinkingDots(track: DotsTrack, t: number): PlushDot[] {
  const v = dotsVisibility(track, t)
  if (v < 1e-3) return []
  return DOT_X.map((x, i) => {
    const k = dotPulse(t - track.phase, i)
    return {
      x: THINK_X + x * THINK_SCALE,
      y: THINK_Y,
      r: DOT_R * THINK_SCALE * (1 + (DOT_PEAK - 1) * k) * (0.5 + 0.5 * v),
      opacity: v * (0.55 + 0.45 * k)
    }
  })
}

/*
 * Les « z » de `asleep`, au-dessus du corps a droite, la ou montent les points de `thinking`.
 * Chacun nait pres de la tete, monte en grandissant et s'efface ; trois a la fois, decales
 * d'un tiers de leur vie. Place, taille et vie sont CHOISIES. Leur visibilite d'ensemble
 * suit une `DotsTrack`, comme les points : entree, sortie et aller-retour sans saut.
 */
/** vie d'un « z », en secondes */
export const Z_LIFE = 3
const Z_COUNT = 3
/** depart et arrivee, en unites de rayon */
const Z_FROM = { x: 0.55, y: -0.74 }
const Z_TO = { x: 1.25, y: -1.38 }
/** cote d'un « z » a la naissance et a la fin */
const Z_SIZE = [0.1, 0.2] as const

export interface PlushZ {
  x: number
  y: number
  /** cote du « z », en unites de rayon */
  size: number
  opacity: number
}

/** Les « z » a l'instant `t`, en unites de rayon. Vide quand ils sont invisibles. */
export function sleepZs(track: DotsTrack, t: number): PlushZ[] {
  const v = dotsVisibility(track, t)
  if (v < 1e-3) return []
  const out: PlushZ[] = []
  for (let i = 0; i < Z_COUNT; i++) {
    const u = ((((t - track.phase) / Z_LIFE - i / Z_COUNT) % 1) + 1) % 1
    // apparait vite, s'efface sur la seconde moitie de sa course
    const alpha = clamp(u / 0.15) * clamp((1 - u) / 0.45)
    if (alpha * v < 1e-3) continue
    out.push({
      x: lerp(Z_FROM.x, Z_TO.x, u) + Math.sin(u * TAU) * 0.04,
      // une montee reguliere : un ease-out les entasserait en haut
      y: lerp(Z_FROM.y, Z_TO.y, u),
      size: lerp(Z_SIZE[0], Z_SIZE[1], u),
      opacity: alpha * v
    })
  }
  return out
}
