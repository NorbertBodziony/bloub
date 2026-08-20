import { fileURLToPath, URL } from 'node:url'
import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  plugins: [solid()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/package',
    minify: 'oxc',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [/^@solidjs\/web(?:\/|$)/, /^solid-js(?:\/|$)/]
    }
  }
})
