import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The engineering workspace, served under /workspace/ (dev and production).
export default defineConfig({
  base: '/workspace/',
  plugins: [react(), tailwindcss()],
  // The browser talks only to the application backend (services/api); it never reaches PostgreSQL.
  server: { proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` } },
  // Pre-bundle the CAD kernel at start-up: discovering it on first CAD use made Vite reload the page in
  // development, interrupting work in progress (for example an assistant reply).
  optimizeDeps: { include: ['replicad', 'replicad-opencascadejs'] },
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
          // Lucide: only the icons named in the registry are included (tree-shaken), in their own chunk.
          if (/node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons'
          if (/node_modules[\\/](react-aria-components|react-aria|react-stately|@react-aria|@react-stately|@react-types|@internationalized)[\\/]/.test(id)) return 'react-aria'
          return undefined
        },
      },
    },
  },
})
