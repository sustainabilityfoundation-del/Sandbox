import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone development harness: the tool with a mock platform host and sample data.
// /api is proxied to the Requirements API (npm run dev:api, port 8787) so the browser stays same-origin.
export default defineConfig({
  root: 'harness',
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8787}`, changeOrigin: false } } },
  build: { outDir: '../dist-harness', emptyOutDir: true },
})
