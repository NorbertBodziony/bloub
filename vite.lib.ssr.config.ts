import { fileURLToPath, URL } from 'node:url'
import solid from 'vite-plugin-solid'
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
    sourcemap: true,
    ssr: 'src/index.ts',
    rollupOptions: {
      external: [/^solid-js(?:\/|$)/],
      output: { entryFileNames: 'server.js' }
    }
  }
})
