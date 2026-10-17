// The deployed site's root. The hosted build output (dist/) holds the workspace at /workspace/ and the GLB viewer at /viewer/;
// this writes dist/index.html so that "/" goes to /workspace/ on any static host (Amplify Hosting today, S3 behind CloudFront later,
// where the edge function also answers "/" with a 302). Development is unchanged: `npm run dev` serves the workspace at
// /workspace/ and the viewer's dev server is its own (`npm run dev:viewer`).
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const WORKSPACE_PATH = '/workspace/'
export const VIEWER_PATH = '/viewer/'

export function redirectPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opening the workspace</title>
    <meta http-equiv="refresh" content="0; url=${WORKSPACE_PATH}" />
    <link rel="canonical" href="${WORKSPACE_PATH}" />
    <meta name="robots" content="noindex" />
    <script>location.replace(${JSON.stringify(WORKSPACE_PATH)} + location.search + location.hash)</script>
  </head>
  <body>
    <p>Opening the <a href="${WORKSPACE_PATH}">workspace</a>. The 3D model viewer is at <a href="${VIEWER_PATH}">${VIEWER_PATH}</a>.</p>
  </body>
</html>
`
}

/** Writes <distDir>/index.html and removes the files an earlier build left at the root when the viewer was served there. */
export function writeRootRedirect(distDir) {
  mkdirSync(distDir, { recursive: true })
  for (const stale of ['assets', 'models', 'favicon.svg']) {
    const target = path.join(distDir, stale)
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  }
  writeFileSync(path.join(distDir, 'index.html'), redirectPage())
}
