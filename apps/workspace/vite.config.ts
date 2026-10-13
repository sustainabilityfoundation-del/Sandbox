import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The engineering workspace, served under /workspace/ (dev and production).
export default defineConfig({
  base: '/workspace/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../dist/workspace',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.startsWith('\0')) return 'react'
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler|zustand|use-sync-external-store)[\\/]/.test(id)) return 'react'
          // Phosphor ships every weight per icon; only the registered icons are included, in their own chunk.
          if (/node_modules[\\/]@phosphor-icons[\\/]/.test(id)) return 'icons'
          if (/node_modules[\\/](react-aria-components|react-aria|react-stately|@react-aria|@react-stately|@react-types|@internationalized)[\\/]/.test(id)) return 'react-aria'
          return undefined
        },
      },
    },
  },
})
