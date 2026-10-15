import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone development harness: the CAD Modeler with a mock platform host and sample data.
// The geometric kernel (OCCT WebAssembly) runs in a module Web Worker.
export default defineConfig({
  root: 'harness',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  build: { outDir: '../dist-harness', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
})
