// node scripts/write-root-redirect.mjs [distDir]   (run by `npm run build` after the viewer and workspace builds)
import path from 'node:path'
import { writeRootRedirect } from './lib/root-redirect.mjs'

const dist = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', 'dist'))
writeRootRedirect(dist)
console.log(`Wrote ${path.join(dist, 'index.html')}: / redirects to /workspace/ (viewer at /viewer/).`)
