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

  it('pins every action to a full commit SHA and runs no install script with the deploy role', () => {
    for (const m of workflow.matchAll(/^\s+- uses: (\S+)/gm)) expect(m[1]).toMatch(/@[0-9a-f]{40}$/)
    const deploy = workflow.slice(workflow.indexOf('  deploy:'))
    const creds = deploy.indexOf('configure-aws-credentials')
    for (const m of deploy.matchAll(/npm ci[^\n]*/g)) {
      expect(m[0]).toContain('--ignore-scripts')
      expect(m.index!).toBeLessThan(creds) // installs and the site build happen before credentials exist
    }
    expect(deploy.indexOf('npm run build')).toBeLessThan(creds)
  })

  it('asks for the OIDC token only in the deploy job and sets no environment', () => {
    const checks = workflow.slice(workflow.indexOf('  checks:'), workflow.indexOf('  deploy:'))
    expect(checks).not.toContain('id-token')
    expect(workflow.match(/id-token: write/g)).toHaveLength(1)
    expect(workflow).not.toMatch(/^\s+environment:/m)
  })
})

describe('CloudFormation execution policies (bootstrap)', () => {
  const files = ['cfn-execution-dev-1.json', 'cfn-execution-dev-2.json'].map((f) => path.join(ROOT, 'infra', 'aws', 'policies', f))
  it('are valid, fit the managed-policy size limit and grant no wildcard administration', () => {
    for (const f of files) {
      const doc = JSON.parse(readFileSync(f, 'utf8')) as { Statement: { Sid: string; Effect: string; Action: string | string[]; Resource: string | string[] }[] }
      expect(JSON.stringify(doc).length).toBeLessThan(6144)
      for (const s of doc.Statement) {
        expect(s.Effect).toBe('Allow')
        for (const a of ([] as string[]).concat(s.Action)) {
          expect(a).not.toBe('*')
          expect(a).not.toMatch(/:\*$/) // no service-wide wildcard
        }
        if (([] as string[]).concat(s.Action).some((a) => /^iam:(Create|Put|Attach|Update)(Role|RolePolicy|User|Policy)/.test(a))) expect(JSON.stringify(s.Resource)).not.toBe('"*"')
      }
    }
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
