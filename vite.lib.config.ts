import { fileURLToPath, URL } from 'node:url'
import solid from 'vite-plugin-solid'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  plugins: [solid()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'dist/package',
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      external: [/^solid-js(?:\/|$)/]
    }
  }
})
