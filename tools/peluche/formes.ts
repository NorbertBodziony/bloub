/*
 * Les entrees Higgsfield des corps gris : une image 3:2 par forme, la silhouette du
 * moteur a gauche (gris moyen), une petite boule a droite (les points de reflexion et la
 * pastille). Rien n'est redessine : le contour est celui que rend le moteur a l'instant
 * ou les yeux sont le plus ouverts, comme pour les personnages (`export-bots.ts`).
 *
 *   bun tools/peluche/formes.ts <dossier>
 *
 * Ecrit <dossier>/<forme>.svg (a passer a rsvg-convert) et <dossier>/formes.json (contours
 * et yeux, lus par `fit/compose2.py --forme`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BotEngine } from '../../src/bot/engine.js'
import { SHAPES } from '../../src/bot/skins.js'
import { contour, instantOuvert, matrice } from './geometrie.js'

const R = 100
/** Le cadre des generations precedentes : 1536 x 1024, corps centre en (512, 512). */
const LARGEUR = 1536
const HAUTEUR = 1024
const CX = 512
const CY = 512
/** px par unite de rayon : le cercle de Malu faisait 636 px de diametre */
const ECHELLE = 318
const GRIS = '#8c8c8c'

const dossier = process.argv[2]
if (!dossier) throw new Error('usage : bun tools/peluche/formes.ts <dossier>')
mkdirSync(dossier, { recursive: true })

const sortie = SHAPES.map((forme) => {
  const engine = new BotEngine(R, 'idle', forme.radii, null)
  const frame = instantOuvert(engine)
  const pts = contour(frame.bodyPath, R)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(CX + x * ECHELLE).toFixed(1)} ${(CY + y * ECHELLE).toFixed(1)}`).join('') + 'Z'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}">
<rect width="100%" height="100%" fill="#141414"/>
<path d="${d}" fill="${GRIS}"/>
<circle cx="1290" cy="512" r="${0.3 * ECHELLE}" fill="${GRIS}"/>
</svg>`
  writeFileSync(join(dossier, `${forme.id}.svg`), svg)
  return {
    nom: forme.id,
    contour: pts,
    yeux: frame.eyes.map((e) => {
      const [a, b, c, dd, x, y] = matrice(e.matrix) as [number, number, number, number, number, number]
      return { m: [a, b, c, dd, x / R, y / R] }
    })
  }
})

writeFileSync(join(dossier, 'formes.json'), JSON.stringify(sortie, null, 1))
console.log(sortie.map((s) => s.nom).join(' '))
