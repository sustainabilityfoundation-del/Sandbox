import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The standalone GLB viewer, served at the site root. The workspace app builds into dist/workspace/.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    // three.js is large by nature; keep it in its own cacheable chunk.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/.test(id)) return 'react'
          if (/node_modules[\\/]three[\\/]/.test(id)) return 'three'
          if (/node_modules[\\/](@react-three|three-stdlib)[\\/]/.test(id)) return 'r3f'
          return undefined
        },
      },
    },
  },
})
