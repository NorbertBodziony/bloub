import type { RenderedEye } from '../bot/engine.js'

/** l'ecart le plus grand qu'on ne publie pas, en pixel d'ecran (pixel physique) */
export const FRACTION_DE_PIXEL = 1 / 32
/**
 * l'etendue de ce que l'oeil dessine autour de son centre, en demi-cotes de la gelule :
 * le patin deborde un peu de la gelule, et `eyeScale` (jusqu'a 1,2) l'agrandit encore
 */
const MARGE_ETENDUE = 1.5

function coefficients(matrice: string): number[] | null {
  const ouverture = matrice.indexOf('(')
  if (!matrice.startsWith('matrix(') || !matrice.endsWith(')')) return null
  const valeurs = matrice.slice(ouverture + 1, -1).split(',').map(Number)
  return valeurs.length === 6 && valeurs.every(Number.isFinite) ? valeurs : null
}

/*
 * Un oeil « a peine bouge » : tout est identique sauf la matrice, et la nouvelle matrice ne
 * deplace aucun point de l'oeil de plus que `tolerance` (unites du viewBox). Un point (x, y)
 * de l'oeil, avec |x| <= W et |y| <= H, se deplace de (Δa x + Δc y + Δe, Δb x + Δd y + Δf) :
 * chaque composante est bornee par la somme des valeurs absolues.
 */
function aPeineBouge(avant: RenderedEye, apres: RenderedEye, tolerance: number): boolean {
  if (avant.d !== apres.d || avant.alpha !== apres.alpha || avant.w !== apres.w || avant.h !== apres.h) return false
  if (avant.open !== apres.open || avant.rest !== apres.rest) return false
  if (avant.matrix === apres.matrix) return true
  const m = coefficients(avant.matrix)
  const n = coefficients(apres.matrix)
  if (!m || !n) return false
  const W = (apres.w / 2) * MARGE_ETENDUE
  const H = (apres.h / 2) * MARGE_ETENDUE
  const dx = Math.abs(n[0]! - m[0]!) * W + Math.abs(n[2]! - m[2]!) * H + Math.abs(n[4]! - m[4]!)
  const dy = Math.abs(n[1]! - m[1]!) * W + Math.abs(n[3]! - m[3]!) * H + Math.abs(n[5]! - m[5]!)
  return Math.hypot(dx, dy) <= tolerance
}

/**
 * Les yeux a publier : ceux d'avant tant qu'aucun ne bouge d'au moins `tolerance` unites
 * du viewBox. Au repos ou presque (`thinking`, une derive lente), le moteur rend une matrice
 * qui change de quelques centiemes a chaque image ; a la taille d'un avatar, c'est un
 * millieme de pixel, et pourtant la page refaisait style, mise en page et peinture. La
 * comparaison se fait avec la DERNIERE image publiee : une derive s'accumule et finit par
 * passer, l'ecart avec le moteur ne depasse jamais `tolerance`. Une tolerance nulle, ou une
 * liste qui change de longueur, publie tout.
 */
export function yeuxStables(avant: RenderedEye[], apres: RenderedEye[], tolerance: number): RenderedEye[] {
  if (!(tolerance > 0) || avant.length !== apres.length) return apres
  for (let i = 0; i < apres.length; i++) {
    if (!aPeineBouge(avant[i]!, apres[i]!, tolerance)) return apres
  }
  return avant
}

/**
 * La largeur de `element` en pixels physiques, a chaque changement de taille ou de densite
 * d'ecran. Sans `ResizeObserver` (rendu serveur, happy-dom), rien : la tolerance reste nulle
 * et chaque image est publiee telle quelle.
 */
export function mesurerPixels(element: Element, rappel: (largeur: number) => void): ResizeObserver | null {
  if (typeof ResizeObserver === 'undefined') return null
  const observateur = new ResizeObserver((entrees) => {
    const entree = entrees[entrees.length - 1]
    if (!entree) return
    const physique = entree.devicePixelContentBoxSize?.[0]?.inlineSize
    if (physique !== undefined) return rappel(physique)
    const css = entree.contentBoxSize?.[0]?.inlineSize ?? entree.contentRect?.width ?? 0
    rappel(css * (window.devicePixelRatio || 1))
  })
  try {
    observateur.observe(element, { box: 'device-pixel-content-box' })
  } catch {
    observateur.observe(element)
  }
  return observateur
}
