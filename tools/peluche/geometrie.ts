import type { BotEngine, BotFrame } from '../../src/bot/engine.js'

/*
 * Lecture de la geometrie que rend le moteur, partagee par `export-bots.ts` et
 * `formes.ts`. Rien n'est recalcule : on relit le chemin et les matrices du rendu.
 */

/** Les extremites des segments de `closedPath` sont les points du contour, en unites de rayon. */
export function contour(d: string, rayon: number): [number, number][] {
  const n = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const pts: [number, number][] = []
  for (let i = 2 + 4; i < n.length; i += 6) pts.push([n[i]! / rayon, n[i + 1]! / rayon])
  return pts
}

/** Les quatre coefficients lineaires et la translation de `matrix(a,b,c,d,e,f)`. */
export const matrice = (m: string) => m.slice(7, -1).split(',').map(Number)

/**
 * L'instant ou les yeux sont le plus ouverts entre 5 et 15 s : pas de clignement en
 * cours. C'est l'instant ou les corps sont exportes, donc celui ou le composant les pose.
 */
export function instantOuvert(engine: BotEngine): BotFrame {
  let meilleur = engine.sample(5)
  const hauteur = (f: BotFrame) => f.eyes.reduce((s, e) => s + Math.abs(matrice(e.matrix)[3]!), 0)
  for (let t = 5; t < 15; t += 0.05) {
    const f = engine.sample(t)
    if (f.eyes.length === 2 && hauteur(f) > hauteur(meilleur) + 1e-6) meilleur = f
  }
  return meilleur
}
