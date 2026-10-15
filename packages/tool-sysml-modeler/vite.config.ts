import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone harness: the SysML Modeler on a mock platform host. Mode `local` (default) runs the
// repository in the browser; `?mode=api` uses the SysML API (proxied /api → API_PORT, default 8800).
export default defineConfig({
  root: 'harness',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8800}`, changeOrigin: false } } },
  build: { outDir: '../dist-harness', emptyOutDir: true, chunkSizeWarningLimit: 2500 },
})
