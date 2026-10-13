import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone development harness: the tool with a mock platform host and sample data.
export default defineConfig({
  root: 'harness',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist-harness', emptyOutDir: true },
})
