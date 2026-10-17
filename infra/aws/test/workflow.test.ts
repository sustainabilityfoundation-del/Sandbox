import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const workflow = readFileSync(path.join(ROOT, '.github', 'workflows', 'deploy-dev.yml'), 'utf8')
const dockerfile = readFileSync(path.join(ROOT, 'services', 'api', 'Dockerfile'), 'utf8')

describe('deploy-dev workflow', () => {
  it('is manual only', () => {
    const triggers = workflow.slice(workflow.indexOf('\non:'), workflow.indexOf('\npermissions:'))
    expect(triggers).toContain('workflow_dispatch:')
    for (const t of ['push:', 'pull_request:', 'pull_request_target:', 'schedule:', 'workflow_run:', 'release:']) expect(triggers).not.toContain(t)
  })

  it('does not deploy unless asked, and needs no secrets beyond the role ARN variable', () => {
    expect(workflow).toMatch(/default: false/)
    expect(workflow).toMatch(/if: \$\{\{ inputs\.deploy \}\}/)
    expect(workflow).not.toMatch(/secrets\./)
    expect(workflow).not.toMatch(/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY/)
    expect(workflow).toContain('vars.AWS_DEPLOY_ROLE_ARN')
  })

  it('asks for the OIDC token only in the deploy job and sets no environment', () => {
    const checks = workflow.slice(workflow.indexOf('  checks:'), workflow.indexOf('  deploy:'))
    expect(checks).not.toContain('id-token')
    expect(workflow.match(/id-token: write/g)).toHaveLength(1)
    expect(workflow).not.toMatch(/^\s+environment:/m)
  })
})

describe('Dockerfile', () => {
  it('is multi-stage, non-root, and never keeps embedded PostgreSQL', () => {
    expect((dockerfile.match(/^FROM /gm) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(dockerfile).toMatch(/^USER node$/m)
    expect(dockerfile).toContain('rm -rf node_modules/embedded-postgres node_modules/@embedded-postgres')
    expect(dockerfile).toContain('EWS_PG=external')
    expect(dockerfile).toContain('EWS_DEPLOYED=1')
    expect(dockerfile).toContain('npm ci --workspace @ews/api')
    expect(dockerfile).not.toMatch(/EWS_PG=embedded/)
    expect(dockerfile).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|XAI_API_KEY/)
  })
})
