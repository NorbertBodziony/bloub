import { fileURLToPath, URL } from 'node:url'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  plugins: [solid({ ssr: true })],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/package',
    emptyOutDir: false,
    minify: 'oxc',
    ssr: 'src/index.ts',
    rollupOptions: {
      external: [/^@solidjs\/web(?:\/|$)/, /^solid-js(?:\/|$)/],
      output: { entryFileNames: 'server.js' }
    }
  }
})
