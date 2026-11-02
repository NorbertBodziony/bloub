import { fileURLToPath, URL } from 'node:url'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
import { imagesPeluche } from './vite.lib.config.ts'

export default defineConfig({
  publicDir: false,
  plugins: [solid({ ssr: true }), imagesPeluche(false)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/package',
    emptyOutDir: false,
    minify: 'oxc',
    ssr: true,
    rollupOptions: {
      input: { index: 'src/index.ts', plush: 'src/plush/index.ts' },
      external: [/^@solidjs\/web(?:\/|$)/, /^solid-js(?:\/|$)/],
      output: {
        entryFileNames: (chunk) => (chunk.name === 'index' ? 'server.js' : `${chunk.name}-server.js`),
        chunkFileNames: 'chunks/[name]-server-[hash].js'
      }
    }
  }
})
