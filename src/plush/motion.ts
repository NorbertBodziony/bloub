import { DOT_PEAK, DOT_R, DOT_X } from '../bot/decor.js'
import type { Look } from '../bot/engine.js'
import { clamp, easings, lerp } from '../bot/math.js'
import { dotPulse, STATE_BY_ID, type StateId } from '../bot/states.js'
import type { GazeScript } from '../ui/gaze.js'
import type { PlushState } from './catalogue.js'

/*
 * Le mouvement d'une peluche, sans DOM : ce que `PlushBot` envoie au moteur, et ce que
 * `layer.tsx` dessine en plus. Aucune duree n'est inventee ici — chaque transition prend
 * celle de l'etat du moteur qu'elle remplace (`morph`), et les points de reflexion pulsent
 * avec la fonction meme de l'etat `thinking`. Le corps, lui, ne bouge jamais.
 */

/** L'etat du moteur sous un etat de peluche. `thinking` garde le corps : il reste au repos. */
export const engineState = (state: PlushState): StateId => (state === 'thinking' ? 'idle' : state)

/** Duree d'arrivee dans un etat : le `morph` de l'etat du moteur du meme nom. */
export const morphOf = (state: PlushState): number => STATE_BY_ID.get(state)!.morph

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

const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t)
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
 * Les points de `thinking`, places au-dessus du corps a droite. Rangee, rayons, pulsation
 * et sortie sont ceux de l'etat du moteur (`DOT_X`, `DOT_R`, `DOT_PEAK`, `dotPulse`, 0,3 s),
 * reduits de THINK_SCALE ; la place est CHOISIE, la ou la peluche regarde.
 */
export const THINK_X = 0.62
export const THINK_Y = -1.3
export const THINK_SCALE = 0.6
/** emergence des points, celle de l'etat `thinking` */
const EMERGE = 0.3

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
