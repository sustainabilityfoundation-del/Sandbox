import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'

/**
 * Interactive API reference (Scalar, MIT) for an OpenAPI document, served by this host from the
 * installed package: no CDN, no proxy and no external fonts, so it also works offline and in a
 * desktop build. The page is public like the OpenAPI document it renders; trying requests still
 * needs a development identity (X-Dev-User) in development and real authentication in production.
 */
const require = createRequire(import.meta.url)
let script: string | undefined

export function registerApiDocs(app: FastifyInstance, options: { path: string; openapiUrl: string; title: string }) {
  app.get(`${options.path}/scalar.js`, async (_request, reply) => {
    // The browser bundle is not in the package's export map; it sits next to the main entry (dist/).
    script ??= readFileSync(join(dirname(require.resolve('@scalar/api-reference')), 'browser', 'standalone.js'), 'utf8')
    reply.header('content-type', 'application/javascript; charset=utf-8').header('cache-control', 'public, max-age=86400').send(script)
  })
  app.get(options.path, async (_request, reply) => {
    // Local only: no hosted AI agent, MCP generator, toolbar (share/deploy) or telemetry.
    const config = JSON.stringify({ url: options.openapiUrl, withDefaultFonts: false, hideClientButton: true, showToolbar: 'never', telemetry: false, agent: { disabled: true }, mcp: { disabled: true }, metaData: { title: options.title } })
    reply
      .header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.title}</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${options.path}/scalar.js"></script>
    <script>Scalar.createApiReference('#app', ${config})</script>
  </body>
</html>`)
  })
}
