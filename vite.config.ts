/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is large by nature; keep it in its own cacheable chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      // Two pages: the standalone GLB viewer and the engineering workspace.
      input: {
        viewer: resolve(__dirname, 'index.html'),
        workspace: resolve(__dirname, 'workspace/index.html'),
      },
      output: {
        // Explicit vendor chunks. React gets its own chunk so the workspace page
        // doesn't download three.js until the 3D tool is opened.
        manualChunks(id) {
          // Bundler helpers (e.g. the lazy-import preload helper) are needed by
          // every page, like React; keep them out of the three.js chunks.
          if (id.startsWith('\0')) return 'react'
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/]three[\\/]/.test(id)) return 'three'
          if (/node_modules[\\/](@react-three|three-stdlib)[\\/]/.test(id)) return 'r3f'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})
