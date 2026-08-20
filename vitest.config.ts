import { fileURLToPath, URL } from 'node:url'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  /*
   * Le plugin Solid compile les composants utilises par les tests DOM. Le rendu exporte
   * doit etre celui du composant, pas un second dessin monte a cote.
   *
   * Il ne change rien aux autres : `src/bot/` n'importe aucun composant, et l'environnement
   * reste `node` par defaut — un DOM se demande fichier par fichier, en tete de celui qui en
   * a besoin (`// @vitest-environment happy-dom`). C'est ce qui garde la suite a quelques
   * secondes.
   */
  plugins: [solid()],
  resolve: {
    conditions: ['browser'],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}']
  }
})
