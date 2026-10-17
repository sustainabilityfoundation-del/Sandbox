import { describe, expect, it } from 'vitest'
import { readAiConfig } from './config'

/** Developer configuration (ADR-0080). The keys below are made-up test strings. */
const KEY = 'sk-test-0123456789abcdef'

describe('readAiConfig', () => {
  it('defaults to user mode (own connections, as before) and ignores keys that happen to be in the environment', () => {
    const { config } = readAiConfig({ OPENAI_API_KEY: KEY }, false)
    expect(config.mode).toBe('user')
    expect(readAiConfig({}, false).config.mode).toBe('user')
    expect(readAiConfig({ EWS_AI_MODE: 'mock' }, false).config.mode).toBe('mock')
    expect(config.developerKeys).toEqual({})
  })

  it('EWS_ASSISTANT_FAKE_PROVIDER=1 is an alias for mock mode', () => {
    expect(readAiConfig({ EWS_ASSISTANT_FAKE_PROVIDER: '1' }, false).config.mode).toBe('mock')
  })

  it('reads provider keys only in development mode, with the Gemini alias', () => {
    const { config } = readAiConfig({ EWS_AI_MODE: 'development', OPENAI_API_KEY: KEY, ANTHROPIC_API_KEY: `${KEY}a`, GOOGLE_AI_API_KEY: `${KEY}g`, XAI_API_KEY: ` ${KEY}x ` }, false)
    expect(config.mode).toBe('development')
    expect(config.developerKeys).toEqual({ openai: KEY, anthropic: `${KEY}a`, google: `${KEY}g`, xai: `${KEY}x` })
    expect(readAiConfig({ EWS_AI_MODE: 'development', GEMINI_API_KEY: 'primary', GOOGLE_AI_API_KEY: 'alias' }, false).config.developerKeys.google).toBe('primary')
  })

  it('development without any key falls back to user mode and says so, without naming a key', () => {
    const r = readAiConfig({ EWS_AI_MODE: 'development' }, false)
    expect(r.config.mode).toBe('user')
    expect(r.warnings.join(' ')).toMatch(/no provider key/)
  })

  it('never reads keys or honours mock and development in production', () => {
    const r = readAiConfig({ NODE_ENV: 'production', EWS_AI_MODE: 'development', OPENAI_API_KEY: KEY, EWS_ASSISTANT_FAKE_PROVIDER: '1' }, true)
    expect(r.config.mode).toBe('user')
    expect(r.config.developerKeys).toEqual({})
    expect(r.config.allowUnverifiedPricing).toBe(false)
  })

  it('budget, optimization and unverified pricing defaults and overrides', () => {
    const dev = readAiConfig({ EWS_AI_MODE: 'development', OPENAI_API_KEY: KEY }, false).config
    expect(dev).toMatchObject({ monthlyBudgetUsd: '25', defaultOptimization: 'balanced', allowUnverifiedPricing: true, billing: 'meter_only' })
    const set = readAiConfig({ EWS_AI_MODE: 'development', OPENAI_API_KEY: KEY, EWS_AI_MONTHLY_DEV_BUDGET_USD: '7.5', EWS_AI_DEFAULT_OPTIMIZATION: 'economy', EWS_AI_ALLOW_UNVERIFIED_PRICING: '0' }, false).config
    expect(set).toMatchObject({ monthlyBudgetUsd: '7.5', defaultOptimization: 'economy', allowUnverifiedPricing: false })
    const bad = readAiConfig({ EWS_AI_MONTHLY_DEV_BUDGET_USD: 'lots', EWS_AI_DEFAULT_OPTIMIZATION: 'fastest' }, false)
    expect(bad.config).toMatchObject({ monthlyBudgetUsd: '25', defaultOptimization: 'balanced' })
    expect(bad.warnings).toHaveLength(2)
  })

  it('no warning contains a key', () => {
    const r = readAiConfig({ EWS_AI_MODE: 'unknown', OPENAI_API_KEY: KEY, EWS_AI_MONTHLY_DEV_BUDGET_USD: KEY }, false)
    expect(JSON.stringify(r.warnings)).not.toContain(KEY)
  })
})
