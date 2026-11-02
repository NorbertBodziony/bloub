import { cpSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import solid from '@solidjs/vite-plugin'
import { defineConfig, type Plugin } from 'vite'

/*
 * Les images de la peluche, copiees telles quelles a cote de `plush.js`. Leurs URL sont
 * `@vite-ignore` (sinon le mode bibliotheque les incruste en base64) et relatives :
 * `./assets/x.webp` depuis `src/plush/assets.ts` comme depuis `dist/package/plush.js`.
 *
 * Le commentaire est retire de la sortie : laisse, il ferait ignorer ces URL au bundler
 * du CONSOMMATEUR aussi, qui n'emettrait alors aucune image.
 */
export const imagesPeluche = (copie: boolean): Plugin => ({
  name: 'bloub:plush-assets',
  apply: 'build',
  renderChunk(code) {
    if (!code.includes('@vite-ignore')) return null
    return { code: code.replace(/\/\*\s*@vite-ignore\s*\*\/\s*/g, '').replace(/^\/\/ @vite-ignore.*\n/m, ''), map: null }
  },
  writeBundle({ dir }) {
    if (!copie) return
    cpSync(fileURLToPath(new URL('./src/plush/assets', import.meta.url)), `${dir}/assets`, {
      recursive: true,
      filter: (f) => !/\.(png|json)$/.test(f)
    })
  }
})

export default defineConfig({
  publicDir: false,
  plugins: [solid(), imagesPeluche(true)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/package',
    minify: 'oxc',
    /*
     * Deux entrees : `index` (le bot plat) et `plush` (la peluche). Ce qu'elles partagent,
     * le composant et le moteur, va dans un morceau commun : `index.js` n'importe jamais
     * le code de la peluche, et un projet qui utilise les deux n'a qu'un moteur.
     */
    lib: {
      entry: { index: 'src/index.ts', plush: 'src/plush/index.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      external: [/^@solidjs\/web(?:\/|$)/, /^solid-js(?:\/|$)/],
      output: { chunkFileNames: 'chunks/[name]-[hash].js' }
    }
  }
})
