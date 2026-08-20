import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  // Le port est ici et pas seulement dans `.claude/launch.json` : c'est celui que
  // le README annonce, il doit donc valoir pour un `bun run dev` nu.
  server: { port: 5190 },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/app'
  }
})
