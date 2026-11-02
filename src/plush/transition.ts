/*
 * Le changement de corps de la peluche : forme, personnage ou couleur. Le corps est une
 * photo fixe, donc changer de forme echangeait la photo d'un coup ; cinq facons de passer
 * de l'une a l'autre, au choix par `transition` :
 *
 * - `flip` (par defaut) : la piece tourne autour de l'axe vertical, le corps change quand
 *   elle est de profil, donc l'echange ne se voit jamais ;
 * - `pop` : l'ancien corps rapetisse jusqu'a rien, le nouveau sort avec le pop de la
 *   pastille de `notify` ;
 * - `warp` : le feutre suit le contour que le moteur donne au corps (WebGL, `warp.ts`) ;
 * - `dissolve` : un bruit fixe, seuille, decouvre le nouveau corps ;
 * - `cut` : l'echange d'un coup, seuls les yeux glissent avec le moteur.
 *
 * Ce fichier est pur : une fonction du temps ecoule depuis le changement, qui dit quoi
 * dessiner. Le rendu est dans `body.tsx` et `layer.tsx`.
 *
 * Aucune duree nouvelle : `SHAPE_MORPH` (le morph de forme du moteur) et la courbe du pop
 * de la pastille, lue dans l'etat `notify` lui-meme.
 */
import { BotEngine } from '../bot/engine.js'
import { clamp, easings, lerp } from '../bot/math.js'
import { STATE_BY_ID } from '../bot/states.js'

export const PLUSH_TRANSITIONS = ['flip', 'pop', 'warp', 'dissolve', 'cut'] as const
export type PlushTransition = (typeof PLUSH_TRANSITIONS)[number]
export const DEFAULT_TRANSITION: PlushTransition = 'flip'

const MORPH = BotEngine.SHAPE_MORPH

/*
 * Le pop de la pastille de `notify` : on lit la pose de l'etat plutot que de recopier sa
 * formule. `popCourbe(t)` est le rayon de la pastille a t rapporte a son rayon de repos ;
 * `POP` est l'instant ou elle se pose, cherche au millieme.
 */
const notify = STATE_BY_ID.get('notify')!
const rayonPastille = (t: number) => notify.pose(t).notif?.r ?? 0
const REPOS = rayonPastille(10)
export const popCourbe = (t: number) => rayonPastille(t) / REPOS
export const POP = (() => {
  for (let ms = 1; ms < 5000; ms++) {
    if (rayonPastille(ms / 1000) === REPOS && rayonPastille((ms - 1) / 1000) !== REPOS) return ms / 1000
  }
  return MORPH
})()
/** le rapetissement avant le pop : la moitie du morph de forme */
export const RETRAIT = MORPH / 2

export const DUREE: Record<PlushTransition, number> = {
  cut: MORPH,
  warp: MORPH,
  dissolve: MORPH,
  // un demi-tour de chaque cote de l'instant ou la piece est de profil
  flip: MORPH * 2,
  pop: RETRAIT + POP
}

/** Ce qu'une transition dessine a un instant donne. */
export interface Rendu {
  /** quel(s) corps : l'ancien, le nouveau, ou les deux melanges */
  corps: 'avant' | 'apres' | 'deux'
  /** poids du nouveau corps quand il y en a deux (fondu, seuil de dissolution) */
  melange: number
  /** echelle du groupe corps + yeux, autour du centre */
  sx: number
  sy: number
  /** la forme que le moteur doit avoir : il y place les yeux */
  bascule: boolean
  fini: boolean
}

export const REPOS_AVANT: Rendu = { corps: 'avant', melange: 0, sx: 1, sy: 1, bascule: false, fini: false }
export const REPOS_APRES: Rendu = { corps: 'apres', melange: 1, sx: 1, sy: 1, bascule: true, fini: true }

/**
 * `s` : secondes depuis le changement. Avant (s < 0) on dessine l'ancien corps ; une fois
 * la duree passee, le nouveau, a l'echelle 1.
 */
export function rendu(transition: PlushTransition, s: number): Rendu {
  if (s < 0) return REPOS_AVANT
  const duree = DUREE[transition]
  if (s >= duree) return REPOS_APRES
  const k = s / duree
  switch (transition) {
    case 'cut':
      // la photo change d'un coup ; seuls les yeux glissent, avec le moteur
      return { ...REPOS_APRES, fini: false }
    case 'warp':
    case 'dissolve':
      // meme courbe que le morph de forme du moteur : le feutre et les yeux vont ensemble
      return { corps: 'deux', melange: easings.easeOutQuint(k), sx: 1, sy: 1, bascule: true, fini: false }
    case 'flip': {
      // autour de l'axe vertical : la lumiere en haut a gauche, cuite dans la photo, reste en place
      const e = easings.easeInOutCubic(k)
      const apres = e >= 0.5
      return {
        corps: apres ? 'apres' : 'avant',
        melange: apres ? 1 : 0,
        sx: Math.abs(Math.cos(Math.PI * e)),
        sy: 1,
        bascule: apres,
        fini: false
      }
    }
    case 'pop': {
      if (s < RETRAIT) {
        const e = 1 - easings.easeInOutCubic(s / RETRAIT)
        return { corps: 'avant', melange: 0, sx: e, sy: e, bascule: false, fini: false }
      }
      const t = s - RETRAIT
      // croissance du moteur (easeOutQuint) fois le depassement de la pastille
      const e = easings.easeOutQuint(clamp(t / POP)) * popCourbe(t)
      return { corps: 'apres', melange: 1, sx: e, sy: e, bascule: true, fini: false }
    }
  }
}

/**
 * Les rayons du contour pendant `warp`, a `s` secondes du changement : exactement ceux
 * que le moteur donne au corps (`shapeAtTime`), pour que le feutre reste sous les yeux.
 */
export function rayonsWarp(avant: readonly number[], apres: readonly number[], s: number): number[] {
  const t = easings.easeOutQuint(clamp(s / MORPH))
  return apres.map((r, i) => lerp(avant[i] ?? r, r, t))
}
