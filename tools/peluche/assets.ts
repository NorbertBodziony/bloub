/*
 * Ecrit `src/plush/assets.ts` : une URL LITTERALE par image de `src/plush/assets/`.
 *
 *   bun tools/peluche/assets.ts
 *
 * Litterale, parce que c'est la seule forme que les bundlers des consommateurs suivent :
 * `new URL('./assets/x.webp', import.meta.url)` est emis avec le paquet et n'est charge
 * que si un bot s'en sert. Un chemin calcule ne serait ni emis ni retrouve.
 *
 * `@vite-ignore` est pour NOTRE build : en mode bibliotheque, Vite incruste toute image en
 * base64, quelle que soit sa taille (1,7 Mo dans `plush.js`). Ignoree, l'URL passe telle
 * quelle dans `dist/package/plush.js`, et `vite.lib.config.ts` copie les images a cote,
 * dans `dist/package/assets/` : le meme chemin relatif qu'ici.
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const racine = join(import.meta.dir, '../../src/plush')
const fichiers = readdirSync(join(racine, 'assets'))
  .filter((f) => f.endsWith('.webp'))
  .sort()

const lignes = fichiers.map((f) => `  '${f}': new URL(/* @vite-ignore */ './assets/${f}', import.meta.url).href`)
writeFileSync(
  join(racine, 'assets.ts'),
  `// Genere par tools/peluche/assets.ts : ne pas editer a la main.
// Une URL litterale par image, pour que le bundler du consommateur les emette ;
// @vite-ignore pour que le build du paquet ne les incruste pas (voir le generateur).
export const ASSET_URLS: Record<string, string> = {
${lignes.join(',\n')}
}
`
)
console.log(fichiers.length, 'images')
