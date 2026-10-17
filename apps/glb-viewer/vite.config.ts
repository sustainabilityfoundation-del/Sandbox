import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The standalone GLB viewer. Its development server is unchanged (served at "/"). The hosted build lives under /viewer/
// (dist/viewer/), next to the workspace in dist/workspace/; the site root (dist/index.html) redirects to /workspace/
// (scripts/write-root-redirect.mjs, run by `npm run build`).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/viewer/' : '/',
  plugins: [react()],
  build: {
    outDir: '../../dist/viewer',
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
}))
