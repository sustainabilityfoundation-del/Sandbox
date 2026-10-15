import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone development harness: the CAD Modeler with a mock platform host and sample data.
// The geometric kernel (OCCT WebAssembly) runs in a module Web Worker.
export default defineConfig({
  root: 'harness',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // /api is proxied to the API host (npm run dev:api) for ?store=api.
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8799}`, changeOrigin: false } } },
  build: { outDir: '../dist-harness', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
})
